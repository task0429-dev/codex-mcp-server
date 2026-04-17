/* ============================================================
   Memory Console — Command Center Intelligence Layer
   Task Enterprise LLC · 2026

   Replaces the Logs tab with a full-bleed memory command center.
   Layout: TopBar / Sidebar / Results / DetailPanel
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, StatusBadge } from "./shell";
import { cn, dotTone, formatRelative, formatStamp, type PageProps } from "./types";
import {
  fetchMemoryHealth, fetchMemoryFacets,
  type MemoryHealth, type MemoryFacets, type MemoryHealthSource, type FacetBucket,
} from "./memory-api";

/* ─── Voice log types (mirrored from localStorage) ─── */

interface VoiceMsg { id: string; role: "user" | "agent"; text: string; ts: string; }
interface VoiceConvLog {
  id: string; agentId: string; agentName: string;
  startTime: string; lastUpdated: string;
  messages: VoiceMsg[]; savedForever: boolean;
}
const VOICE_LOGS_KEY = "vc_logs_v1";
const VOICE_LOG_TTL = 7 * 24 * 3600_000;
function loadVoiceLogs(): VoiceConvLog[] {
  try { return JSON.parse(localStorage.getItem(VOICE_LOGS_KEY) || "[]"); } catch { return []; }
}
function saveVoiceLogs(logs: VoiceConvLog[]) {
  const cutoff = Date.now() - VOICE_LOG_TTL;
  localStorage.setItem(VOICE_LOGS_KEY, JSON.stringify(
    logs.filter(l => l.savedForever || new Date(l.lastUpdated).getTime() > cutoff)
  ));
}

/* ─── Nav ─── */

type ConsoleView =
  | "all-logs" | "conversations" | "system-events"
  | "durable-memory" | "decisions" | "action-items"
  | "agent-memory" | "client-memory" | "project-memory"
  | "rex-health" | "ahmed-curation" | "abdi-oversight"
  | "alerts" | "archives";

const NAV: Array<{ group: string; items: Array<{ key: ConsoleView; label: string; icon: string }> }> = [
  { group: "Stream", items: [
    { key: "all-logs",      label: "All Logs",        icon: "▤" },
    { key: "conversations", label: "Conversations",   icon: "◉" },
    { key: "system-events", label: "System Events",   icon: "≡" },
  ]},
  { group: "Memory", items: [
    { key: "durable-memory", label: "Durable Memory", icon: "◫" },
    { key: "decisions",      label: "Decisions",      icon: "◈" },
    { key: "action-items",   label: "Action Items",   icon: "☐" },
    { key: "agent-memory",   label: "Agent Memory",   icon: "◎" },
    { key: "client-memory",  label: "Client Memory",  icon: "⊛" },
    { key: "project-memory", label: "Project Memory", icon: "▪" },
  ]},
  { group: "Operators", items: [
    { key: "rex-health",      label: "Rex — Health",     icon: "◈" },
    { key: "ahmed-curation",  label: "Ahmed — Curation", icon: "⊞" },
    { key: "abdi-oversight",  label: "Abdi — Oversight", icon: "⊟" },
  ]},
  { group: "Storage", items: [
    { key: "alerts",   label: "Alerts",         icon: "⚠" },
    { key: "archives", label: "Archives",       icon: "⊕" },
  ]},
];

/* ─── Sidebar ─── */

