#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mapPath = path.join(root, "monitoring", "rex-heartbeat-map.generated.json");
const monitorName = process.env.REX_HEARTBEAT_MONITOR || "HEARTBEAT - Rex Agent Loop";
const intervalMs = Number(process.env.REX_HEARTBEAT_INTERVAL_MS || 30000);

function getPushUrl() {
  if (process.env.REX_HEARTBEAT_URL) return process.env.REX_HEARTBEAT_URL;
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const entry = (map.heartbeats || []).find((h) => h.name === monitorName);
  if (!entry?.push_url) throw new Error(`Push URL not found for ${monitorName}`);
  return entry.push_url;
}

async function ping(status = "up", msg = "rex-agent-loop-ok") {
  const base = getPushUrl();
  const url = new URL(base);
  url.searchParams.set("status", status);
  url.searchParams.set("msg", msg);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Heartbeat failed: ${response.status}`);
  return response.status;
}

async function run() {
  await ping("up", "rex-agent-loop-start");
  setInterval(async () => {
    try {
      await ping("up", "rex-agent-loop-ok");
      process.stdout.write(`[rex-heartbeat] ok ${new Date().toISOString()}\n`);
    } catch (error) {
      process.stderr.write(`[rex-heartbeat] fail ${new Date().toISOString()} ${error.message}\n`);
    }
  }, intervalMs);
}

run().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exit(1);
});
