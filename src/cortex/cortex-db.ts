/**
 * CORTEX DB — Task Enterprise LLC
 * Read-only access layer for cortex.db (written by cortex-daemon)
 */

import path from "path";
import fs from "fs";
import { logger } from "../core/logger";

const DB_PATH = path.resolve(process.cwd(), "data", "cortex", "cortex.db");

let _db: any = null;

function getDb(): any | null {
  if (_db) return _db;
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    const Database = require("better-sqlite3");
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    return _db;
  } catch (e: any) {
    logger.warn("cortex_db_unavailable", { message: e?.message });
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CortexRecord {
  id: string;
  agent: string;
  source_type: string;
  event_type: string;
  content: string;
  raw_json: string | null;
  level: string;
  session_id: string | null;
  tool_name: string | null;
  ts: number;
  ingested_at: number;
  rank?: number;
}

export interface SearchFilters {
  q?: string;
  agent?: string;           // comma-sep or single
  source_type?: string;     // agent_log | heartbeat | mcp_tool | chat
  event_type?: string;      // task | response | error | warning | tool_call | heartbeat | entry
  level?: string;           // info | warning | error
  tool_name?: string;
  from?: number;            // unix ms
  to?: number;              // unix ms
  date_preset?: string;     // today | yesterday | last7d | last30d | last1h
  session_id?: string;
  limit?: number;
  offset?: number;
}

export interface CortexStats {
  total: number;
  last1h: number;
  last24h: number;
  last7d: number;
  byAgent: Array<{ agent: string; count: number; last_ts: number }>;
  bySourceType: Array<{ source_type: string; count: number }>;
  byEventType: Array<{ event_type: string; count: number }>;
  byLevel: Array<{ level: string; count: number }>;
  topTools: Array<{ tool_name: string; count: number }>;
  oldestTs: number | null;
  newestTs: number | null;
  dbPath: string;
  daemonAlive: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePreset(preset: string): { from: number; to: number } {
  const now = Date.now();
  switch (preset) {
    case "last1h":    return { from: now - 3_600_000,       to: now };
    case "last6h":    return { from: now - 21_600_000,      to: now };
    case "last24h":   return { from: now - 86_400_000,      to: now };
    case "today": {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return { from: d.getTime(), to: now };
    }
    case "yesterday": {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return { from: d.getTime() - 86_400_000, to: d.getTime() - 1 };
    }
    case "last7d":    return { from: now - 7 * 86_400_000,  to: now };
    case "last30d":   return { from: now - 30 * 86_400_000, to: now };
    default:          return { from: 0, to: now };
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

export function cortexSearch(filters: SearchFilters): { results: CortexRecord[]; total: number; took_ms: number } {
  const db = getDb();
  const t0 = Date.now();

  if (!db) return { results: [], total: 0, took_ms: 0 };

  const limit  = Math.min(filters.limit  ?? 50,  500);
  const offset = filters.offset ?? 0;

  // Resolve time range
  let fromMs = filters.from ?? 0;
  let toMs   = filters.to   ?? Date.now();
  if (filters.date_preset) {
    const p = resolvePreset(filters.date_preset);
    fromMs = p.from;
    toMs   = p.to;
  }

  // Build WHERE conditions
  const conditions: string[] = ["r.ts >= ? AND r.ts <= ?"];
  const params: any[] = [fromMs, toMs];

  if (filters.agent) {
    const agents = filters.agent.split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
    if (agents.length === 1) {
      conditions.push("r.agent = ?");
      params.push(agents[0]);
    } else {
      conditions.push(`r.agent IN (${agents.map(() => "?").join(",")})`);
      params.push(...agents);
    }
  }

  if (filters.source_type) {
    const types = filters.source_type.split(",").map(t => t.trim()).filter(Boolean);
    if (types.length === 1) {
      conditions.push("r.source_type = ?");
      params.push(types[0]);
    } else {
      conditions.push(`r.source_type IN (${types.map(() => "?").join(",")})`);
      params.push(...types);
    }
  }

  if (filters.event_type) {
    const types = filters.event_type.split(",").map(t => t.trim()).filter(Boolean);
    if (types.length === 1) {
      conditions.push("r.event_type = ?");
      params.push(types[0]);
    } else {
      conditions.push(`r.event_type IN (${types.map(() => "?").join(",")})`);
      params.push(...types);
    }
  }

  if (filters.level) {
    conditions.push("r.level = ?");
    params.push(filters.level);
  }

  if (filters.tool_name) {
    conditions.push("r.tool_name = ?");
    params.push(filters.tool_name);
  }

  if (filters.session_id) {
    conditions.push("r.session_id = ?");
    params.push(filters.session_id);
  }

  const whereClause = conditions.join(" AND ");

  try {
    // FTS search
    if (filters.q && filters.q.trim()) {
      const ftsQuery = filters.q.trim().replace(/['"]/g, "").split(/\s+/).filter(Boolean).join(" OR ");

      const countRow = db.prepare(`
        SELECT COUNT(*) as n
        FROM records r
        JOIN records_fts f ON f.rowid = r.rowid
        WHERE ${whereClause}
          AND records_fts MATCH ?
      `).get(...params, ftsQuery);

      const results = db.prepare(`
        SELECT r.*,
               -rank AS rank
        FROM records r
        JOIN records_fts f ON f.rowid = r.rowid
        WHERE ${whereClause}
          AND records_fts MATCH ?
        ORDER BY rank DESC, r.ts DESC
        LIMIT ? OFFSET ?
      `).all(...params, ftsQuery, limit, offset);

      return { results, total: countRow?.n ?? 0, took_ms: Date.now() - t0 };
    }

    // Plain filter (no keyword)
    const countRow = db.prepare(`
      SELECT COUNT(*) as n FROM records r WHERE ${whereClause}
    `).get(...params);

    const results = db.prepare(`
      SELECT r.* FROM records r
      WHERE ${whereClause}
      ORDER BY r.ts DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { results, total: countRow?.n ?? 0, took_ms: Date.now() - t0 };

  } catch (e: any) {
    logger.warn("cortex_search_error", { message: e?.message });
    return { results: [], total: 0, took_ms: Date.now() - t0 };
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function cortexStats(): CortexStats {
  const db = getDb();
  const now = Date.now();

  const empty: CortexStats = {
    total: 0, last1h: 0, last24h: 0, last7d: 0,
    byAgent: [], bySourceType: [], byEventType: [], byLevel: [], topTools: [],
    oldestTs: null, newestTs: null,
    dbPath: DB_PATH, daemonAlive: false,
  };

  if (!db) return empty;

  try {
    // Check daemon alive via heartbeat within last 2 minutes
    const hbRow = db.prepare(
      "SELECT ts FROM records WHERE source_type='heartbeat' ORDER BY ts DESC LIMIT 1"
    ).get();
    const daemonAlive = hbRow ? (now - hbRow.ts < 120_000) : false;

    const total    = (db.prepare("SELECT COUNT(*) as n FROM records").get() as any)?.n ?? 0;
    const last1h   = (db.prepare("SELECT COUNT(*) as n FROM records WHERE ts >= ?").get(now - 3_600_000) as any)?.n ?? 0;
    const last24h  = (db.prepare("SELECT COUNT(*) as n FROM records WHERE ts >= ?").get(now - 86_400_000) as any)?.n ?? 0;
    const last7d   = (db.prepare("SELECT COUNT(*) as n FROM records WHERE ts >= ?").get(now - 7 * 86_400_000) as any)?.n ?? 0;

    const byAgent      = db.prepare("SELECT agent, COUNT(*) as count, MAX(ts) as last_ts FROM records GROUP BY agent ORDER BY count DESC").all() as any[];
    const bySourceType = db.prepare("SELECT source_type, COUNT(*) as count FROM records GROUP BY source_type ORDER BY count DESC").all() as any[];
    const byEventType  = db.prepare("SELECT event_type, COUNT(*) as count FROM records GROUP BY event_type ORDER BY count DESC").all() as any[];
    const byLevel      = db.prepare("SELECT level, COUNT(*) as count FROM records GROUP BY level ORDER BY count DESC").all() as any[];
    const topTools     = db.prepare("SELECT tool_name, COUNT(*) as count FROM records WHERE tool_name IS NOT NULL GROUP BY tool_name ORDER BY count DESC LIMIT 20").all() as any[];

    const rangeRow = db.prepare("SELECT MIN(ts) as oldest, MAX(ts) as newest FROM records").get() as any;

    return {
      total, last1h, last24h, last7d,
      byAgent, bySourceType, byEventType, byLevel, topTools,
      oldestTs: rangeRow?.oldest ?? null,
      newestTs: rangeRow?.newest ?? null,
      dbPath: DB_PATH,
      daemonAlive,
    };
  } catch (e: any) {
    logger.warn("cortex_stats_error", { message: e?.message });
    return empty;
  }
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export function cortexTimeline(agent?: string, from?: number, to?: number, limit = 100): CortexRecord[] {
  const db = getDb();
  if (!db) return [];

  const fromMs = from ?? 0;
  const toMs   = to   ?? Date.now();

  try {
    if (agent) {
      return db.prepare(
        "SELECT * FROM records WHERE agent=? AND ts>=? AND ts<=? ORDER BY ts DESC LIMIT ?"
      ).all(agent.toLowerCase(), fromMs, toMs, Math.min(limit, 500)) as CortexRecord[];
    }
    return db.prepare(
      "SELECT * FROM records WHERE ts>=? AND ts<=? ORDER BY ts DESC LIMIT ?"
    ).all(fromMs, toMs, Math.min(limit, 500)) as CortexRecord[];
  } catch (e: any) {
    logger.warn("cortex_timeline_error", { message: e?.message });
    return [];
  }
}

// ── Facets (for filter dropdowns) ────────────────────────────────────────────

export function cortexFacets() {
  const db = getDb();
  if (!db) return { agents: [], source_types: [], event_types: [], tools: [], levels: [] };
  try {
    return {
      agents:       db.prepare("SELECT DISTINCT agent FROM records ORDER BY agent").all().map((r: any) => r.agent),
      source_types: db.prepare("SELECT DISTINCT source_type FROM records ORDER BY source_type").all().map((r: any) => r.source_type),
      event_types:  db.prepare("SELECT DISTINCT event_type FROM records ORDER BY event_type").all().map((r: any) => r.event_type),
      tools:        db.prepare("SELECT DISTINCT tool_name FROM records WHERE tool_name IS NOT NULL ORDER BY tool_name").all().map((r: any) => r.tool_name),
      levels:       db.prepare("SELECT DISTINCT level FROM records ORDER BY level").all().map((r: any) => r.level),
    };
  } catch {
    return { agents: [], source_types: [], event_types: [], tools: [], levels: [] };
  }
}

// ── Recent (live feed) ────────────────────────────────────────────────────────

export function cortexRecent(since: number, limit = 30): CortexRecord[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(
      "SELECT * FROM records WHERE ingested_at > ? ORDER BY ingested_at DESC LIMIT ?"
    ).all(since, limit) as CortexRecord[];
  } catch {
    return [];
  }
}
