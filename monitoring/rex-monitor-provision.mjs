#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { io } from "socket.io-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INVENTORY_PATH = path.join(__dirname, "rex-monitor-inventory.json");
const DEFAULT_ENV_PATH = path.join(__dirname, "rex-monitor-provision.env");
const HEARTBEAT_EXPORT_PATH = process.env.REX_HEARTBEAT_EXPORT_PATH
  ? path.resolve(process.env.REX_HEARTBEAT_EXPORT_PATH)
  : path.join(__dirname, "rex-heartbeat-map.generated.json");

const REQUIRED_FIELDS = [
  "name", "group", "type", "target", "interval", "timeout", "retries",
  "priority", "tags", "heartbeat", "description",
];

const VALID_TYPES = new Set(["http", "tcp", "ping", "docker", "push"]);
const VALID_PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);

function parseArgs(argv) {
  const args = { dryRun: false, inventory: INVENTORY_PATH, envFile: DEFAULT_ENV_PATH };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") args.dryRun = true;
    else if (token === "--inventory") { args.inventory = path.resolve(argv[i + 1]); i += 1; }
    else if (token === "--env-file") { args.envFile = path.resolve(argv[i + 1]); i += 1; }
  }
  return args;
}

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }

function normalizeCsvToNumberList(value) {
  if (!value) return [];
  return String(value).split(",").map((s) => s.trim()).filter(Boolean).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0);
}

function normalizeColor(seed) {
  let hash = 0;
  const value = String(seed || "rex");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 42%)`;
}

function makePushToken(name) {
  const raw = String(name || "rex-heartbeat");
  const base = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "heartbeat";
  const suffix = Math.abs([...raw].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) | 0, 7)).toString(36);
  return `${base}-${suffix}`;
}

function assert(condition, message) { if (!condition) throw new Error(message); }

function validateInventory(inventory) {
  assert(Array.isArray(inventory?.monitors), "Inventory must contain a monitors array.");
  for (const monitor of inventory.monitors) {
    for (const field of REQUIRED_FIELDS) assert(monitor[field] !== undefined, `Monitor ${monitor?.name || "<unnamed>"} missing field '${field}'.`);
    assert(typeof monitor.name === "string" && monitor.name.trim(), "Monitor name must be non-empty string.");
    assert(typeof monitor.group === "string" && monitor.group.trim(), `Monitor ${monitor.name} has invalid group.`);
    assert(VALID_TYPES.has(monitor.type), `Monitor ${monitor.name} has invalid type.`);
    assert(Number.isFinite(monitor.interval) && monitor.interval > 0, `Monitor ${monitor.name} has invalid interval.`);
    assert(Number.isFinite(monitor.timeout) && monitor.timeout > 0, `Monitor ${monitor.name} has invalid timeout.`);
    assert(Number.isFinite(monitor.retries) && monitor.retries >= 0, `Monitor ${monitor.name} has invalid retries.`);
    assert(VALID_PRIORITIES.has(monitor.priority), `Monitor ${monitor.name} has invalid priority.`);
    assert(Array.isArray(monitor.tags), `Monitor ${monitor.name} tags must be array.`);
    assert(typeof monitor.heartbeat === "boolean", `Monitor ${monitor.name} heartbeat must be boolean.`);
    if (monitor.type === "push" || monitor.heartbeat === true) {
      assert(Number.isFinite(monitor.expected_interval) && monitor.expected_interval > 0, `Monitor ${monitor.name} missing expected_interval.`);
    }
  }
}

function getAlertPolicy(defaults, monitor) {
  if (typeof monitor.alert_enabled === "boolean") return monitor.alert_enabled;
  const policy = defaults?.priority_alert_policy || {};
  if (typeof policy[monitor.priority] === "boolean") return policy[monitor.priority];
  return monitor.priority === "P0" || monitor.priority === "P1";
}

function socketCall(socket, eventName, ...args) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${eventName} timed out`)), 15000);
    const callback = (response) => {
      clearTimeout(timeout);
      if (response?.ok === false) {
        const detail = response?.msg || response?.error || JSON.stringify(response);
        reject(new Error(`${eventName} failed: ${detail}`));
        return;
      }
      resolve(response || {});
    };
    socket.emit(eventName, ...args, callback);
  });
}

