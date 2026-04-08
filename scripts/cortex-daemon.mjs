/**
 * CORTEX DAEMON — Task Enterprise LLC
 * 24/7 memory capture: agent logs, MCP events, system heartbeat → SQLite FTS
 *
 * Run: node scripts/cortex-daemon.mjs
 * PM2:  pm2 start scripts/cortex-daemon.mjs --name cortex-daemon
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import http from "http";
import crypto from "crypto";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ──────────────────────────────────────────────────────────────────

const DB_PATH      = path.join(ROOT, "data", "cortex", "cortex.db");
const LOGS_DIR     = path.join(ROOT, "data", "logs");
const STATE_FILE   = path.join(ROOT, "data", "mission-control", "state.json");
const DAEMON_PORT  = process.env.CORTEX_DAEMON_PORT || 7710;
const HEARTBEAT_MS = 30_000;
const TAIL_POLL_MS = 1_000;

const AGENTS = ["abdi", "ahmed", "ayub", "dame", "rex", "atlas", "prime", "sygma"];

// ── SQLite setup ─────────────────────────────────────────────────────────────

let Database;
try {
  Database = require("better-sqlite3");
} catch {
  console.error("[CORTEX] better-sqlite3 not found. Run: npm install better-sqlite3");
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("temp_store = MEMORY");

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id           TEXT PRIMARY KEY,
    agent        TEXT NOT NULL DEFAULT 'system',
    source_type  TEXT NOT NULL DEFAULT 'log',
    event_type   TEXT NOT NULL DEFAULT 'entry',
    content      TEXT NOT NULL,
    raw_json     TEXT,
    level        TEXT DEFAULT 'info',
    session_id   TEXT,
    tool_name    TEXT,
    ts           INTEGER NOT NULL,
    ingested_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_records_ts    ON records(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_records_agent ON records(agent);
  CREATE INDEX IF NOT EXISTS idx_records_type  ON records(source_type);
  CREATE INDEX IF NOT EXISTS idx_records_level ON records(level);
  CREATE INDEX IF NOT EXISTS idx_records_tool  ON records(tool_name);

  CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
    content,
    agent,
    event_type,
    tool_name,
    content='records',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS records_ai AFTER INSERT ON records BEGIN
    INSERT INTO records_fts(rowid, content, agent, event_type, tool_name)
    VALUES (new.rowid, new.content, new.agent, new.event_type, new.tool_name);
  END;

  CREATE TRIGGER IF NOT EXISTS records_ad AFTER DELETE ON records BEGIN
    INSERT INTO records_fts(records_fts, rowid, content, agent, event_type, tool_name)
    VALUES ('delete', old.rowid, old.content, old.agent, old.event_type, old.tool_name);
  END;

  CREATE TRIGGER IF NOT EXISTS records_au AFTER UPDATE ON records BEGIN
    INSERT INTO records_fts(records_fts, rowid, content, agent, event_type, tool_name)
    VALUES ('delete', old.rowid, old.content, old.agent, old.event_type, old.tool_name);
    INSERT INTO records_fts(rowid, content, agent, event_type, tool_name)
    VALUES (new.rowid, new.content, new.agent, new.event_type, new.tool_name);
  END;

  CREATE TABLE IF NOT EXISTS daemon_state (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const insertRecord = db.prepare(`
  INSERT OR IGNORE INTO records
    (id, agent, source_type, event_type, content, raw_json, level, session_id, tool_name, ts, ingested_at)
  VALUES
    (@id, @agent, @source_type, @event_type, @content, @raw_json, @level, @session_id, @tool_name, @ts, @ingested_at)
`);

const getState = db.prepare("SELECT value FROM daemon_state WHERE key = ?");
const setState = db.prepare("INSERT OR REPLACE INTO daemon_state (key, value) VALUES (?, ?)");

function stableId(...parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function ingest(rec) {
  try {
    insertRecord.run({
      id:          rec.id ?? stableId(rec.agent, rec.content, String(rec.ts)),
      agent:       (rec.agent ?? "system").toLowerCase(),
      source_type: rec.source_type ?? "log",
      event_type:  rec.event_type ?? "entry",
      content:     rec.content ?? "",
      raw_json:    rec.raw_json ?? null,
      level:       rec.level ?? "info",
      session_id:  rec.session_id ?? null,
      tool_name:   rec.tool_name ?? null,
      ts:          rec.ts ?? Date.now(),
      ingested_at: Date.now(),
    });
  } catch (e) {
    // duplicate or constraint — silent
  }
}

// ── Agent log file tailer ─────────────────────────────────────────────────────

const logOffsets = {};

function loadOffsets() {
  for (const agent of AGENTS) {
    const raw = getState.get(`log_offset_${agent}`);
    logOffsets[agent] = raw ? parseInt(raw.value, 10) : 0;
  }
}

function saveOffset(agent, offset) {
  logOffsets[agent] = offset;
  setState.run(`log_offset_${agent}`, String(offset));
}

function tailAgentLog(agent) {
  const file = path.join(LOGS_DIR, `${agent}.log`);
  if (!fs.existsSync(file)) return;

  const stat = fs.statSync(file);
  const offset = logOffsets[agent] ?? 0;

  // File was rotated/truncated — reset
  if (stat.size < offset) {
    saveOffset(agent, 0);
    return;
  }

  if (stat.size === offset) return;

  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(stat.size - offset);
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);

  const chunk = buf.toString("utf-8");
  const lines = chunk.split("\n").filter(l => l.trim());

  for (const line of lines) {
    parseAndIngestLogLine(agent, line);
  }

  saveOffset(agent, stat.size);
}

// Log format: [2026-04-02T05:04:36.600Z] TASK: ...  or  RESPONSE: ...
// Also handle plain lines
function parseAndIngestLogLine(agent, line) {
  // Extract timestamp if present
  const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/);
  const ts = tsMatch ? new Date(tsMatch[1]).getTime() : Date.now();

  // Remove timestamp prefix
  const body = tsMatch ? line.slice(tsMatch[0].length).trim() : line.trim();
  if (!body) return;

  // Detect event type
  let event_type = "entry";
  let level = "info";
  let content = body;

  if (/^TASK:/i.test(body)) {
    event_type = "task";
    content = body.replace(/^TASK:\s*/i, "").trim();
  } else if (/^RESPONSE:/i.test(body)) {
    event_type = "response";
    content = body.replace(/^RESPONSE:\s*/i, "").trim();
  } else if (/^ERROR:/i.test(body) || /\berror\b/i.test(body)) {
    event_type = "error";
    level = "error";
  } else if (/^WARN:/i.test(body) || /\bwarn/i.test(body)) {
    event_type = "warning";
    level = "warning";
  } else if (/^TOOL:/i.test(body)) {
    event_type = "tool_call";
    content = body.replace(/^TOOL:\s*/i, "").trim();
  }

  ingest({
    id:          stableId(agent, "log", line),
    agent,
    source_type: "agent_log",
    event_type,
    content,
    raw_json:    JSON.stringify({ raw: line }),
    level,
    ts,
  });
}

