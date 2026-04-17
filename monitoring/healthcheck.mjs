#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const statusFile = process.env.REX_DAEMON_STATUS_FILE || "./docker-data/ops/rex-monitoring-daemon-status.json";
const syncEverySec = Number(process.env.REX_DAEMON_SYNC_INTERVAL_SEC || 300);
const heartbeatEverySec = Number(process.env.REX_DAEMON_HEARTBEAT_INTERVAL_SEC || 30);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(statusFile)) {
  fail(`status file missing: ${statusFile}`);
}

const status = JSON.parse(fs.readFileSync(statusFile, "utf8"));
const now = Date.now();

if (status.phase !== "running") {
  fail(`daemon not running: ${status.phase || "unknown"}`);
}

if (!status.last_sync_at || !status.last_sync_ok) {
  fail("latest sync is missing or failed");
}

if (!status.last_heartbeat_at || !status.last_heartbeat_ok) {
  fail("latest heartbeat is missing or failed");
}

const lastSyncAgeMs = now - Date.parse(status.last_sync_at);
const lastHeartbeatAgeMs = now - Date.parse(status.last_heartbeat_at);
const maxSyncAgeMs = Math.max(syncEverySec * 3, 600) * 1000;
const maxHeartbeatAgeMs = Math.max(heartbeatEverySec * 3, 90) * 1000;

if (!Number.isFinite(lastSyncAgeMs) || lastSyncAgeMs > maxSyncAgeMs) {
  fail(`sync is stale: ${status.last_sync_at}`);
}

if (!Number.isFinite(lastHeartbeatAgeMs) || lastHeartbeatAgeMs > maxHeartbeatAgeMs) {
  fail(`heartbeat is stale: ${status.last_heartbeat_at}`);
}

process.stdout.write("ok\n");
