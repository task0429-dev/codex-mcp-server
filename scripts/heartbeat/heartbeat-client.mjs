#!/usr/bin/env node
import process from "node:process";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function statusFromMode(mode) {
  const normalized = String(mode || "").toLowerCase();
  if (normalized === "start") return "up";
  if (normalized === "success") return "up";
  if (normalized === "fail") return "down";
  if (normalized === "down") return "down";
  if (normalized === "up") return "up";
  return null;
}

function defaultMsgForMode(mode) {
  const normalized = String(mode || "").toLowerCase();
  if (normalized === "start") return "start";
  if (normalized === "success") return "success";
  if (normalized === "fail") return "failed";
  return "heartbeat";
}

function resolvePushUrl(args) {
  const explicitUrl = args.url || process.env.UPTIME_KUMA_PUSH_URL;
  if (explicitUrl) return explicitUrl;

  const token = args.token || process.env.UPTIME_KUMA_PUSH_TOKEN;
  const base = (args.base || process.env.UPTIME_KUMA_BASE_URL || "http://localhost:3011").replace(/\/$/, "");
  if (!token) {
    throw new Error("Provide --url or --token (or UPTIME_KUMA_PUSH_URL / UPTIME_KUMA_PUSH_TOKEN).");
  }
  return `${base}/api/push/${token}`;
}

async function run() {
  const args = parseArgs(process.argv);

  const mode = args.mode || args.status || "success";
  const status = statusFromMode(mode);
  const msg = args.msg || process.env.UPTIME_KUMA_HEARTBEAT_MSG || defaultMsgForMode(mode);
  const ping = args.ping || process.env.UPTIME_KUMA_HEARTBEAT_PING;

  if (!status) {
    throw new Error("Invalid mode/status. Supported: start, success, fail, up, down.");
  }

  const pushUrl = resolvePushUrl(args);
  const url = new URL(pushUrl);
  url.searchParams.set("status", status);
  if (msg) url.searchParams.set("msg", msg);
  if (ping) url.searchParams.set("ping", String(ping));

  const response = await fetch(url.toString(), { method: "GET" });
  const body = await response.text();

  const out = {
    ok: response.ok,
    status_code: response.status,
    mode,
    status,
    request_url: url.toString(),
    response_body: body,
    timestamp: new Date().toISOString(),
  };

  if (!response.ok) {
    throw new Error(JSON.stringify(out));
  }

  process.stdout.write(`${JSON.stringify(out)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
});