function tailAllLogs() {
  for (const agent of AGENTS) {
    try { tailAgentLog(agent); } catch {}
  }
}

// ── System heartbeat ──────────────────────────────────────────────────────────

function captureHeartbeat() {
  let stateData = {};
  try {
    stateData = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {}

  const agentOverrides = stateData.agentOverrides || {};
  const activeAgents = Object.keys(agentOverrides);

  const content = `System heartbeat — ${AGENTS.length} agents registered, ${activeAgents.length} with model overrides. DB: ${DB_PATH}`;

  ingest({
    agent:       "system",
    source_type: "heartbeat",
    event_type:  "heartbeat",
    content,
    raw_json:    JSON.stringify({ stateKeys: Object.keys(stateData), agentOverrides }),
    level:       "info",
    ts:          Date.now(),
  });
}

// ── HTTP receiver for MCP/server-pushed events ────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/ingest") {
    let body = "";
    req.on("data", d => (body += d));
    req.on("end", () => {
      try {
        const records = JSON.parse(body);
        const arr = Array.isArray(records) ? records : [records];
        let count = 0;
        for (const r of arr) {
          if (r?.content) { ingest(r); count++; }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ingested: count }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    const row = db.prepare("SELECT COUNT(*) as n FROM records").get();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, records: row.n, ts: Date.now() }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(DAEMON_PORT, "127.0.0.1", () => {
  console.log(`[CORTEX] Daemon HTTP receiver on 127.0.0.1:${DAEMON_PORT}`);
});

// ── Startup ───────────────────────────────────────────────────────────────────

loadOffsets();
console.log(`[CORTEX] Starting — DB: ${DB_PATH}`);
console.log(`[CORTEX] Watching agents: ${AGENTS.join(", ")}`);

// Initial captures
tailAllLogs();
captureHeartbeat();

// Poll loops
setInterval(tailAllLogs, TAIL_POLL_MS);
setInterval(captureHeartbeat, HEARTBEAT_MS);

// Watch log dir for new files
fs.watch(LOGS_DIR, { persistent: true }, () => {
  tailAllLogs();
});

const row = db.prepare("SELECT COUNT(*) as n FROM records").get();
console.log(`[CORTEX] Ready — ${row.n} records in DB`);

process.on("SIGINT",  () => { db.close(); process.exit(0); });
process.on("SIGTERM", () => { db.close(); process.exit(0); });