function ConsoleSidebar({ view, setView, health, facets }: {
  view: ConsoleView;
  setView: (v: ConsoleView) => void;
  health: MemoryHealth | null;
  facets: MemoryFacets | null;
}) {
  function badge(key: ConsoleView): number | null {
    if (key === "rex-health" && health) {
      return health.queue.failed + health.queue.deadLetter || null;
    }
    if (key === "agent-memory" && facets) return facets.facets.agents.reduce((s, b) => s + b.count, 0) || null;
    if (key === "client-memory" && facets) return facets.facets.clients.reduce((s, b) => s + b.count, 0) || null;
    if (key === "project-memory" && facets) return facets.facets.projects.reduce((s, b) => s + b.count, 0) || null;
    if (key === "decisions" && facets) return facets.facets.memoryTypes.find(b => b.id === "decision")?.count ?? null;
    if (key === "action-items" && facets) return facets.facets.memoryTypes.find(b => b.id === "action_item")?.count ?? null;
    return null;
  }

  const healthDot = health
    ? health.status === "ok" ? "dot-online"
    : health.status === "degraded" ? "dot-warning" : "dot-error"
    : "dot-standby";

  return (
    <aside className="mc-sidebar">
      <div className="mc-sidebar-brand">
        <span className="mc-sidebar-brand-icon">▤</span>
        <span className="mc-sidebar-brand-label">Memory Console</span>
        <span className={cn("status-dot mc-health-dot", healthDot)} title={health?.status ?? "unknown"} />
      </div>

      {NAV.map(({ group, items }) => (
        <div className="mc-nav-group" key={group}>
          <div className="mc-nav-group-label">{group}</div>
          {items.map(({ key, label, icon }) => {
            const b = badge(key);
            return (
              <button
                key={key}
                className={cn("mc-nav-item", view === key && "mc-nav-item-active")}
                onClick={() => setView(key)}
                type="button"
              >
                <span className="mc-nav-icon">{icon}</span>
                <span className="mc-nav-label">{label}</span>
                {b !== null && b > 0 && (
                  <span className={cn("mc-nav-badge", key === "rex-health" && b > 0 ? "mc-nav-badge-warn" : "")}>
                    {b > 99 ? "99+" : b}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

/* ─── Top Bar ─── */

function ConsoleTopBar({ view, query, setQuery, onRefresh, refreshing }: {
  view: ConsoleView;
  query: string;
  setQuery: (q: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const label = NAV.flatMap(g => g.items).find(i => i.key === view)?.label ?? view;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="mc-topbar">
      <div className="mc-topbar-left">
        <span className="mc-topbar-view">{label}</span>
      </div>
      <div className="mc-topbar-search">
        <span className="mc-search-icon">⌕</span>
        <input
          ref={inputRef}
          className="mc-search-input"
          placeholder="Search memory… (⌘K)"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button className="mc-search-clear" onClick={() => setQuery("")} type="button">×</button>
        )}
      </div>
      <div className="mc-topbar-right">
        <button
          className={cn("mc-refresh-btn", refreshing && "mc-refresh-btn-spin")}
          onClick={onRefresh}
          type="button"
          title="Refresh"
        >
          ↻
        </button>
      </div>
    </div>
  );
}

/* ─── Shared sub-components ─── */

function McPanel({ title, subtitle, action, children, className }: {
  title: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("mc-panel", className)}>
      <div className="mc-panel-head">
        <div>
          <div className="mc-panel-title">{title}</div>
          {subtitle && <div className="mc-panel-subtitle">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="mc-panel-body">{children}</div>
    </div>
  );
}

function McEmpty({ text }: { text: string }) {
  return <div className="mc-empty"><span className="mc-empty-text">{text}</span></div>;
}

function McError({ text }: { text: string }) {
  return <div className="mc-error-state"><span className="mc-error-icon">⚠</span><span>{text}</span></div>;
}

function McSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="mc-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="mc-skeleton-row">
          <div className="mc-skeleton-dot" />
          <div className="mc-skeleton-line" style={{ width: `${55 + (i % 4) * 10}%` }} />
          <div className="mc-skeleton-time" />
        </div>
      ))}
    </div>
  );
}

function ScoreBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
  return (
    <div className="mc-score-bar-wrap">
      {label && <span className="mc-score-bar-label">{label}</span>}
      <div className="mc-score-bar-track">
        <div className="mc-score-bar-fill" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="mc-score-bar-value" style={{ color: tone }}>{pct}%</span>
    </div>
  );
}

function FacetList({ buckets, color }: { buckets: FacetBucket[]; color?: string }) {
  if (!buckets.length) return <McEmpty text="No data" />;
  const max = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div className="mc-facet-list">
      {buckets.slice(0, 12).map(b => (
        <div key={b.id} className="mc-facet-row">
          <span className="mc-facet-label">{b.label}</span>
          <div className="mc-facet-track">
            <div className="mc-facet-fill" style={{ width: `${Math.round((b.count / max) * 100)}%`, background: color ?? "var(--accent)" }} />
          </div>
          <span className="mc-facet-count">{b.count}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── View: All Logs ─── */

function AllLogsView({ data, voiceLogs, query, onSelectLog, onSelectConv }: {
  data: any; voiceLogs: VoiceConvLog[]; query: string;
  onSelectLog: (e: any) => void; onSelectConv: (l: VoiceConvLog) => void;
}) {
  type Entry = { id: string; ts: string; type: "log" | "conv"; summary: string; sub: string; level?: string; item: any };

  const entries: Entry[] = [
    ...data.logs.events.map((e: any): Entry => ({
      id: `log-${e.id}`, ts: e.timestamp, type: "log",
      summary: e.summary, sub: e.stream, level: e.level, item: e,
    })),
    ...voiceLogs.map((l): Entry => ({
      id: `conv-${l.id}`, ts: l.lastUpdated, type: "conv",
      summary: `${l.agentName} · ${l.messages.length} messages`, sub: "conversation", item: l,
    })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const q = query.toLowerCase();
  const filtered = q ? entries.filter(e => `${e.summary} ${e.sub}`.toLowerCase().includes(q)) : entries;

  return (
    <div className="mc-view">
      <div className="mc-view-bar">
        <span className="mc-view-count">{filtered.length} entries</span>
      </div>
      <div className="mc-stream">
        {filtered.length === 0 ? <McEmpty text="No entries match your query" /> : filtered.map(e => (
          <button
            key={e.id}
            className="mc-stream-row"
            onClick={() => e.type === "conv" ? onSelectConv(e.item) : onSelectLog(e.item)}
          >
            <span className={cn("status-dot",
              e.type === "conv" ? "dot-standby"
              : e.level === "error" ? "dot-error"
              : e.level === "warning" ? "dot-warning" : "dot-info"
            )} />
            <div className="mc-stream-content">
              <span className="mc-stream-summary">{e.summary}</span>
              <span className="mc-stream-sub">{e.sub}</span>
            </div>
            <div className="mc-stream-meta">
              <span className={cn("mc-type-chip", `mc-type-${e.type}`)}>{e.type}</span>
              <span className="mc-stream-time">{formatRelative(e.ts)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── View: Conversations ─── */

const AGENT_COLORS: Record<string, string> = {
  abdi: "#74d697", ahmed: "#8bd7ff", dame: "#f0b24c",
  rex: "#ef4444", ayub: "#a78bfa", prime: "#8b8fff",
  atlas: "#06b6d4", sygma: "#f9a8d4", other: "#6b7280",
};
function agentColor(name: string) {
  return AGENT_COLORS[name.toLowerCase()] ?? AGENT_COLORS.other;
}

function ConversationsView({ data, voiceLogs, setVoiceLogs, query, openRoute, onSelect }: {
  data: any; voiceLogs: VoiceConvLog[]; setVoiceLogs: (l: VoiceConvLog[]) => void;
  query: string; openRoute: (r: string) => void; onSelect: (l: VoiceConvLog) => void;
}) {
  const [vcAgent, setVcAgent] = useState("all");

  const q = query.toLowerCase();
  const filtered = voiceLogs.filter(l => {
    if (vcAgent !== "all" && l.agentId !== vcAgent) return false;
    if (q) return l.messages.some(m => m.text.toLowerCase().includes(q)) || l.agentName.toLowerCase().includes(q);
    return true;
  });

  const deleteLog = (id: string) => {
    const updated = loadVoiceLogs().filter(l => l.id !== id);
    saveVoiceLogs(updated); setVoiceLogs(updated);
  };
  const togglePin = (id: string) => {
    const updated = loadVoiceLogs().map(l => l.id === id ? { ...l, savedForever: !l.savedForever } : l);
    saveVoiceLogs(updated); setVoiceLogs(updated);
  };

  return (
    <div className="mc-view">
      {/* Agent tiles */}
      <div className="mc-agent-tiles">
        {data.agents.map((a: any) => {
          const color = agentColor(a.name);
          const convs = voiceLogs.filter(l => l.agentId === a.id);
          return (
            <button key={a.id} className="mc-agent-tile" style={{ borderTopColor: color }}
              onClick={() => openRoute("/voice")}>
              <span className="mc-agent-tile-avatar" style={{ background: color + "22", color }}>{a.name[0]}</span>
              <span className="mc-agent-tile-name" style={{ color }}>{a.name}</span>
              <span className="mc-agent-tile-count">{convs.length}</span>
            </button>
          );
        })}
      </div>

      {/* Filter */}
      <div className="mc-view-bar">
        <select className="field field-sm" value={vcAgent} onChange={e => setVcAgent(e.target.value)} style={{ width: 130 }}>
          <option value="all">All agents</option>
          {data.agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span className="mc-view-count">{filtered.length} conversations</span>
      </div>

      {/* List */}
      <div className="mc-conv-list">
        {filtered.length === 0 ? (
          <McEmpty text={voiceLogs.length === 0 ? "No conversations yet — start one on the Voice tab" : "No conversations match your query"} />
        ) : filtered.map(log => {
          const color = agentColor(log.agentName);
          const last = log.messages[log.messages.length - 1];
          return (
            <div key={log.id} className="mc-conv-card" style={{ borderLeftColor: color }}>
              <button className="mc-conv-header" onClick={() => onSelect(log)}>
                <span className="mc-conv-dot" style={{ background: color }} />
                <span className="mc-conv-name" style={{ color }}>{log.agentName}</span>
                {log.savedForever && <span className="mc-pin-badge">pinned</span>}
                <span className="mc-conv-count">{log.messages.length} msg</span>
                <span className="mc-stream-time" style={{ marginLeft: "auto" }}>{formatRelative(log.startTime)}</span>
                <span className="mc-conv-arrow">›</span>
              </button>
              {last && (
                <div className="mc-conv-preview">
                  <span className="mc-conv-preview-role">{last.role === "user" ? "You" : log.agentName}:</span>
                  {" "}{last.text.slice(0, 120)}{last.text.length > 120 ? "…" : ""}
                </div>
              )}
              <div className="mc-conv-actions">
                <Btn variant="ghost" size="sm" onClick={() => togglePin(log.id)}>
                  {log.savedForever ? "Unpin" : "Pin"}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => { sessionStorage.setItem("vc_continue", JSON.stringify({ logId: log.id })); openRoute("/voice"); }}>
                  Continue
                </Btn>
                <button className="mc-delete-btn" onClick={() => deleteLog(log.id)} type="button">Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── View: System Events ─── */

function SystemEventsView({ data, query, onSelect, selected }: {
  data: any; query: string; onSelect: (e: any) => void; selected: any;
}) {
  const [level, setLevel] = useState("all");
  const [stream, setStream] = useState("all");
  const streams: string[] = ["all", ...data.logs.streams.map((s: any) => s.name)];

  const q = query.toLowerCase();
  const filtered = data.logs.events.filter((e: any) => {
    if (level !== "all" && e.level !== level) return false;
    if (stream !== "all" && e.stream !== stream) return false;
    if (q && !`${e.summary} ${e.detail} ${e.stream}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div className="mc-view mc-view-split">
      <div className="mc-split-left">
        <div className="mc-view-bar">
          <div className="segmented">
            {["all", "info", "warning", "error"].map(l => (
              <button key={l} className={cn("segmented-btn", level === l && "segmented-btn-active")} onClick={() => setLevel(l)}>{l}</button>
            ))}
          </div>
          <select className="field field-sm" value={stream} onChange={e => setStream(e.target.value)} style={{ width: 110 }}>
            {streams.map(s => <option key={s}>{s}</option>)}
          </select>
          <span className="mc-view-count">{filtered.length}</span>
        </div>
        <div className="mc-stream">
          {filtered.length === 0 ? <McEmpty text="No events match" /> : filtered.map((e: any) => (
            <button key={e.id} className={cn("mc-stream-row", selected?.id === e.id && "mc-stream-row-active")} onClick={() => onSelect(e)}>
              <span className={cn("status-dot", e.level === "error" ? "dot-error" : e.level === "warning" ? "dot-warning" : "dot-info")} />
              <div className="mc-stream-content">
                <span className="mc-stream-summary">{e.summary}</span>
                <span className="mc-stream-sub">{e.stream}</span>
              </div>
              <span className="mc-stream-time">{formatRelative(e.timestamp)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mc-split-right">
        {selected ? (
          <div className="mc-log-detail">
            <div className="mc-log-detail-head">
              <StatusBadge value={selected.level} />
              <span className="mc-log-detail-stream">{selected.stream}</span>
              <span className="mc-log-detail-time">{formatStamp(selected.timestamp)}</span>
            </div>
            <div className="mc-log-detail-summary">{selected.summary}</div>
            <div className="mc-log-detail-body">{selected.detail}</div>
          </div>
        ) : (
          <McEmpty text="Select an event to inspect" />
        )}
      </div>
    </div>
  );
}

/* ─── View: Rex — Health ─── */

function RexHealthView({ health, loading, error, onRefresh }: {
  health: MemoryHealth | null; loading: boolean; error: string; onRefresh: () => void;
}) {
  if (loading) return <McSkeleton rows={8} />;
  if (error || !health) return (
    <div className="mc-view">
      <McError text={error || "Health data unavailable"} />
      <div style={{ marginTop: 16, paddingLeft: 16 }}><Btn variant="secondary" size="sm" onClick={onRefresh}>Retry</Btn></div>
    </div>
  );

  const statusColor = health.status === "ok" ? "#22c55e" : health.status === "degraded" ? "#eab308" : "#ef4444";
  const queueTotal = health.queue.pending + health.queue.processing + health.queue.failed + health.queue.deadLetter;

  return (
    <div className="mc-view">
      {/* Status banner */}
      <div className="mc-health-banner" style={{ borderLeftColor: statusColor }}>
        <span className="mc-health-banner-status" style={{ color: statusColor }}>{health.status.toUpperCase()}</span>
        <span className="mc-health-banner-ts">Checked {formatRelative(health.generatedAt)}</span>
        <span className="mc-health-banner-db">
          DB {health.database.reachable ? "reachable" : "unreachable"}
          {health.database.migrationVersion ? ` · v${health.database.migrationVersion}` : ""}
        </span>
        <Btn variant="ghost" size="sm" onClick={onRefresh}>Refresh</Btn>
      </div>

      {/* Metric grid */}
      <div className="mc-metric-grid">
        {[
          { label: "Pending", value: health.queue.pending, tone: health.queue.pending > 50 ? "warn" : "ok" },
          { label: "Processing", value: health.queue.processing, tone: "ok" },
          { label: "Failed", value: health.queue.failed, tone: health.queue.failed > 0 ? "error" : "ok" },
          { label: "Dead Letter", value: health.queue.deadLetter, tone: health.queue.deadLetter > 0 ? "error" : "ok" },
          { label: "Total Records", value: health.ingestion.totalSourceRecords, tone: "ok" },
          { label: "Last 24h", value: health.ingestion.recordsLast24h, tone: "ok" },
          { label: "Integrity Warn", value: health.ingestion.integrityWarnings, tone: health.ingestion.integrityWarnings > 0 ? "warn" : "ok" },
          { label: "Queue Total", value: queueTotal, tone: "ok" },
        ].map(m => (
          <div key={m.label} className={cn("mc-metric", `mc-metric-${m.tone}`)}>
            <div className="mc-metric-value">{m.value.toLocaleString()}</div>
            <div className="mc-metric-label">{m.label}</div>
          </div>
        ))}
      </div>
      {health.queue.oldestPendingSeconds !== null && (
        <div className="mc-queue-lag">
          Queue lag: <strong>{Math.round(health.queue.oldestPendingSeconds / 60)}m</strong> oldest pending
        </div>
      )}

      {/* Sources table */}
      <div className="mc-sources-section">
        <div className="mc-sources-header">
          <span className="mc-section-label">Sources ({health.sources.length})</span>
        </div>
        <div className="mc-sources-table">
          <div className="mc-sources-thead">
            <span>Source</span><span>Type</span><span>Status</span><span>Trust</span><span>Completeness</span><span>Stale</span>
          </div>
          {health.sources.map((s: MemoryHealthSource) => (
            <div key={s.sourceId} className="mc-sources-row">
              <span className="mc-source-id">{s.sourceId}</span>
              <span className="mc-source-type text-3">{s.sourceType}</span>
              <span className={cn("mc-source-status", `mc-status-${s.status}`)}>{s.status}</span>
              <ScoreBar value={s.trustScore} />
              <ScoreBar value={s.completenessScore} />
              <span className="mc-source-stale text-3">
                {s.staleByMinutes === null ? "—" : s.staleByMinutes < 60 ? `${s.staleByMinutes}m` : `${Math.round(s.staleByMinutes / 60)}h`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── View: Ahmed — Curation ─── */

function AhmedCurationView({ facets, loading, error, onRefresh }: {
  facets: MemoryFacets | null; loading: boolean; error: string; onRefresh: () => void;
}) {
  if (loading) return <McSkeleton rows={6} />;
  if (error || !facets) return (
    <div className="mc-view">
      <McError text={error || "Facets unavailable"} />
      <div style={{ marginTop: 16, paddingLeft: 16 }}><Btn variant="secondary" size="sm" onClick={onRefresh}>Retry</Btn></div>
    </div>
  );

  const { sourceCoverage, facets: f } = facets;
  const coverageItems = [
    { label: "High reliability", value: sourceCoverage.highReliabilitySources, color: "#22c55e" },
    { label: "Medium reliability", value: sourceCoverage.mediumReliabilitySources, color: "#eab308" },
    { label: "Low reliability", value: sourceCoverage.lowReliabilitySources, color: "#ef4444" },
    { label: "Inaccessible native", value: sourceCoverage.inaccessibleNativeSources, color: "#6b7280" },
  ];

  return (
    <div className="mc-view mc-view-2col">
      {/* Source coverage */}
      <McPanel title="Source Coverage" subtitle={`${sourceCoverage.totalSources} total sources`}>
        {coverageItems.map(c => (
          <div key={c.label} className="mc-cov-row">
            <span className="mc-cov-label">{c.label}</span>
            <span className="mc-cov-value" style={{ color: c.color }}>{c.value}</span>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <div className="mc-cov-bar-track">
            {coverageItems.map(c => (
              sourceCoverage.totalSources > 0 ? (
                <div key={c.label} className="mc-cov-bar-seg"
                  style={{ width: `${Math.round((c.value / sourceCoverage.totalSources) * 100)}%`, background: c.color }}
                  title={c.label}
                />
              ) : null
            ))}
          </div>
        </div>
      </McPanel>

      {/* Memory types */}
      <McPanel title="Memory Types" subtitle={`${f.memoryTypes.reduce((s, b) => s + b.count, 0)} objects`}>
        <FacetList buckets={f.memoryTypes} color="#8b5cf6" />
      </McPanel>

      {/* Tags */}
      <McPanel title="Top Tags" subtitle={`${f.tags.length} distinct tags`}>
        <div className="mc-tag-cloud">
          {f.tags.slice(0, 30).map(t => (
            <span key={t.id} className="mc-tag">{t.label}<span className="mc-tag-count">{t.count}</span></span>
          ))}
          {f.tags.length === 0 && <McEmpty text="No tags indexed" />}
        </div>
      </McPanel>

      {/* Agents */}
      <McPanel title="Agents" subtitle="memory by agent">
        <FacetList buckets={f.agents} color="#8bd7ff" />
      </McPanel>

      {/* Clients */}
      <McPanel title="Clients" subtitle="memory by client">
        {f.clients.length ? <FacetList buckets={f.clients} color="#74d697" /> : <McEmpty text="No client entities indexed" />}
      </McPanel>

      {/* Statuses */}
      <McPanel title="Statuses">
        <FacetList buckets={f.statuses} />
      </McPanel>
    </div>
  );
}

/* ─── View: Abdi — Oversight ─── */

function AbdiOversightView({ health, facets, loading }: {
  health: MemoryHealth | null; facets: MemoryFacets | null; loading: boolean;
}) {
  if (loading) return <McSkeleton rows={7} />;

  const systemOk = health?.status === "ok";
  const dbOk = health?.database.reachable;
  const failedJobs = (health?.queue.failed ?? 0) + (health?.queue.deadLetter ?? 0);
  const integrityIssues = health?.ingestion.integrityWarnings ?? 0;
  const totalMemory = facets ? Object.values(facets.facets).reduce((s, arr) => s + (arr as FacetBucket[]).reduce((a, b) => a + b.count, 0), 0) : 0;

  const gaps: string[] = [];
  if (!dbOk) gaps.push("Database unreachable");
  if (failedJobs > 0) gaps.push(`${failedJobs} failed ingestion jobs`);
  if (integrityIssues > 0) gaps.push(`${integrityIssues} integrity warnings`);
  if (facets && facets.sourceCoverage.inaccessibleNativeSources > 0) gaps.push(`${facets.sourceCoverage.inaccessibleNativeSources} inaccessible native sources`);
  if (facets && facets.sourceCoverage.lowReliabilitySources > 0) gaps.push(`${facets.sourceCoverage.lowReliabilitySources} low-reliability sources`);

  return (
    <div className="mc-view mc-view-2col">
      {/* System state */}
      <McPanel title="System State" subtitle="executive summary">
        <div className="mc-oversight-items">
          {[
            { label: "Memory System", value: health?.status ?? "unknown", tone: systemOk ? "ok" : "warn" },
            { label: "Database", value: dbOk ? "reachable" : "unreachable", tone: dbOk ? "ok" : "error" },
            { label: "Failed Jobs", value: String(failedJobs), tone: failedJobs > 0 ? "error" : "ok" },
            { label: "Integrity Issues", value: String(integrityIssues), tone: integrityIssues > 0 ? "warn" : "ok" },
            { label: "24h Ingestion", value: String(health?.ingestion.recordsLast24h ?? 0), tone: "ok" },
            { label: "Total Records", value: String(health?.ingestion.totalSourceRecords ?? 0), tone: "ok" },
          ].map(item => (
            <div key={item.label} className="mc-oversight-row">
              <span className="mc-oversight-label">{item.label}</span>
              <span className={cn("mc-oversight-value", `mc-oversight-${item.tone}`)}>{item.value}</span>
            </div>
          ))}
        </div>
      </McPanel>

      {/* Blind spots */}
      <McPanel title="Coverage Gaps" subtitle="issues requiring attention">
        {gaps.length === 0 ? (
          <div className="mc-gap-ok">
            <span className="mc-gap-ok-dot" />
            <span>No coverage gaps detected</span>
          </div>
        ) : (
          <div className="mc-gap-list">
            {gaps.map((g, i) => (
              <div key={i} className="mc-gap-item">
                <span className="mc-gap-bullet">!</span>
                <span>{g}</span>
              </div>
            ))}
          </div>
        )}
      </McPanel>

      {/* Memory themes */}
      <McPanel title="Memory Themes" subtitle="top indexed types">
        {facets ? <FacetList buckets={facets.facets.memoryTypes} color="#8b5cf6" /> : <McEmpty text="Facets not loaded" />}
      </McPanel>

      {/* Source reliability */}
      <McPanel title="Source Reliability" subtitle={`${facets?.sourceCoverage.totalSources ?? 0} sources`}>
        {facets ? (
          <div className="mc-oversight-items">
            {[
              { label: "High", value: facets.sourceCoverage.highReliabilitySources, color: "#22c55e" },
              { label: "Medium", value: facets.sourceCoverage.mediumReliabilitySources, color: "#eab308" },
              { label: "Low", value: facets.sourceCoverage.lowReliabilitySources, color: "#ef4444" },
              { label: "Inaccessible", value: facets.sourceCoverage.inaccessibleNativeSources, color: "#6b7280" },
            ].map(r => (
              <div key={r.label} className="mc-oversight-row">
                <span className="mc-oversight-label">{r.label}</span>
                <span style={{ color: r.color, fontWeight: 600 }}>{r.value}</span>
              </div>
            ))}
          </div>
        ) : <McEmpty text="Facets not loaded" />}
      </McPanel>

      {/* Severities */}
      {facets && facets.facets.severities.length > 0 && (
        <McPanel title="Severity Distribution">
          <FacetList buckets={facets.facets.severities} color="#ef4444" />
        </McPanel>
      )}

      {/* Projects */}
      {facets && (
        <McPanel title="Projects" subtitle="memory by project">
          {facets.facets.projects.length ? <FacetList buckets={facets.facets.projects} color="#f0b24c" /> : <McEmpty text="No project entities indexed" />}
        </McPanel>
      )}
    </div>
  );
}

/* ─── View: Stub (not-yet-implemented) ─── */

function StubView({ title, description, facets, facetKey }: {
  title: string; description: string;
  facets: MemoryFacets | null; facetKey?: keyof MemoryFacets["facets"];
}) {
  const buckets = facets && facetKey ? facets.facets[facetKey] : [];
  return (
    <div className="mc-view">
      <div className="mc-stub-banner">
        <span className="mc-stub-icon">◫</span>
        <div>
          <div className="mc-stub-title">{title}</div>
          <div className="mc-stub-desc">{description}</div>
        </div>
      </div>
      {buckets.length > 0 && (
        <div style={{ padding: "0 20px" }}>
          <div className="mc-section-label" style={{ marginBottom: 12 }}>Indexed counts (from facets)</div>
          <FacetList buckets={buckets as FacetBucket[]} />
        </div>
      )}
    </div>
  );
}

/* ─── Detail Panel ─── */

function ConsoleDetailPanel({ type, item, onClose, openRoute }: {
  type: string; item: any; onClose: () => void; openRoute: (r: string) => void;
}) {
  if (!item) return null;

  return (
    <aside className="mc-detail">
      <div className="mc-detail-head">
        <span className="mc-detail-type">{type}</span>
        <button className="mc-detail-close" onClick={onClose} type="button">×</button>
      </div>
      <div className="mc-detail-body">
        {type === "conversation" && <ConversationDetail log={item} openRoute={openRoute} />}
        {type === "log-event" && <LogEventDetail event={item} />}
      </div>
    </aside>
  );
}

function ConversationDetail({ log, openRoute }: { log: VoiceConvLog; openRoute: (r: string) => void }) {
  const color = agentColor(log.agentName);
  return (
    <div className="mc-conv-detail">
      <div className="mc-conv-detail-header">
        <span className="mc-conv-detail-agent" style={{ color }}>{log.agentName}</span>
        <span className="mc-conv-detail-ts">{formatRelative(log.startTime)}</span>
      </div>
      <div className="mc-conv-detail-meta">
        <span>{log.messages.length} messages</span>
        {log.savedForever && <span className="mc-pin-badge">pinned</span>}
      </div>
      <div className="mc-conv-detail-thread">
        {log.messages.map(m => (
          <div key={m.id} className={cn("mc-msg", m.role === "user" ? "mc-msg-user" : "mc-msg-agent")}>
            <div className="mc-msg-role" style={m.role === "agent" ? { color } : {}}>{m.role === "user" ? "You" : log.agentName}</div>
            <div className="mc-msg-text">{m.text}</div>
            <div className="mc-msg-ts">{formatRelative(m.ts)}</div>
          </div>
        ))}
      </div>
      <div className="mc-conv-detail-actions">
        <Btn variant="primary" size="sm" onClick={() => { sessionStorage.setItem("vc_continue", JSON.stringify({ logId: log.id })); openRoute("/voice"); }}>Continue</Btn>
      </div>
    </div>
  );
}

function LogEventDetail({ event }: { event: any }) {
  return (
    <div className="mc-event-detail">
      <div className="mc-event-detail-grid">
        <div className="mc-event-fact"><span>Stream</span><strong>{event.stream}</strong></div>
        <div className="mc-event-fact"><span>Level</span><StatusBadge value={event.level} /></div>
        <div className="mc-event-fact"><span>Time</span><strong>{formatStamp(event.timestamp)}</strong></div>
      </div>
      <div className="mc-event-summary">{event.summary}</div>
      <div className="mc-event-body">{event.detail}</div>
    </div>
  );
}

/* ─── Root: MemoryConsolePage ─── */

export function MemoryConsolePage({ data, openRoute }: PageProps) {
  // Version stamp — remove after confirming deployment
  if (typeof window !== "undefined" && !(window as any).__mcLogged) {
    (window as any).__mcLogged = true;
    console.log("[MemoryConsole] v2 loaded — build 1775587758434");
  }

  const [view, setView] = useState<ConsoleView>("all-logs");
  const [query, setQuery] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<{ type: string; item: any } | null>(null);
  const [voiceLogs, setVoiceLogs] = useState<VoiceConvLog[]>([]);
  const [health, setHealth] = useState<MemoryHealth | null>(null);
  const [facets, setFacets] = useState<MemoryFacets | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [healthError, setHealthError] = useState("");
  const [facetsError, setFacetsError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLogEvent, setSelectedLogEvent] = useState<any>(data.logs.events[0] ?? null);

  // Load voice logs on mount + poll
  useEffect(() => {
    const load = () => setVoiceLogs(loadVoiceLogs());
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  // Fetch health + facets when relevant views are active
  const loadHealth = useCallback(async () => {
    setHealthLoading(true); setHealthError("");
    const r = await fetchMemoryHealth();
    if (r.ok) setHealth(r.data); else setHealthError(r.error);
    setHealthLoading(false);
  }, []);

  const loadFacets = useCallback(async () => {
    setFacetsLoading(true); setFacetsError("");
    const r = await fetchMemoryFacets();
    if (r.ok) setFacets(r.data); else setFacetsError(r.error);
    setFacetsLoading(false);
  }, []);

  useEffect(() => {
    if (["rex-health"].includes(view) && !health && !healthLoading) void loadHealth();
    if (["ahmed-curation", "abdi-oversight", "agent-memory", "client-memory", "project-memory", "decisions", "action-items"].includes(view) && !facets && !facetsLoading) void loadFacets();
    if (view === "abdi-oversight") {
      if (!health && !healthLoading) void loadHealth();
    }
  }, [view]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([loadHealth(), loadFacets()]);
    setRefreshing(false);
  };

  const openDetail = (type: string, item: any) => setSelectedDetail({ type, item });
  const closeDetail = () => setSelectedDetail(null);

  const renderView = () => {
    switch (view) {
      case "all-logs":
        return <AllLogsView data={data} voiceLogs={voiceLogs} query={query}
          onSelectLog={e => openDetail("log-event", e)}
          onSelectConv={l => openDetail("conversation", l)} />;
      case "conversations":
        return <ConversationsView data={data} voiceLogs={voiceLogs} setVoiceLogs={setVoiceLogs}
          query={query} openRoute={openRoute} onSelect={l => openDetail("conversation", l)} />;
      case "system-events":
        return <SystemEventsView data={data} query={query}
          onSelect={e => { setSelectedLogEvent(e); openDetail("log-event", e); }}
          selected={selectedLogEvent} />;
      case "rex-health":
        return <RexHealthView health={health} loading={healthLoading} error={healthError} onRefresh={loadHealth} />;
      case "ahmed-curation":
        return <AhmedCurationView facets={facets} loading={facetsLoading} error={facetsError} onRefresh={loadFacets} />;
      case "abdi-oversight":
        return <AbdiOversightView health={health} facets={facets} loading={healthLoading || facetsLoading} />;
      case "agent-memory":
        return <StubView title="Agent Memory" description="Indexed memory scoped by agent — connect /api/memory/objects to activate" facets={facets} facetKey="agents" />;
      case "client-memory":
        return <StubView title="Client Memory" description="Indexed memory scoped by client — connect /api/memory/objects to activate" facets={facets} facetKey="clients" />;
      case "project-memory":
        return <StubView title="Project Memory" description="Indexed memory scoped by project — connect /api/memory/objects to activate" facets={facets} facetKey="projects" />;
      case "durable-memory":
        return <StubView title="Durable Memory" description="Persistent memory objects — connect /api/memory/objects to activate" facets={facets} facetKey="memoryTypes" />;
      case "decisions":
        return <StubView title="Decisions" description="Extracted decision records — connect /api/memory/objects?type=decision to activate" facets={facets} facetKey="memoryTypes" />;
      case "action-items":
        return <StubView title="Action Items" description="Extracted action items — connect /api/memory/objects?type=action_item to activate" facets={facets} facetKey="memoryTypes" />;
      case "alerts":
        return <StubView title="Alerts" description="Health alerts and system notifications — connect /api/memory/health/alerts to activate" facets={null} />;
      case "archives":
        return <StubView title="Archives" description="Archived memory objects — connect /api/memory/objects?archived=true to activate" facets={null} />;
      default:
        return <McEmpty text="View not found" />;
    }
  };

  return (
    <div className="mc-shell">
      <ConsoleSidebar view={view} setView={v => { setView(v); setSelectedDetail(null); }} health={health} facets={facets} />
      <div className="mc-main">
        <ConsoleTopBar view={view} query={query} setQuery={setQuery} onRefresh={handleRefresh} refreshing={refreshing} />
        <div className="mc-body">
          <div className="mc-results">
            {renderView()}
          </div>
          {selectedDetail && (
            <ConsoleDetailPanel
              type={selectedDetail.type}
              item={selectedDetail.item}
              onClose={closeDetail}
              openRoute={openRoute}
            />
          )}
        </div>
      </div>
    </div>
  );
}