async function loginSocket(socket, cfg) {
  const response = await socketCall(socket, "login", { username: cfg.username, password: cfg.password, token: cfg.twoFactorToken || undefined });
  if (response?.tokenRequired) throw new Error("Uptime Kuma requires 2FA token. Set UPTIME_KUMA_TOKEN.");
}

async function ensureKumaUser(socket, cfg) {
  const needsSetup = await socketCall(socket, "needSetup");
  if (needsSetup !== true) return false;

  await socketCall(socket, "setup", cfg.username, cfg.password);
  return true;
}

function simplifyMonitorForDiff(monitor) {
  const safeTags = Array.isArray(monitor.tags) ? monitor.tags.map((tag) => String(tag.name || "").trim()).filter(Boolean).sort() : [];
  return {
    name: monitor.name,
    description: monitor.description || "",
    type: monitor.type,
    parent: monitor.parent || null,
    active: Number(monitor.active),
    interval: Number(monitor.interval),
    timeout: Number(monitor.timeout),
    maxretries: Number(monitor.maxretries),
    url: monitor.url || "",
    hostname: monitor.hostname || "",
    port: monitor.port === null || monitor.port === undefined ? null : Number(monitor.port),
    docker_container: monitor.docker_container || "",
    docker_host: monitor.docker_host || null,
    notificationIDs: Object.keys(monitor.notificationIDList || {}).map((x) => Number(x)).sort((a, b) => a - b),
    tags: safeTags,
    pushToken: monitor.pushToken || null,
  };
}

function toMonitorPayload(def, parentId, notificationIDs) {
  const payload = {
    name: def.name,
    description: def.description || "",
    type: def.type,
    parent: parentId || null,
    interval: Number(def.interval),
    timeout: Number(def.timeout),
    maxretries: Number(def.retries),
    retryInterval: Math.max(60, Number(def.interval)),
    resendInterval: 0,
    active: def.enabled !== false,
    notificationIDList: Object.fromEntries(notificationIDs.map((id) => [id, true])),
    accepted_statuscodes: [],
  };

  if (def.type === "http") {
    payload.url = String(def.target);
    payload.method = "GET";
    payload.maxredirects = 10;
    payload.accepted_statuscodes = ["200-299"];
    payload.ignoreTls = false;
  } else if (def.type === "tcp") {
    payload.type = "port";
    if (typeof def.target === "string") {
      const [hostname, rawPort] = def.target.split(":");
      payload.hostname = hostname;
      payload.port = Number(rawPort);
    } else {
      payload.hostname = def.target.hostname;
      payload.port = Number(def.target.port);
    }
  } else if (def.type === "ping") {
    payload.hostname = typeof def.target === "string" ? def.target : def.target.hostname;
    payload.packetSize = 56;
  } else if (def.type === "docker") {
    payload.docker_host = def.target?.docker_host ?? null;
    payload.docker_container = def.target?.docker_container || String(def.target || "");
  } else if (def.type === "push") {
    const missedCycles = Number(def.tolerance_missed_cycles || 2);
    const expected = Number(def.expected_interval || def.interval);
    const staleAfter = Math.max(30, expected * missedCycles);
    payload.interval = staleAfter;
    payload.retryInterval = staleAfter;
    payload.pushToken = typeof def.push_token === "string" && def.push_token.trim() ? def.push_token.trim() : makePushToken(def.name);
  }

  return payload;
}

