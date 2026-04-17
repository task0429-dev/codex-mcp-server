#!/usr/bin/env node
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function makePushToken(name) {
  const raw = String(name || "rex-heartbeat");
  const base = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "heartbeat";
  const suffix = Math.abs([...raw].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) | 0, 7)).toString(36);
  return `${base}-${suffix}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveStatusFile() {
  return path.resolve(process.env.REX_DAEMON_STATUS_FILE || "./docker-data/ops/rex-monitoring-daemon-status.json");
}

function writeDaemonStatus(statusFile, payload) {
  const nextPayload = {
    updated_at: new Date().toISOString(),
    ...payload,
  };
  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.writeFileSync(statusFile, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
}

async function waitForKuma(baseUrl, timeoutMs = 120000) {
  const started = Date.now();
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/dashboard`;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(healthUrl, { method: "GET" });
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for Kuma at ${healthUrl}`);
}

function runProvisionOnce() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["rex-monitor-provision.mjs"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolve(code || 0));
  });
}

function buildHeartbeatUrl() {
  if (process.env.REX_DAEMON_HEARTBEAT_PUSH_URL) return process.env.REX_DAEMON_HEARTBEAT_PUSH_URL;

  const monitorName = process.env.REX_DAEMON_HEARTBEAT_MONITOR_NAME || "HEARTBEAT - Rex Agent Loop";
  const baseUrl = process.env.UPTIME_KUMA_URL || "http://uptime-kuma:3001";
  const token = makePushToken(monitorName);
  return `${baseUrl.replace(/\/$/, "")}/api/push/${token}`;
}

async function sendHeartbeat(pushUrl, status, msg) {
  const url = new URL(pushUrl);
  url.searchParams.set("status", status);
  url.searchParams.set("msg", msg);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`Heartbeat failed: ${res.status}`);
}

async function main() {
  const kumaUrl = process.env.UPTIME_KUMA_URL || "http://uptime-kuma:3001";
  const syncEverySec = Number(process.env.REX_DAEMON_SYNC_INTERVAL_SEC || 300);
  const heartbeatEverySec = Number(process.env.REX_DAEMON_HEARTBEAT_INTERVAL_SEC || 30);
  const pushUrl = buildHeartbeatUrl();
  const statusFile = resolveStatusFile();
  const state = {
    started_at: new Date().toISOString(),
    pid: process.pid,
    kuma_url: kumaUrl,
    heartbeat_url: pushUrl,
    sync_interval_sec: syncEverySec,
    heartbeat_interval_sec: heartbeatEverySec,
    phase: "booting",
    last_sync_at: null,
    last_sync_ok: null,
    last_sync_exit_code: null,
    last_heartbeat_at: null,
    last_heartbeat_ok: null,
    last_error: null,
  };

  writeDaemonStatus(statusFile, state);

  await waitForKuma(kumaUrl);
  state.phase = "readying";
  state.last_error = null;
  writeDaemonStatus(statusFile, state);

  const firstSync = await runProvisionOnce();
  state.last_sync_at = new Date().toISOString();
  state.last_sync_ok = firstSync === 0;
  state.last_sync_exit_code = firstSync;
  if (firstSync !== 0) {
    state.last_error = `initial sync failed with code ${firstSync}`;
    process.stderr.write(`[rex-monitoring-daemon] initial sync failed with code ${firstSync}\n`);
  } else {
    state.last_error = null;
  }
  writeDaemonStatus(statusFile, state);

  try {
    await sendHeartbeat(pushUrl, "up", "rex-daemon-start");
    state.last_heartbeat_at = new Date().toISOString();
    state.last_heartbeat_ok = true;
    state.last_error = null;
  } catch (error) {
    state.last_heartbeat_at = new Date().toISOString();
    state.last_heartbeat_ok = false;
    state.last_error = `initial heartbeat failed: ${error.message}`;
    process.stderr.write(`[rex-monitoring-daemon] initial heartbeat failed: ${error.message}\n`);
  }
  state.phase = "running";
  writeDaemonStatus(statusFile, state);

  const heartbeatTimer = setInterval(async () => {
    try {
      await sendHeartbeat(pushUrl, "up", "rex-daemon-ok");
      state.last_heartbeat_at = new Date().toISOString();
      state.last_heartbeat_ok = true;
      state.last_error = null;
      writeDaemonStatus(statusFile, state);
      process.stdout.write(`[rex-monitoring-daemon] heartbeat ok ${new Date().toISOString()}\n`);
    } catch (error) {
      state.last_heartbeat_at = new Date().toISOString();
      state.last_heartbeat_ok = false;
      state.last_error = `heartbeat fail ${error.message}`;
      writeDaemonStatus(statusFile, state);
      process.stderr.write(`[rex-monitoring-daemon] heartbeat fail ${error.message}\n`);
    }
  }, heartbeatEverySec * 1000);

  const syncTimer = setInterval(async () => {
    const code = await runProvisionOnce();
    state.last_sync_at = new Date().toISOString();
    state.last_sync_ok = code === 0;
    state.last_sync_exit_code = code;
    if (code !== 0) {
      state.last_error = `sync failed with code ${code}`;
      writeDaemonStatus(statusFile, state);
      process.stderr.write(`[rex-monitoring-daemon] sync failed with code ${code}\n`);
    } else {
      state.last_error = null;
      writeDaemonStatus(statusFile, state);
      process.stdout.write(`[rex-monitoring-daemon] sync ok ${new Date().toISOString()}\n`);
    }
  }, syncEverySec * 1000);

  const shutdown = (signal) => {
    state.phase = "stopping";
    state.last_error = `received ${signal}`;
    writeDaemonStatus(statusFile, state);
    clearInterval(heartbeatTimer);
    clearInterval(syncTimer);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await new Promise(() => {});
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exit(1);
});
