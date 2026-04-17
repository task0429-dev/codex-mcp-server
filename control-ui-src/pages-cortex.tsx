/* ============================================================
   CORTEX — Task Enterprise Intelligence System
   Full memory search: all agents, all LLM calls, all events.
   Same C2 color tokens — different layout: rail + search focus.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn, formatRelative, formatStamp, type PageProps } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CortexRecord {
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

interface CortexStats {
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
  daemonAlive: boolean;
}

interface SearchFilters {
  q: string;
  agent: string;
  source_type: string;
  event_type: string;
  level: string;
  tool_name: string;
  date_preset: string;
  from: string;
  to: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  abdi:   "#74d697",
  ahmed:  "#8bd7ff",
  dame:   "#f0b24c",
  rex:    "#ef4444",
  ayub:   "#a78bfa",
  prime:  "#8b8fff",
  atlas:  "#06b6d4",
  sygma:  "#f9a8d4",
  system: "#6b7280",
};

const AGENT_LIST = ["abdi", "ahmed", "ayub", "dame", "rex", "atlas", "prime", "sygma"];

function agentColor(a: string) { return AGENT_COLORS[a?.toLowerCase()] ?? "#6b7280"; }

const DATE_PRESETS = [
  { label: "All time",    value: "" },
  { label: "Last hour",   value: "last1h" },
  { label: "Last 6h",     value: "last6h" },
  { label: "Last 24h",    value: "last24h" },
  { label: "Today",       value: "today" },
  { label: "Yesterday",   value: "yesterday" },
  { label: "Last 7 days", value: "last7d" },
  { label: "Last 30 days",value: "last30d" },
];

const SOURCE_TYPES = ["agent_log", "heartbeat", "mcp_tool", "chat"];
const EVENT_TYPES  = ["task", "response", "tool_call", "error", "warning", "heartbeat", "entry"];
const LEVELS       = ["info", "warning", "error"];

const EMPTY_FILTERS: SearchFilters = {
  q: "", agent: "", source_type: "", event_type: "",
  level: "", tool_name: "", date_preset: "", from: "", to: "",
};

// ── API ───────────────────────────────────────────────────────────────────────

async function apiSearch(filters: SearchFilters, limit = 50, offset = 0) {
  const p = new URLSearchParams();
  if (filters.q)           p.set("q",           filters.q);
  if (filters.agent)       p.set("agent",        filters.agent);
  if (filters.source_type) p.set("source_type",  filters.source_type);
  if (filters.event_type)  p.set("event_type",   filters.event_type);
  if (filters.level)       p.set("level",        filters.level);
  if (filters.tool_name)   p.set("tool_name",    filters.tool_name);
  if (filters.date_preset) p.set("date_preset",  filters.date_preset);
  if (filters.from)        p.set("from",         String(new Date(filters.from).getTime()));
  if (filters.to)          p.set("to",           String(new Date(filters.to).getTime()));
  p.set("limit",  String(limit));
  p.set("offset", String(offset));
  const r = await fetch(`/api/cortex/search?${p}`);
  return r.ok ? r.json() : null;
}

async function apiStats() {
  const r = await fetch("/api/cortex/stats");
  return r.ok ? r.json() : null;
}

async function apiFacets() {
  const r = await fetch("/api/cortex/facets");
  return r.ok ? r.json() : null;
}

// ── Level / type helpers ──────────────────────────────────────────────────────

function levelDot(level: string) {
  if (level === "error")   return "dot-error";
  if (level === "warning") return "dot-warning";
  return "dot-info";
}

function eventChipColor(type: string) {
  const m: Record<string, string> = {
    task:      "#dc3545",
    response:  "#22c55e",
    tool_call: "#8b5cf6",
    error:     "#ef4444",
    warning:   "#eab308",
    heartbeat: "#6b7280",
    entry:     "#3b82f6",
  };
  return m[type] ?? "#6b7280";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CxEmpty({ text }: { text: string }) {
  return (
    <div className="cx-empty">
      <span className="cx-empty-icon">◎</span>
      <span className="cx-empty-text">{text}</span>
    </div>
  );
}

function CxSkeleton() {
  return (
    <div className="cx-skeleton">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="cx-skel-row">
          <div className="cx-skel-dot" />
          <div className="cx-skel-line" style={{ width: `${45 + (i % 5) * 10}%` }} />
          <div className="cx-skel-tag" />
          <div className="cx-skel-time" />
        </div>
      ))}
    </div>
  );
}

// ── HQ Bar ────────────────────────────────────────────────────────────────────

function HQBar({ stats, loading }: { stats: CortexStats | null; loading: boolean }) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="cx-hq-bar">
      <div className="cx-hq-brand">
        <span className="cx-hq-logo">◈</span>
        <span className="cx-hq-name">CORTEX</span>
      </div>

      <div className="cx-hq-metrics">
        {stats ? (
          <>
            <div className="cx-hq-metric">
              <span className="cx-hq-metric-val">{stats.total.toLocaleString()}</span>
              <span className="cx-hq-metric-label">records</span>
            </div>
            <div className="cx-hq-sep">·</div>
            <div className="cx-hq-metric">
              <span className="cx-hq-metric-val">{stats.last1h.toLocaleString()}</span>
              <span className="cx-hq-metric-label">last hour</span>
            </div>
            <div className="cx-hq-sep">·</div>
            <div className="cx-hq-metric">
              <span className="cx-hq-metric-val">{stats.last24h.toLocaleString()}</span>
              <span className="cx-hq-metric-label">24h</span>
            </div>
          </>
        ) : (
          <span className="cx-hq-offline">{loading ? "loading…" : "DB offline"}</span>
        )}
      </div>

      <div className="cx-hq-right">
        {stats?.daemonAlive ? (
          <div className="cx-hq-live">
            <span className={cn("cx-hq-pulse", pulse && "cx-hq-pulse-on")} />
            <span className="cx-hq-live-label">LIVE</span>
          </div>
        ) : (
          <div className="cx-hq-dead">
            <span className="cx-hq-dead-dot" />
            <span>DAEMON OFFLINE</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Agent Rail ────────────────────────────────────────────────────────────────

function AgentRail({
  stats, activeAgent, setActiveAgent, liveRecords,
}: {
  stats: CortexStats | null;
  activeAgent: string;
  setActiveAgent: (a: string) => void;
  liveRecords: CortexRecord[];
}) {
  const countFor = (a: string) =>
    stats?.byAgent.find(r => r.agent === a)?.count ?? 0;
  const lastFor = (a: string) =>
    stats?.byAgent.find(r => r.agent === a)?.last_ts ?? null;

  // Live feed last 8 items
  const feed = liveRecords.slice(0, 8);

  return (
    <aside className="cx-rail">
      {/* All agents */}
      <button
        className={cn("cx-rail-agent cx-rail-all", activeAgent === "" && "cx-rail-active")}
        onClick={() => setActiveAgent("")}
      >
        <span className="cx-rail-dot" style={{ background: "#dc3545" }} />
        <span className="cx-rail-name">ALL AGENTS</span>
        <span className="cx-rail-count">{stats?.total.toLocaleString() ?? "—"}</span>
      </button>

      <div className="cx-rail-divider" />

      {/* Per-agent */}
      {AGENT_LIST.map(agent => {
        const color  = agentColor(agent);
        const count  = countFor(agent);
        const last   = lastFor(agent);
        const isLive = liveRecords.some(r => r.agent === agent);
        return (
          <button
            key={agent}
            className={cn("cx-rail-agent", activeAgent === agent && "cx-rail-active")}
            onClick={() => setActiveAgent(activeAgent === agent ? "" : agent)}
          >
            <span className="cx-rail-dot" style={{ background: color }} />
            <span className="cx-rail-name" style={{ color: activeAgent === agent ? color : undefined }}>
              {agent.toUpperCase()}
            </span>
            {isLive && <span className="cx-rail-live-dot" />}
            <span className="cx-rail-count">{count > 0 ? count.toLocaleString() : "—"}</span>
            {last && (
              <span className="cx-rail-last">{formatRelative(new Date(last).toISOString())}</span>
            )}
          </button>
        );
      })}

      <div className="cx-rail-divider" />

      {/* Live ticker */}
      <div className="cx-rail-feed-label">LIVE FEED</div>
      <div className="cx-rail-feed">
        {feed.length === 0 ? (
          <div className="cx-rail-feed-empty">no activity</div>
        ) : feed.map(r => (
          <div key={r.id} className="cx-rail-feed-item">
            <span className="cx-rail-feed-dot" style={{ background: agentColor(r.agent) }} />
            <span className="cx-rail-feed-content">{r.content.slice(0, 50)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

function FilterBar({
  filters, setFilters, facets, onSearch, loading, total, took,
}: {
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  facets: any;
  onSearch: () => void;
  loading: boolean;
  total: number;
  took: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof SearchFilters, val: string) =>
    setFilters({ ...filters, [key]: val });

  const hasFilters = Object.entries(filters).some(([, v]) => v !== "");

  const clearAll = () => setFilters(EMPTY_FILTERS);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="cx-filterbar">
      {/* Main search row */}
      <div className="cx-search-row">
        <div className="cx-search-wrap">
          <span className="cx-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="cx-search-input"
            placeholder="Search all agent memory… (⌘K)"
            value={filters.q}
            onChange={e => set("q", e.target.value)}
            onKeyDown={e => e.key === "Enter" && onSearch()}
          />
          {filters.q && (
            <button className="cx-search-clear" onClick={() => { set("q", ""); }}>×</button>
          )}
        </div>

        <button className="cx-search-btn" onClick={onSearch} disabled={loading}>
          {loading ? "…" : "Search"}
        </button>

        <button
          className={cn("cx-filter-toggle", expanded && "cx-filter-toggle-on", hasFilters && "cx-filter-toggle-active")}
          onClick={() => setExpanded(e => !e)}
          title="Filters"
        >
          ⊞ Filters {hasFilters && <span className="cx-filter-badge">●</span>}
        </button>

        {hasFilters && (
          <button className="cx-clear-all" onClick={clearAll}>Clear</button>
        )}

        {total > 0 && (
          <span className="cx-result-meta">
            {total.toLocaleString()} results {took > 0 && `· ${took}ms`}
          </span>
        )}
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="cx-filter-panel">
          <div className="cx-filter-grid">

            {/* Date preset */}
            <div className="cx-filter-group">
              <label className="cx-filter-label">Time Range</label>
              <select
                className="cx-filter-select"
                value={filters.date_preset}
                onChange={e => set("date_preset", e.target.value)}
              >
                {DATE_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Custom date from */}
            <div className="cx-filter-group">
              <label className="cx-filter-label">From</label>
              <input
                type="datetime-local"
                className="cx-filter-input"
                value={filters.from}
                onChange={e => { set("from", e.target.value); set("date_preset", ""); }}
              />
            </div>

            {/* Custom date to */}
            <div className="cx-filter-group">
              <label className="cx-filter-label">To</label>
              <input
                type="datetime-local"
                className="cx-filter-input"
                value={filters.to}
                onChange={e => { set("to", e.target.value); set("date_preset", ""); }}
              />
            </div>

            {/* Source type */}
            <div className="cx-filter-group">
              <label className="cx-filter-label">Source</label>
              <select
                className="cx-filter-select"
                value={filters.source_type}
                onChange={e => set("source_type", e.target.value)}
              >
                <option value="">All sources</option>
                {(facets?.source_types ?? SOURCE_TYPES).map((t: string) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Event type */}
            <div className="cx-filter-group">
              <label className="cx-filter-label">Event Type</label>
              <select
                className="cx-filter-select"
                value={filters.event_type}
                onChange={e => set("event_type", e.target.value)}
              >
                <option value="">All events</option>
                {(facets?.event_types ?? EVENT_TYPES).map((t: string) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Level */}
            <div className="cx-filter-group">
              <label className="cx-filter-label">Level</label>
              <div className="cx-level-btns">
                {LEVELS.map(l => (
                  <button
                    key={l}
                    className={cn("cx-level-btn", `cx-level-${l}`, filters.level === l && "cx-level-active")}
                    onClick={() => set("level", filters.level === l ? "" : l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Tool name */}
            <div className="cx-filter-group">
              <label className="cx-filter-label">Tool</label>
              <select
                className="cx-filter-select"
                value={filters.tool_name}
                onChange={e => set("tool_name", e.target.value)}
              >
                <option value="">All tools</option>
                {(facets?.tools ?? []).map((t: string) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ── Result Card ───────────────────────────────────────────────────────────────

function ResultCard({
  record, selected, onClick,
}: {
  record: CortexRecord;
  selected: boolean;
  onClick: () => void;
}) {
  const color = agentColor(record.agent);
  const chipColor = eventChipColor(record.event_type);

  return (
    <button
      className={cn("cx-card", selected && "cx-card-selected")}
      onClick={onClick}
    >
      <div className="cx-card-stripe" style={{ background: color }} />
      <div className="cx-card-body">
        <div className="cx-card-top">
          <span className="cx-card-agent" style={{ color }}>{record.agent.toUpperCase()}</span>
          <span className="cx-card-chip" style={{ color: chipColor, borderColor: chipColor + "40" }}>
            {record.event_type}
          </span>
          {record.tool_name && (
            <span className="cx-card-tool">⚙ {record.tool_name}</span>
          )}
          <span className={cn("status-dot", levelDot(record.level))} />
          <span className="cx-card-time">{formatRelative(new Date(record.ts).toISOString())}</span>
        </div>
        <div className="cx-card-content">{record.content}</div>
        <div className="cx-card-meta">
          <span className="cx-card-src">{record.source_type}</span>
          {record.session_id && (
            <span className="cx-card-session">session:{record.session_id.slice(0, 8)}</span>
          )}
          {record.rank !== undefined && (
            <span className="cx-card-rank">score:{Math.round(record.rank * 10) / 10}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Detail Pane ───────────────────────────────────────────────────────────────

function DetailPane({ record, onClose }: { record: CortexRecord; onClose: () => void }) {
  const color = agentColor(record.agent);

  let parsed: any = null;
  try { if (record.raw_json) parsed = JSON.parse(record.raw_json); } catch {}

  return (
    <aside className="cx-detail">
      <div className="cx-detail-head">
        <span className="cx-detail-agent" style={{ color }}>{record.agent.toUpperCase()}</span>
        <span className="cx-detail-event">{record.event_type}</span>
        <button className="cx-detail-close" onClick={onClose}>×</button>
      </div>

      <div className="cx-detail-body">
        {/* Meta grid */}
        <div className="cx-detail-grid">
          {[
            ["Time",    formatStamp(new Date(record.ts).toISOString())],
            ["Source",  record.source_type],
            ["Level",   record.level],
            ["Agent",   record.agent],
            record.tool_name && ["Tool", record.tool_name],
            record.session_id && ["Session", record.session_id],
          ].filter(Boolean).map(([k, v]: any) => (
            <div key={k} className="cx-detail-fact">
              <span className="cx-detail-fact-key">{k}</span>
              <span className="cx-detail-fact-val">{v}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="cx-detail-section-label">Content</div>
        <div className="cx-detail-content">{record.content}</div>

        {/* Raw JSON */}
        {parsed && (
          <>
            <div className="cx-detail-section-label">Raw</div>
            <pre className="cx-detail-raw">{JSON.stringify(parsed, null, 2)}</pre>
          </>
        )}

        {/* Record ID */}
        <div className="cx-detail-id">ID: {record.id}</div>
      </div>
    </aside>
  );
}

// ── Stats Panel ───────────────────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: CortexStats }) {
  return (
    <div className="cx-stats-panel">
      <div className="cx-stats-grid">
        {[
          { label: "Total Records", value: stats.total.toLocaleString() },
          { label: "Last Hour",     value: stats.last1h.toLocaleString() },
          { label: "Last 24h",      value: stats.last24h.toLocaleString() },
          { label: "Last 7 days",   value: stats.last7d.toLocaleString() },
        ].map(m => (
          <div key={m.label} className="cx-stat-card">
            <div className="cx-stat-val">{m.value}</div>
            <div className="cx-stat-label">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Agent breakdown */}
      {stats.byAgent.length > 0 && (
        <div className="cx-stats-section">
          <div className="cx-stats-section-label">By Agent</div>
          {stats.byAgent.map(r => {
            const pct = Math.round((r.count / stats.total) * 100);
            const color = agentColor(r.agent);
            return (
              <div key={r.agent} className="cx-stat-bar-row">
                <span className="cx-stat-bar-name" style={{ color }}>{r.agent}</span>
                <div className="cx-stat-bar-track">
                  <div className="cx-stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="cx-stat-bar-count">{r.count.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Top tools */}
      {stats.topTools.length > 0 && (
        <div className="cx-stats-section">
          <div className="cx-stats-section-label">Top Tools</div>
          {stats.topTools.slice(0, 8).map(t => (
            <div key={t.tool_name} className="cx-stat-bar-row">
              <span className="cx-stat-bar-name" style={{ color: "#8b5cf6" }}>{t.tool_name}</span>
              <span className="cx-stat-bar-count">{t.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Date range */}
      {stats.oldestTs && stats.newestTs && (
        <div className="cx-stats-range">
          {formatStamp(new Date(stats.oldestTs).toISOString())}
          {" "}→{" "}
          {formatStamp(new Date(stats.newestTs).toISOString())}
        </div>
      )}
    </div>
  );
}

// ── Root: CortexPage ──────────────────────────────────────────────────────────

export function CortexPage(_props: PageProps) {
  const [filters, setFilters]   = useState<SearchFilters>(EMPTY_FILTERS);
  const [results, setResults]   = useState<CortexRecord[]>([]);
  const [total, setTotal]       = useState(0);
  const [took, setTook]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [stats, setStats]       = useState<CortexStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [facets, setFacets]     = useState<any>(null);

  const [activeAgent, setActiveAgent]   = useState("");
  const [selected, setSelected]         = useState<CortexRecord | null>(null);
  const [showStats, setShowStats]       = useState(false);
  const [liveRecords, setLiveRecords]   = useState<CortexRecord[]>([]);
  const [offset, setOffset]             = useState(0);

  const LIMIT = 50;
  const sseRef = useRef<EventSource | null>(null);

  // Load stats + facets on mount
  useEffect(() => {
    (async () => {
      setStatsLoading(true);
      const [s, f] = await Promise.all([apiStats(), apiFacets()]);
      if (s?.ok)  setStats(s.stats);
      if (f?.ok)  setFacets(f.facets);
      setStatsLoading(false);
    })();
  }, []);

  // SSE live feed
  useEffect(() => {
    const es = new EventSource("/api/cortex/stream");
    sseRef.current = es;
    es.onmessage = (e) => {
      try {
        const records: CortexRecord[] = JSON.parse(e.data);
        if (records.length) {
          setLiveRecords(prev => [...records, ...prev].slice(0, 30));
          // Refresh stats quietly
          apiStats().then(s => { if (s?.ok) setStats(s.stats); });
        }
      } catch {}
    };
    return () => { es.close(); };
  }, []);

  // When active agent changes, apply to filters and auto-search
  useEffect(() => {
    const newFilters = { ...filters, agent: activeAgent };
    setFilters(newFilters);
    if (hasSearched) {
      doSearch(newFilters, 0);
    }
  }, [activeAgent]);

  const doSearch = useCallback(async (f: SearchFilters, off = 0) => {
    setLoading(true);
    setOffset(off);
    const data = await apiSearch(f, LIMIT, off);
    if (data?.ok) {
      if (off === 0) {
        setResults(data.results ?? []);
      } else {
        setResults(prev => [...prev, ...(data.results ?? [])]);
      }
      setTotal(data.total ?? 0);
      setTook(data.took_ms ?? 0);
    }
    setLoading(false);
    setHasSearched(true);
  }, []);

  const handleSearch = () => {
    doSearch(filters, 0);
  };

  const loadMore = () => {
    const nextOffset = offset + LIMIT;
    doSearch(filters, nextOffset);
  };

  const hasMore = results.length < total;

  return (
    <div className="cx-shell">
      {/* HQ Bar */}
      <HQBar stats={stats} loading={statsLoading} />

      {/* Body */}
      <div className="cx-body">
        {/* Agent Rail */}
        <AgentRail
          stats={stats}
          activeAgent={activeAgent}
          setActiveAgent={setActiveAgent}
          liveRecords={liveRecords}
        />

        {/* Main */}
        <div className="cx-main">
          {/* Filter Bar */}
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            facets={facets}
            onSearch={handleSearch}
            loading={loading}
            total={total}
            took={took}
          />

          {/* Toolbar */}
          <div className="cx-toolbar">
            <button
              className={cn("cx-toolbar-btn", showStats && "cx-toolbar-btn-active")}
              onClick={() => setShowStats(s => !s)}
            >
              ▤ Stats
            </button>
            {hasSearched && (
              <span className="cx-toolbar-info">
                {loading ? "searching…" : `${total.toLocaleString()} records`}
              </span>
            )}
          </div>

          {/* Stats panel */}
          {showStats && stats && <StatsPanel stats={stats} />}

          {/* Results */}
          <div className={cn("cx-results", selected && "cx-results-split")}>
            <div className="cx-result-list">
              {!hasSearched ? (
                <CxEmpty text="Search agent memory above — or select an agent from the rail" />
              ) : loading && results.length === 0 ? (
                <CxSkeleton />
              ) : results.length === 0 ? (
                <CxEmpty text="No records match your query" />
              ) : (
                <>
                  {results.map(r => (
                    <ResultCard
                      key={r.id}
                      record={r}
                      selected={selected?.id === r.id}
                      onClick={() => setSelected(selected?.id === r.id ? null : r)}
                    />
                  ))}
                  {hasMore && (
                    <button className="cx-load-more" onClick={loadMore} disabled={loading}>
                      {loading ? "Loading…" : `Load more (${total - results.length} remaining)`}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Detail pane */}
            {selected && (
              <DetailPane record={selected} onClose={() => setSelected(null)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