async function fetchMonitorList(socket) {
  let latest = null;
  const handler = (monitorList) => { latest = monitorList || {}; };
  socket.on("monitorList", handler);
  try {
    await socketCall(socket, "getMonitorList");
    const started = Date.now();
    while (latest == null && Date.now() - started < 4000) await new Promise((resolve) => setTimeout(resolve, 50));
    return latest || {};
  } finally {
    socket.off("monitorList", handler);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (fs.existsSync(args.envFile)) dotenv.config({ path: args.envFile, override: false });

  const inventory = readJson(args.inventory);
  validateInventory(inventory);

  const kumaUrl = process.env.UPTIME_KUMA_URL || "http://localhost:3011";
  const kumaPublicUrl = (process.env.UPTIME_KUMA_PUBLIC_URL || kumaUrl).replace(/\/$/, "");
  const username = process.env.UPTIME_KUMA_USERNAME;
  const password = process.env.UPTIME_KUMA_PASSWORD;
  const twoFactorToken = process.env.UPTIME_KUMA_TOKEN || "";

  const p0NotificationIDs = normalizeCsvToNumberList(process.env.REX_P0_NOTIFICATION_IDS);
  const p1NotificationIDs = normalizeCsvToNumberList(process.env.REX_P1_NOTIFICATION_IDS);

  const desiredTags = new Set(["P0", "P1", "P2", "P3", "rex", "control-center"]);
  for (const monitor of inventory.monitors) for (const tag of monitor.tags) desiredTags.add(String(tag));

  if (args.dryRun) {
    console.log(JSON.stringify({ mode: "dry-run", monitor_count: inventory.monitors.length }, null, 2));
    return;
  }

  assert(username, "UPTIME_KUMA_USERNAME is required.");
  assert(password, "UPTIME_KUMA_PASSWORD is required.");

  const socket = io(kumaUrl, { transports: ["websocket"], timeout: 15000, reconnection: false });
  const stats = { created: 0, updated: 0, skipped: 0, disabled: 0, deleted: 0, errors: 0 };
  const heartbeatExport = [];

  try {
    await new Promise((resolve, reject) => { socket.on("connect", resolve); socket.on("connect_error", reject); });
    await ensureKumaUser(socket, { username, password });
    await loginSocket(socket, { username, password, twoFactorToken });

    let monitorList = await fetchMonitorList(socket);

    const tagResponse = await socketCall(socket, "getTags");
    const tagByName = new Map((tagResponse.tags || []).map((tag) => [String(tag.name), tag]));
    for (const tagName of desiredTags) {
      if (!tagByName.has(tagName)) {
        const add = await socketCall(socket, "addTag", { name: tagName, color: normalizeColor(tagName) });
        tagByName.set(tagName, add.tag);
      }
    }

    const enabledMonitors = inventory.monitors.filter((m) => m.enabled !== false);
    const groups = [...new Set(enabledMonitors.map((m) => m.group))];
    const desiredGroupNames = new Set(groups.map((g) => `GROUP - ${g}`));

    const staleGroups = Object.values(monitorList).filter((m) => m?.type === "group" && String(m?.name || "").startsWith("GROUP - ") && !desiredGroupNames.has(m.name));
    for (const stale of staleGroups) {
      await socketCall(socket, "deleteMonitor", stale.id);
      stats.deleted += 1;
    }
    if (staleGroups.length > 0) monitorList = await fetchMonitorList(socket);

    const groupNameToId = new Map();
    for (const group of groups) {
      const groupMonitorName = `GROUP - ${group}`;
      const existingGroup = Object.values(monitorList).find((m) => m?.name === groupMonitorName && m?.type === "group");
      const groupPayload = { name: groupMonitorName, type: "group", interval: 60, timeout: 10, maxretries: 0, active: true, notificationIDList: {}, accepted_statuscodes: [] };
      if (!existingGroup) {
        const create = await socketCall(socket, "add", groupPayload);
        groupNameToId.set(group, create.monitorID);
        stats.created += 1;
      } else {
        groupNameToId.set(group, existingGroup.id);
      }
    }

    monitorList = await fetchMonitorList(socket);
    const existingByName = new Map(Object.values(monitorList).map((m) => [m.name, m]));

    for (const def of inventory.monitors) {
      try {
        if (def.enabled === false) {
          const existingDisabled = existingByName.get(def.name);
          if (existingDisabled && Number(existingDisabled.active) === 1) {
            await socketCall(socket, "pauseMonitor", existingDisabled.id);
          }
          stats.disabled += 1;
          continue;
        }

        const parentId = groupNameToId.get(def.group) || null;
        const policyAlert = getAlertPolicy(inventory.defaults, def);
        const notificationIDs = policyAlert ? (def.priority === "P0" ? p0NotificationIDs : def.priority === "P1" ? p1NotificationIDs : []) : [];

        const payload = toMonitorPayload(def, parentId, notificationIDs);
        const desiredTagNames = [...new Set(["rex", "control-center", def.priority, ...def.tags.map(String)])];

        const existing = existingByName.get(def.name);
        let monitorId;
        if (!existing) {
          const create = await socketCall(socket, "add", payload);
          monitorId = create.monitorID;
          stats.created += 1;
        } else {
          monitorId = existing.id;
          const current = simplifyMonitorForDiff(existing);
          const desiredShape = simplifyMonitorForDiff({ ...payload, tags: desiredTagNames.map((name) => ({ name })) });
          const drift = JSON.stringify(current) !== JSON.stringify(desiredShape);
          if (drift) {
            await socketCall(socket, "editMonitor", { id: existing.id, ...payload });
            stats.updated += 1;
          } else {
            stats.skipped += 1;
          }
        }

        const refreshed = await socketCall(socket, "getMonitor", monitorId);
        const monitor = refreshed.monitor;
        const existingTags = new Map((monitor.tags || []).map((t) => [String(t.name), t]));

        for (const tagName of desiredTagNames) {
          const tag = tagByName.get(tagName);
          if (tag && !existingTags.has(tagName)) {
            await socketCall(socket, "addMonitorTag", Number(tag.id), monitorId, "");
          }
        }
        for (const existingTag of monitor.tags || []) {
          if (!desiredTagNames.includes(String(existingTag.name))) {
            await socketCall(socket, "deleteMonitorTag", Number(existingTag.tag_id), monitorId, existingTag.value || "");
          }
        }

        if (def.type === "push") {
          const latest = await socketCall(socket, "getMonitor", monitorId);
          const pushToken = latest?.monitor?.pushToken || payload.pushToken || makePushToken(def.name);
          heartbeatExport.push({
            name: def.name,
            group: def.group,
            priority: def.priority,
            expected_interval: def.expected_interval,
            tolerance_missed_cycles: Number(def.tolerance_missed_cycles || inventory.defaults?.tolerance_missed_cycles || 2),
            stale_after_seconds: Number(def.expected_interval) * Number(def.tolerance_missed_cycles || inventory.defaults?.tolerance_missed_cycles || 2),
            push_token: pushToken,
            push_url: `${kumaPublicUrl}/api/push/${pushToken}`,
            description: def.description,
          });
        }
      } catch (monitorError) {
        stats.errors += 1;
        console.error(JSON.stringify({
          ok: false,
          monitor: def?.name || "<unknown>",
          message: monitorError?.message || String(monitorError),
        }));
      }
    }

    fs.writeFileSync(HEARTBEAT_EXPORT_PATH, `${JSON.stringify({ generated_at: new Date().toISOString(), heartbeats: heartbeatExport }, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({ ok: true, kuma_url: kumaUrl, results: stats, heartbeat_export_path: HEARTBEAT_EXPORT_PATH }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, message: error?.message || String(error), stack: error?.stack || null, results: stats }, null, 2));
    process.exitCode = 1;
  } finally {
    socket.close();
  }
}

main();


