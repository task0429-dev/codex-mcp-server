import { useState, useDeferredValue, useMemo, useEffect, useRef, useCallback } from "react";
import { ActionButton, Btn, MetricCard, StatusBadge, StatusDot, TagRow } from "./shell";
import { cn, dotTone, formatRelative, formatStamp, type PageProps } from "./types";
import { AgentsOfficePage } from "./agents-office";
import { AGENT_COLORS as _AGENT_COLORS, agentColor as _agentColorFn, AgentAvatar } from "./agent-constants";

const AGENT_TONES: Record<string, string> = {
  TASK: "tone-task", Abdi: "tone-abdi", Ahmed: "tone-ahmed", Dame: "tone-dame",
  Rex: "tone-rex", Prime: "tone-prime", Atlas: "tone-atlas", Ayub: "tone-ayub", Sygma: "tone-sygma",
  Codex: "tone-ayub",
};

const STT_NOISE_TRANSCRIPTS = new Set([
  "you",
  "thank you",
  "thanks",
  "thanks you",
  "thank you thank you",
  "thanks for watching",
  "thank you for watching",
  "bye",
  "goodbye",
]);

function normalizeVoiceTranscript(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelySttNoise(text: string) {
  return STT_NOISE_TRANSCRIPTS.has(normalizeVoiceTranscript(text));
}

/* ─── Live Agent Fleet Hook ─── */
function useLiveAgents(initial: any[]) {
  const [agents, setAgents] = useState<any[]>(initial);
  const [lastPoll, setLastPoll] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/agents/live");
        if (r.ok && !cancelled) {
          const { agents: live, timestamp } = await r.json();
          setAgents(live);
          setLastPoll(timestamp);
        }
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return { agents, lastPoll };
}

/* ─── Live Activity Feed Hook (SSE + persistent history) ─── */
const MAX_FEED = 8;
function useLiveFeed() {
  const [feed, setFeed] = useState<any[]>([]);

  useEffect(() => {
    const SKIP_TYPES = new Set(["agent_at_station", "agent_interact"]);

    // 1. Load recent history on every mount (survives tab-switch and page refresh)
    fetch("/api/mission-control/events")
      .then(r => r.json())
      .then(({ events }) => {
        const entries = (events || [])
          .filter((ev: any) => !SKIP_TYPES.has(ev.type))
          .slice(0, MAX_FEED).map((ev: any) => ({
          id: ev.id,
          actor: ev.actor || ev.source || "System",
          title: ev.title || ev.summary || "Activity",
          timestamp: ev.timestamp,
          fresh: false,
        }));
        setFeed(entries);
      })
      .catch(() => {});

    // 2. Subscribe to SSE for live additions
    const es = new EventSource("/api/mission-control/events/stream");
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "connected") return;
        if (SKIP_TYPES.has(event.type)) return;
        const entry = {
          id: event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          actor: event.actor || event.source || "System",
          title: event.title || event.summary || "Activity",
          timestamp: event.timestamp || new Date().toISOString(),
          fresh: true,
        };
        setFeed((prev) => {
          // avoid duplicate if history fetch already included this id
          if (prev.some(x => x.id === entry.id)) return prev;
          return [entry, ...prev].slice(0, MAX_FEED);
        });
        setTimeout(() => {
          setFeed((prev) => prev.map((x) => x.id === entry.id ? { ...x, fresh: false } : x));
        }, 600);
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  return feed;
}

/* ─── Project Registry Hook ─── */
function useProjectRegistry() {
  const [projects, setProjects] = useState<any[]>([]);

  const load = () => {
    fetch("/api/projects/registry")
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const toggleItem = async (projectId: string, itemId: string, done: boolean) => {
    // Optimistic update
    setProjects(prev => prev.map(p =>
      p.id !== projectId ? p : {
        ...p,
        checklist: p.checklist.map((c: any) => c.id === itemId ? { ...c, done } : c),
      }
    ));
    await fetch(`/api/projects/registry/${projectId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
  };

  return { projects, toggleItem, reload: load };
}

function ProjectStatusHero({ project, openRoute }: { project: any; openRoute: (route: string) => void }) {
  const stats = calcProjectStats(project);
  const eta = project?.eta ? formatStamp(project.eta) : etaLabel(stats.hoursLeft);
  const activeOwners = Array.from(new Set((project.checklist || []).filter((item: any) => !item.done).map((item: any) => item.agent))).filter(Boolean);

  return (
    <div
      onClick={() => openRoute("/projects")}
      style={{
        marginBottom: 16,
        cursor: "pointer",
        borderRadius: 16,
        border: "1px solid rgba(224,53,53,0.24)",
        background: "linear-gradient(135deg, rgba(224,53,53,0.16), rgba(255,255,255,0.035) 58%, rgba(255,255,255,0.02))",
        boxShadow: "0 24px 40px rgba(0,0,0,.24)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "18px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff9c9c", marginBottom: 5 }}>
              Project Status
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", lineHeight: 1.15 }}>
              {project.name}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>
              {project.client} · {project.phase}
            </div>
          </div>
          <div style={{
            padding: "8px 10px",
            borderRadius: 999,
            border: "1px solid rgba(34,197,94,0.24)",
            background: "rgba(34,197,94,0.12)",
            color: "#86efac",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {project.status || "active"}
          </div>
        </div>

        <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 12 }}>
          <div style={{ width: `${stats.pct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, rgba(224,53,53,0.72), rgba(224,53,53,1))" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {[
            { label: "Completion", value: `${stats.pct}%` },
            { label: "Done", value: `${stats.done}/${stats.total}` },
            { label: "ETA", value: eta || "TBD" },
            { label: "Updated By", value: project.updatedBy || "Abdi" },
            { label: "Open Owners", value: `${activeOwners.length}` },
          ].map((item) => (
            <div key={item.label} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.56)", marginBottom: 5 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const LINK_ICONS: Record<string, string> = {
  notion: "◈", gdrive: "▲", github: "⌥", website: "↗", other: "→",
};
const LINK_COLORS: Record<string, string> = {
  notion: "#6366f1", gdrive: "#f59e0b", github: "#e5e7eb", website: "#22c55e", other: "#6b7280",
};
const AGENT_DOT_COLORS: Record<string, string> = {
  Abdi: "#ef4444", Ahmed: "#84cc16", Dame: "#f59e0b", Rex: "#22c55e",
  Prime: "#8b5cf6", Atlas: "#06b6d4", Ayub: "#3b82f6", Sygma: "#ec4899",
};

function calcProjectStats(project: any) {
  const total = project.checklist?.length || 0;
  const done  = (project.checklist || []).filter((c: any) => c.done).length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);
  const hoursLeft = (project.checklist || [])
    .filter((c: any) => !c.done)
    .reduce((s: number, c: any) => s + (c.estimatedHours || 0), 0);
  return { total, done, pct, hoursLeft };
}

function etaLabel(hoursLeft: number): string {
  if (hoursLeft <= 0) return "Ready";
  if (hoursLeft < 1)  return "< 1 hour";
  if (hoursLeft < 24) return `~${hoursLeft}h`;
  const days = Math.ceil(hoursLeft / 8);
  return `~${days} day${days === 1 ? "" : "s"}`;
}

function useCountdown(targetIso: string | null) {
  const [diff, setDiff] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => setDiff(Math.max(0, new Date(targetIso).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso || diff <= 0) return null;
  const s = Math.floor(diff / 1000) % 60;
  const m = Math.floor(diff / 60000) % 60;
  const h = Math.floor(diff / 3600000) % 24;
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

/* ─── Active Projects Panel ─── */

function ProjectCard({ project, toggleItem, actions }: { project: any; toggleItem: (pid: string, iid: string, done: boolean) => void; actions: any }) {
  const stats = calcProjectStats(project);
  const [calendarAdded, setCalendarAdded] = useState(false);
  const [collapsed, setCollapsed] = useState(stats.pct === 100); // auto-collapse completed projects

  const etaIso: string | null = useMemo(() => {
    if (project.eta) return project.eta;
    if (stats.hoursLeft > 0) return new Date(Date.now() + stats.hoursLeft * 3600 * 1000).toISOString();
    return null;
  }, [project, stats]);

  const countdown = useCountdown(etaIso);

  useEffect(() => {
    if (!etaIso || calendarAdded || !actions || stats.pct === 100) return;
    setCalendarAdded(true);
    const end = new Date(new Date(etaIso).getTime() + 3600 * 1000).toISOString();
    actions.calendarCreateEvent({
      title: `${project.name} — Target Completion`,
      start: etaIso, end, owner: "Abdi", linkedProject: project.id,
      detail: `Estimated completion for ${project.name}. ${stats.done}/${stats.total} tasks done at time of creation.`,
    }).catch(() => {});
  }, [etaIso]);

  const agentWork = useMemo(() => {
    const map: Record<string, { tasks: string[]; hours: number }> = {};
    (project.checklist || []).filter((c: any) => !c.done).forEach((c: any) => {
      const a = c.agent || "Unassigned";
      if (!map[a]) map[a] = { tasks: [], hours: 0 };
      map[a].tasks.push(c.title);
      map[a].hours += c.estimatedHours || 0;
    });
    return Object.entries(map);
  }, [project]);

  const isActive = project.status === "active";
  const accent = stats.pct === 100 ? "#22c55e" : "#e03535";
  const circumference = 2 * Math.PI * 36;
  const dash = (stats.pct / 100) * circumference;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 20px rgba(0,0,0,.25)",
        opacity: stats.pct === 100 && !isActive ? 0.75 : 1,
      }}>
        {/* ── Header (always visible, click to collapse) ── */}
        <div
          onClick={() => setCollapsed(c => !c)}
          style={{
            padding: "14px 20px 12px", background: "var(--surface-2)",
            borderBottom: collapsed ? "none" : "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
          }}
        >
          <div style={{ position: "relative", flexShrink: 0, width: 72, height: 72 }}>
            <svg width="72" height="72" viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="6" />
              <circle cx="40" cy="40" r="36" fill="none" stroke={accent} strokeWidth="6"
                strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
                style={{ transition: "stroke-dasharray .6s ease", filter: `drop-shadow(0 0 6px ${accent}90)` }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: accent }}>{stats.pct}%</span>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              {isActive && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0, boxShadow: "0 0 6px #22c55e90", animation: "pulse-dot 2s ease-in-out infinite" }} />}
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
                background: isActive ? "#22c55e18" : "rgba(255,255,255,.06)", color: isActive ? "#22c55e" : "var(--text-4)",
                padding: "2px 7px", borderRadius: 4, flexShrink: 0 }}>
                {isActive ? "ACTIVE" : stats.pct === 100 ? "DONE" : project.status?.toUpperCase() || "DRAFT"}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-4)", flexShrink: 0 }}>{collapsed ? "▼" : "▲"}</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6 }}>{project.client} · {project.phase}</div>
            <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,.07)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, width: `${stats.pct}%`, background: `linear-gradient(90deg, ${accent}99, ${accent})`, transition: "width .6s ease" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{stats.done}/{stats.total} done</span>
              {countdown && etaIso && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase" }}>ETA</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums" }}>{countdown}</span>
                </span>
              )}
              {calendarAdded && <span style={{ fontSize: 9, color: "#6366f1", fontWeight: 600 }}>↗ Calendar</span>}
            </div>
          </div>
        </div>

        {!collapsed && (
          <>
            {agentWork.length > 0 && (
              <div style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,.01)" }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Remaining Work by Agent</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {agentWork.map(([agent, work]) => (
                    <div key={agent} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "7px 10px", borderRadius: 8,
                      background: (AGENT_DOT_COLORS[agent] || "#6b7280") + "0e", border: `1px solid ${(AGENT_DOT_COLORS[agent] || "#6b7280")}25`, minWidth: 140, flex: "1 1 140px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: AGENT_DOT_COLORS[agent] || "#6b7280", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: AGENT_DOT_COLORS[agent] || "var(--text-2)" }}>{agent}</span>
                        <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--text-4)", fontWeight: 600 }}>{work.tasks.length} task{work.tasks.length > 1 ? "s" : ""}{work.hours > 0 ? ` · ${work.hours}h` : ""}</span>
                      </div>
                      {work.tasks.map((t, i) => (
                        <div key={i} style={{ fontSize: 9.5, color: "var(--text-3)", paddingLeft: 12, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {t}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: "12px 20px 16px" }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>Checklist</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {(project.checklist || []).map((item: any, i: number) => (
                  <label key={item.id}
                    onClick={() => toggleItem(project.id, item.id, !item.done)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                      background: item.done ? "rgba(34,197,94,.04)" : i % 2 === 0 ? "rgba(255,255,255,.02)" : "transparent",
                      border: `1px solid ${item.done ? "rgba(34,197,94,.12)" : "transparent"}`, transition: "background .12s" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${item.done ? "#22c55e" : "rgba(255,255,255,.18)"}`, background: item.done ? "#22c55e18" : "transparent", display: "grid", placeItems: "center", transition: "all .15s" }}>
                      {item.done && <span style={{ fontSize: 9, color: "#22c55e", lineHeight: 1, fontWeight: 800 }}>✓</span>}
                    </div>
                    <span style={{ flex: 1, fontSize: 11.5, lineHeight: 1.4, color: item.done ? "var(--text-4)" : "var(--text-1)", textDecoration: item.done ? "line-through" : "none", textDecorationColor: "rgba(255,255,255,.2)" }}>
                      {item.title}
                    </span>
                    {item.agent && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                        background: (AGENT_DOT_COLORS[item.agent] || "#6b7280") + "18",
                        color: item.done ? "var(--text-4)" : (AGENT_DOT_COLORS[item.agent] || "var(--text-3)"),
                        border: `1px solid ${(AGENT_DOT_COLORS[item.agent] || "#6b7280")}25` }}>
                        {item.agent}
                      </span>
                    )}
                    {!item.done && item.status === "in-progress" && (
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", flexShrink: 0, boxShadow: "0 0 4px #f59e0b80", animation: "pulse-dot 1.5s ease-in-out infinite" }} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActiveProjectsSection({ actions }: { actions: any }) {
  const { projects, toggleItem } = useProjectRegistry();
  // Only show projects that are not fully completed
  const live = projects.filter((p: any) => p.status !== "completed" && calcProjectStats(p).pct < 100);
  const sorted = [...live].sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : 0));

  if (!sorted.length) return (
    <div style={{ marginBottom: 24, padding: "16px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-3)", fontSize: 12 }}>
      No active projects. Ask an agent to create one.
    </div>
  );

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>Projects</div>
      {sorted.map(p => (
        <ProjectCard key={p.id} project={p} toggleItem={toggleItem} actions={actions} />
      ))}
    </div>
  );
}

/* ─── Live Now Section ─── */

function LiveNowSection({ agents, feed, lastPoll, onAgentClick }: {
  agents: any[];
  feed: any[];
  lastPoll: string;
  onAgentClick: (agent: any) => void;
}) {
  // Per-agent: most recent feed event
  const agentRows = agents.map(agent => {
    const latest = feed.find(e =>
      e.actor?.toLowerCase() === agent.name?.toLowerCase() ||
      e.actor?.toLowerCase() === agent.id?.toLowerCase()
    );
    return { agent, latest };
  });

  const working  = agentRows.filter(({ agent }) => agent.status === "working" || agent.status === "active");
  const withFeed = agentRows.filter(({ agent, latest }) => latest && agent.status !== "working" && agent.status !== "active");
  const visible  = [...working, ...withFeed].slice(0, 6);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0,
          boxShadow: "0 0 6px #22c55e90", animation: "pulse-dot 2s ease-in-out infinite" }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-2)" }}>
          Live Now
        </span>
        {lastPoll && (
          <span style={{ fontSize: 10, color: "var(--text-4)", marginLeft: "auto" }}>
            updated {formatRelative(lastPoll)}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-4)", padding: "12px 14px",
          background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)" }}>
          All agents on standby
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map(({ agent, latest }) => {
            const color = AGENT_DOT_COLORS[agent.name] || "#6b7280";
            const isWorking = agent.status === "working" || agent.status === "active";
            const activityText = latest?.title || agent.latestTask || agent.specialty || "Ready";
            return (
              <button key={agent.id} onClick={() => onAgentClick(agent)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  background: isWorking ? `${color}10` : "var(--surface)",
                  border: `1px solid ${isWorking ? color + "40" : "var(--border)"}`,
                  transition: "all .15s",
                }}>
                {/* Avatar */}
                <div style={{
                  width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                  background: `${color}22`, border: `2px solid ${color}55`,
                  display: "grid", placeItems: "center",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color }}>{agent.name.charAt(0)}</span>
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{agent.name}</span>
                    {isWorking ? (
                      <span style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                        color: "#f59e0b", background: "#f59e0b18",
                        padding: "2px 7px", borderRadius: 4, border: "1px solid #f59e0b30",
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b",
                          animation: "pulse-dot 1.2s ease-in-out infinite" }} />
                        Working
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase",
                        letterSpacing: ".06em", color: "var(--text-4)" }}>Standby</span>
                    )}
                    {latest?.timestamp && (
                      <span style={{ fontSize: 10, color: "var(--text-4)", marginLeft: "auto", flexShrink: 0 }}>
                        {formatRelative(latest.timestamp)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: isWorking ? "var(--text-2)" : "var(--text-3)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
                    {activityText}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Home ─── */

export function HomePage({ data, focus, openRoute, actions }: PageProps) {
  const [agentFilter, setAgentFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAgent, setDraftAgent] = useState(data.agents[0]?.id || "");
  const [draftDetail, setDraftDetail] = useState("");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const { agents: liveAgents, lastPoll } = useLiveAgents(data.agents);
  const liveFeed = useLiveFeed();
  const { projects: registryProjects } = useProjectRegistry();

  const tasks = data.tasks.tasks;
  const filtered = agentFilter === "all" ? tasks : tasks.filter((t: any) => t.assignedAgent === agentFilter || t.owner === agentFilter);
  const backlog = filtered.filter((t: any) => t.status === "queued");
  const active = filtered.filter((t: any) => t.status === "active");
  const review = filtered.filter((t: any) => t.status === "completed" || t.status === "failed");
  const total = tasks.length;
  const done = tasks.filter((t: any) => t.status === "completed").length;
  const pct = Math.round((done / Math.max(1, total)) * 100);

  // Current project from data
  const registryActiveProject = registryProjects.find((p: any) => p.status === "active") || registryProjects[0];
  const activeProject = registryActiveProject || data.projects?.items?.find((p: any) => p.status === "active") || data.projects?.items?.[0];
  const projectName = activeProject?.name || "IG-to-CRM Lead Engine";

  const recurring = data.calendar.upcoming
    .filter((e: any) => /daily|weekly|cron|routine/i.test(e.title + (e.type || "")))
    .slice(0, 4)
    .map((e: any) => ({ ...e, _kind: "recurring" }));

  const lanes = [
    { id: "recurring", label: "Recurring", dot: "#8b5cf6", items: recurring },
    { id: "backlog",   label: "Backlog",   dot: "var(--text-3)", items: backlog },
    { id: "active",    label: projectName, dot: "var(--accent)", items: active, isProject: true },
    { id: "review",    label: "Review",    dot: "var(--yellow)", items: review },
  ];

  const feed = [...tasks]
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)
    .map((t: any) => ({
      id: t.id, actor: t.assignedAgent,
      summary: t.status === "completed" ? `Completed: ${t.title}` : t.status === "active" ? `Working: ${t.title}` : `Queued: ${t.title}`,
      detail: t.detail, timestamp: t.timestamp,
    }));

  const submit = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    await actions.createTask({ title, assignedAgentId: draftAgent, project: data.projects.items[0]?.name || "Mission Control", detail: draftDetail.trim() });
    setDraftTitle(""); setDraftDetail(""); setComposerOpen(false);
  };

  return (
    <div>
      {activeProject && <ProjectStatusHero project={activeProject} openRoute={openRoute} />}

      {/* Active Projects */}
      <ActiveProjectsSection actions={actions} />

      {/* Live Agent Fleet */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>Agent Fleet</span>
          {lastPoll && <span style={{ fontSize: 10, color: "var(--text-4)" }}>live · {formatRelative(lastPoll)}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {liveAgents.map((agent: any) => (
            (() => {
              const liveWork = agent.latestTask || agent.specialty || agent.role;
              const updatedLabel = agent.currentWorkUpdatedAt ? formatRelative(agent.currentWorkUpdatedAt) : "just now";
              const workState = /done:/i.test(liveWork)
                ? "completed"
                : /in-progress|wiring|implement|building|review|structuring|defining|refining|hardening|staging|preparing/i.test(liveWork)
                  ? "working"
                  : "queued";
              return (
                <button
                  key={agent.id}
                  className="lane-card"
                  style={{
                    textAlign: "left",
                    padding: "14px 14px 12px",
                    cursor: "pointer",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.028))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 14,
                    boxShadow: "0 14px 30px rgba(0,0,0,.18)",
                    minHeight: 190,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                  onClick={() => { focus("agent", agent); openRoute("/agents"); }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span className={cn("status-dot", dotTone(agent.status))} style={{ flexShrink: 0, width: 8, height: 8 }} />
                    <span className={cn("lane-card-avatar", AGENT_TONES[agent.name] || "tone-task")}
                      style={{ background: "rgba(255,255,255,0.08)", width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                      {agent.name.charAt(0)}
                    </span>
                    <strong style={{ fontSize: 14, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</strong>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#ff8d8d", opacity: 0.98, marginBottom: 2 }}>
                    Now Working On
                  </div>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", margin: 0, lineHeight: 1.58, minHeight: 88, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", textWrap: "pretty" as any }}>
                    {liveWork}
                  </p>
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "5px 8px",
                      borderRadius: 999,
                      color: workState === "working" ? "#7ee787" : workState === "completed" ? "#93c5fd" : "#f5c26b",
                      background: workState === "working" ? "rgba(34,197,94,.14)" : workState === "completed" ? "rgba(59,130,246,.14)" : "rgba(245,158,11,.14)",
                      border: workState === "working" ? "1px solid rgba(34,197,94,.28)" : workState === "completed" ? "1px solid rgba(59,130,246,.28)" : "1px solid rgba(245,158,11,.28)",
                    }}>{workState}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.68)", whiteSpace: "nowrap" }}>updated {updatedLabel}</span>
                  </div>
                </button>
              );
            })()
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-strip">
        <div className="stat-item"><strong>{active.length}</strong><span>In progress</span></div>
        <div className="stat-item stat-accent"><strong>{backlog.length}</strong><span>Backlog</span></div>
        <div className="stat-item"><strong>{total}</strong><span>Total</span></div>
        <div className="stat-item stat-green"><strong>{pct}%</strong><span>Completion</span></div>
      </div>

      {/* Controls */}
      <div className="controls-strip">
        <Btn variant="primary" size="sm" onClick={() => setComposerOpen(!composerOpen)}>+ New task</Btn>
        <div style={{ display: "flex", gap: 4 }}>
          {["all", ...data.agents.slice(0, 4).map((a: any) => a.name)].map((v) => (
            <button key={v}
              className={cn("btn btn-ghost btn-sm", agentFilter === v && "btn-secondary")}
              style={{ fontSize: 12 }}
              onClick={() => setAgentFilter(v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* Composer */}
      {composerOpen && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto auto",
          gap: 8,
          marginBottom: 16,
        }}>
          <input className="field field-sm" placeholder="Task title" value={draftTitle} onChange={e => setDraftTitle(e.target.value)} />
          <select className="field field-sm" value={draftAgent} onChange={e => setDraftAgent(e.target.value)}>
            {data.agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Btn variant="primary" size="sm" onClick={submit}>Add</Btn>
          <Btn variant="ghost" size="sm" onClick={() => setComposerOpen(false)}>Cancel</Btn>
        </div>
      )}

      {/* Board */}
      <div className="board-layout">
        <div className="board">
          {lanes.map(lane => (
            <div className="lane" key={lane.id}>
              <div className="lane-header">
                <div className="lane-label">
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: lane.dot, display: "inline-block", flexShrink: 0 }} />
                  <span style={(lane as any).isProject ? { fontWeight: 700, color: "var(--accent-text)", fontSize: 11 } : {}}>{lane.label}</span>
                  <span className="lane-count">{lane.items.length}</span>
                </div>
                {(lane as any).isProject && activeProject && (
                  <span style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 600 }}>
                    {activeProject.phase || "Active"} · {activeProject.progress ?? 0}%
                  </span>
                )}
              </div>
              <div className="lane-stack">
                {lane.items.length === 0
                  ? <div className="lane-empty">Empty</div>
                  : lane.items.map((item: any) => {
                      const isExpanded = expandedCard === item.id;
                      const agentFeed = liveFeed.filter(e =>
                        e.actor === item.assignedAgent || e.actor === item.owner
                      );
                      return (
                        <div key={item.id}>
                          <button
                            className={cn("lane-card", isExpanded && "lane-card-expanded")}
                            onClick={() => {
                              if ((lane as any).isProject) {
                                setExpandedCard(isExpanded ? null : item.id);
                              } else {
                                focus("task", item);
                              }
                            }}
                          >
                            <div className="lane-card-title">
                              <span className={cn("status-dot", item.status === "active" ? "dot-active" : item.status === "failed" ? "dot-error" : item._kind === "recurring" ? "dot-info" : "dot-standby")} style={{ marginTop: 4, flexShrink: 0 }} />
                              <strong>{item.title}</strong>
                              {(lane as any).isProject && (
                                <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--text-3)" }}>{isExpanded ? "▲" : "▼"}</span>
                              )}
                            </div>
                            {item.detail && <p>{item.detail}</p>}
                            <div className="lane-card-meta">
                              <span className={cn("lane-card-avatar", AGENT_TONES[item.assignedAgent || item.owner] || "tone-task")}
                                style={{ background: "rgba(255,255,255,0.06)", width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600 }}>
                                {(item.assignedAgent || item.owner || "?").charAt(0)}
                              </span>
                              <span>{item.assignedAgent || item.owner}</span>
                              <span style={{ marginLeft: "auto" }}>{formatRelative(item.timestamp || item.start)}</span>
                            </div>
                          </button>

                          {/* Expanded: live logs for this task's agent */}
                          {isExpanded && (
                            <div style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderTop: "none",
                              borderRadius: "0 0 6px 6px",
                              padding: "8px 10px",
                              display: "flex", flexDirection: "column", gap: 4,
                            }}>
                              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>
                                Live Logs · {item.assignedAgent || item.owner}
                              </div>
                              {agentFeed.length === 0 ? (
                                <div style={{ fontSize: 10, color: "var(--text-3)", padding: "4px 0" }}>Waiting for activity…</div>
                              ) : agentFeed.map(entry => (
                                <div key={entry.id} className={cn(entry.fresh && "activity-item-fresh")} style={{
                                  display: "flex", alignItems: "baseline", gap: 7,
                                  fontSize: 10.5, padding: "3px 0",
                                  borderBottom: "1px solid var(--border)",
                                }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                                  <span style={{ flex: 1, color: "var(--text-2)" }}>{entry.title}</span>
                                  <span style={{ fontSize: 9, color: "var(--text-3)", flexShrink: 0 }}>{formatRelative(entry.timestamp)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                }
              </div>
            </div>
          ))}
        </div>

        {/* Live Activity */}
        <aside>
          <div className="activity-header">
            <span className="activity-title">Live Activity</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse-dot 2s ease-in-out infinite" }} />
              <span style={{ fontSize: 10, color: "var(--text-4)" }}>live</span>
            </span>
          </div>
          <div className="activity-stack" style={{ overflow: "hidden" }}>
            {liveFeed.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--text-3)" }}>Loading…</div>
            ) : liveFeed.map(entry => (
              <button
                key={entry.id}
                className={cn("activity-item", entry.fresh && "activity-item-fresh")}
                onClick={() => openRoute("/logs")}
              >
                <div className="activity-topline">
                  <span className={cn("activity-actor", AGENT_TONES[entry.actor] || "tone-task")}>{entry.actor}</span>
                  <span className="activity-time">{formatRelative(entry.timestamp)}</span>
                </div>
                <strong>{entry.title}</strong>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─── Overview ─── */

export function OverviewPage({ data, focus, openRoute, actions }: PageProps) {
  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="metric"><div className="metric-value">{data.summary.agentsOnline}</div><div className="metric-label">Agents online</div></div>
        <div className="metric"><div className="metric-value">{data.summary.activeTasks}</div><div className="metric-label">Active tasks</div></div>
        <div className="metric"><div className="metric-value">{data.summary.enabledTools}</div><div className="metric-label">Tools enabled</div></div>
        <div className="metric"><div className="metric-value">{data.summary.alerts}</div><div className="metric-label">Alerts</div></div>
      </div>

      <div className="split split-7-5" style={{ gap: 24 }}>
        <div>
          <div className="section-header"><span className="section-title">Agent Fleet</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.agents.map((agent: any) => (
              <button key={agent.id} className="list-item" onClick={() => { focus("agent", agent); openRoute("/agents"); }}>
                <span className={cn("status-dot", dotTone(agent.status))} />
                <div className="list-item-content">
                  <div className="list-item-title">{agent.name}</div>
                  <div className="list-item-sub">{agent.role} · {agent.currentModel}</div>
                </div>
                <StatusBadge value={agent.status} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="section-header"><span className="section-title">Quick Actions</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data.quickActions || []).map((qa: any) => (
              <Btn key={qa.id} variant="secondary" onClick={() => actions.executeQuickAction(qa.id, qa.label)}>{qa.label}</Btn>
            ))}
            <Btn variant="secondary" onClick={() => openRoute("/mcp")}>MCP Status</Btn>
            <Btn variant="secondary" onClick={() => openRoute("/logs")}>View Logs</Btn>
            <Btn variant="ghost" onClick={actions.runSystemDiagnostic}>Run Diagnostic</Btn>
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-header"><span className="section-title">System</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { label: "MCP Health", value: data.mcp.serverHealth },
                { label: "Gateway", value: data.openclaw.gatewayState },
                { label: "HTTP Transport", value: data.mcp.transportState.http },
                { label: "Stdio Transport", value: data.mcp.transportState.stdio },
              ].map(row => (
                <div key={row.label} className="row-between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-sm text-2">{row.label}</span>
                  <StatusBadge value={row.value} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Agents ─── */

export function AgentsPage({ data, openRoute, actions }: PageProps) {
  return <AgentsOfficePage data={data} openRoute={openRoute} actions={actions} />;
}

/* ─── Voice ─── */

const AGENT_VOICE_IDS: Record<string, string> = {
  abdi:  "pNInz6obpgDQGcFmaJgB",
  ahmed: "ErXwobaYiN019PkySvjV",
  dame:  "2EiwWnXFnvU5JabPnv8n",
  rex:   "5Q0t7uMcjvnagumLfvZi",
  ayub:  "yoZ06aMxZJJ28mfd3POQ",
  prime: "TxGEqnHWrfWFTfGW9XjX",
  atlas: "VR6AewLTigWG4xSOukaG",
  sygma: "EXAVITQu4vr4xnSDxMaL",
};

// Browser SpeechSynthesis voice params — used when ElevenLabs is unavailable
// pitch/rate = browser SpeechSynthesis fallback params
// playbackRate = AudioContext playbackRate applied to server-side TTS audio
// Values < 1.0 → lower pitch (sounds male); > 1.0 → higher pitch (sounds female)
const AGENT_SYNTH_PARAMS: Record<string, { pitch: number; rate: number; voiceHint: string; playbackRate: number }> = {
  abdi:  { pitch: 0.76, rate: 1.12, voiceHint: "male",   playbackRate: 1.16 },  // deep authoritative SA/Irish male, CEO pace
  ahmed: { pitch: 0.80, rate: 1.16, voiceHint: "male",   playbackRate: 1.18 },  // calm male
  dame:  { pitch: 0.75, rate: 1.18, voiceHint: "male",   playbackRate: 1.2 },   // deep calm male
  rex:   { pitch: 0.65, rate: 1.14, voiceHint: "male",   playbackRate: 1.18 },  // deepest male
  prime: { pitch: 0.95, rate: 1.14, voiceHint: "male",   playbackRate: 1.18, gain: 1.35 },  // UK English male — louder
  ayub:  { pitch: 0.92, rate: 1.2,  voiceHint: "male",   playbackRate: 1.22 },  // faster younger Indian male
  atlas: { pitch: 0.90, rate: 1.16, voiceHint: "male",   playbackRate: 1.18 },  // professional male
  sygma: { pitch: 1.20, rate: 1.14, voiceHint: "female", playbackRate: 1.17 },  // female
  codex: { pitch: 0.82, rate: 1.13, voiceHint: "male",   playbackRate: 1.15 },  // calm technical male
};

// Per-agent preferred voice name fragments (ordered by preference).
// Targets Windows 11 Microsoft Neural voices — very human-sounding with real accents.
// Chrome exposes these via Web Speech API when Edge/Windows neural voices are installed.
const AGENT_VOICE_PREFS: Record<string, string[]> = {
  abdi:  ["luke", "connor", "colm", "elliot", "noah", "oliver", "william", "george", "eric"],  // SA → Irish → British → AU → US fallback
  ahmed: ["prabhat", "ravi", "neerja", "eric"],                       // Indian English male
  dame:  ["ryan", "george", "thomas", "eric"],                        // British English male
  rex:   ["william", "liam", "eric"],                                  // Australian English male
  prime: ["daniel", "george", "ryan", "thomas", "oliver", "eric"],   // UK English male
  ayub:  ["prabhat", "ravi", "liam", "eric", "guy"],                   // Indian male first, then fallback
  atlas: ["ryan", "george", "thomas", "eric"],                        // British English male
  sygma: ["natasha", "libby", "aria", "jenny"],                       // Australian female
  codex: ["guy", "eric", "ryan", "george", "david"],                 // technical male fallback
};

/** Strip markdown formatting so voice output and TTS are clean spoken English. */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")           // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")     // bold
    .replace(/\*(.+?)\*/g, "$1")         // italic
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1") // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^[-*+]\s+/gm, "")          // bullets
    .replace(/^\d+\.\s+/gm, "")          // numbered lists
    .replace(/^>\s+/gm, "")              // blockquotes
    .replace(/_{1,2}(.+?)_{1,2}/g, "$1") // underline/italic
    .replace(/~~(.+?)~~/g, "$1")         // strikethrough
    .replace(/\n{3,}/g, "\n\n")          // collapse excess newlines
    .trim();
}

function speakWithBrowserVoice(text: string, agentId: string, onEnd: () => void): void {
  window.speechSynthesis.cancel();
  const params = AGENT_SYNTH_PARAMS[agentId.toLowerCase()] ?? { pitch: 1, rate: 1.35, voiceHint: "male" };
  const prefs = AGENT_VOICE_PREFS[agentId.toLowerCase()] ?? [];

  const knownFemale = ["zira", "susan", "female", "woman", "samantha", "victoria", "karen", "moira", "fiona",
    "aria", "jenny", "nova", "shimmer", "natasha", "libby", "neerja", "google us english", "google uk english female"];
  const knownMale = ["david", "mark", "daniel", "guy", "christopher", "eric", "ryan", "william", "prabhat",
    "liam", "andrew", "thomas", "george", "google uk english male"];

  const doSpeak = (voices: SpeechSynthesisVoice[]) => {
    const enVoices = voices.filter(v => v.lang.startsWith("en"));
    const all = enVoices.length ? enVoices : voices;
    const isFemale = (v: SpeechSynthesisVoice) => knownFemale.some(f => v.name.toLowerCase().includes(f));
    const isMale = (v: SpeechSynthesisVoice) => knownMale.some(m => v.name.toLowerCase().includes(m));
    const wantFemale = params.voiceHint === "female";

    // Try agent-specific preferred voices first (by name fragment, in order)
    let pick: SpeechSynthesisVoice | null = null;
    for (const pref of prefs) {
      pick = all.find(v => v.name.toLowerCase().includes(pref)) ?? null;
      if (pick) break;
    }
    // Fall back to gender-matched voice
    if (!pick) {
      pick = wantFemale
        ? (all.find(v => isFemale(v)) || all[0] || null)
        : (all.find(v => isMale(v)) || all.find(v => !isFemale(v)) || all[0] || null);
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = pick;
    utter.pitch = params.pitch;
    utter.rate = params.rate;
    utter.volume = 1;
    utter.onend = onEnd;
    utter.onerror = onEnd;
    window.speechSynthesis.speak(utter);
  };

  // Chrome loads voices async — wait for voiceschanged if list is empty
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak(voices);
  } else {
    window.speechSynthesis.addEventListener("voiceschanged", function handler() {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      doSpeak(window.speechSynthesis.getVoices());
    });
    setTimeout(() => doSpeak(window.speechSynthesis.getVoices()), 500);
  }
}

const AGENT_VOICE_COLORS = _AGENT_COLORS;

const ORB_GRADIENTS: Record<string, string> = {
  abdi:  "radial-gradient(circle at 35% 30%, #fca5a5, #ef4444 50%, #7f1d1d)",
  ahmed: "radial-gradient(circle at 35% 30%, #d9f99d, #84cc16 50%, #365314)",
  dame:  "radial-gradient(circle at 35% 30%, #fde68a, #f59e0b 50%, #78350f)",
  rex:   "radial-gradient(circle at 35% 30%, #86efac, #22c55e 50%, #14532d)",
  prime: "radial-gradient(circle at 35% 30%, #c4b5fd, #8b5cf6 50%, #3b0764)",
  atlas: "radial-gradient(circle at 35% 30%, #a5f3fc, #06b6d4 50%, #164e63)",
  ayub:  "radial-gradient(circle at 35% 30%, #93c5fd, #3b82f6 50%, #1e3a8a)",
  sygma: "radial-gradient(circle at 35% 30%, #fbcfe8, #ec4899 50%, #831843)",
};

/* ─── Voice Conversation Logs (localStorage) ─── */

export interface VoiceConvLog {
  id: string;
  agentId: string;
  agentName: string;
  startTime: string;
  lastUpdated: string;
  messages: Array<{ id: string; role: "user" | "agent"; text: string; ts: string }>;
  savedForever: boolean;
}

const VOICE_LOGS_KEY = "vc_logs_v1";
const VOICE_LOG_TTL_MS = 7 * 24 * 3600_000;

export function loadVoiceLogs(): VoiceConvLog[] {
  try { return JSON.parse(localStorage.getItem(VOICE_LOGS_KEY) || "[]"); }
  catch { return []; }
}

export function saveVoiceLogs(logs: VoiceConvLog[]) {
  const cutoff = Date.now() - VOICE_LOG_TTL_MS;
  localStorage.setItem(VOICE_LOGS_KEY, JSON.stringify(
    logs.filter(l => l.savedForever || new Date(l.lastUpdated).getTime() > cutoff)
  ));
}

export function upsertVoiceLog(log: VoiceConvLog) {
  const logs = loadVoiceLogs();
  const idx = logs.findIndex(l => l.id === log.id);
  if (idx >= 0) logs[idx] = log; else logs.unshift(log);
  saveVoiceLogs(logs);
}

type VoiceMsg = { id: string; role: "user" | "agent"; text: string; agentName: string; ts: string };

/** Returns the agent object if the text opens by addressing them ("Prime, ..." / "Prime: ..."). */
function detectMentionedAgent(text: string, agentList: any[]): any | null {
  const lower = text.toLowerCase().trimStart();
  for (const agent of agentList) {
    const n = (agent.name || "").toLowerCase();
    if (!n) continue;
    if (
      lower.startsWith(n + ",") || lower.startsWith(n + ":") ||
      lower.startsWith(n + " —") || lower.startsWith(n + " -") ||
      lower.includes(`\n${n},`) || lower.includes(`\n${n}:`) ||
      lower.includes(` ${n},`) || lower.includes(` ${n}:`)
    ) return agent;
  }
  return null;
}

function AgentOrbitRing({
  agents,
  activeId,
  conferenceMode,
  conferenceIds,
  inlineQueue,
  listening,
  speaking,
  processing,
  onAgentClick,
}: {
  agents: any[];
  activeId: string | null;
  conferenceMode: boolean;
  conferenceIds: Set<string>;
  inlineQueue: Array<{ agentId: string; agentName: string; message: string }>;
  listening: boolean;
  speaking: boolean;
  processing: boolean;
  onAgentClick: (agent: any) => void;
}) {
  const RADIUS = 155;
  const ORB_SIZE = 68;

  if (agents.length === 0) {
    return (
      <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>No agents available</span>
      </div>
    );
  }

  const micEmoji = listening ? "🔴" : speaking ? "🔊" : processing ? "⏳" : "🎤";
  const centerBorder = listening ? "var(--accent)" : speaking ? "#f59e0b" : "rgba(255,255,255,0.15)";
  const centerGlow = listening
    ? "0 0 20px rgba(229,25,31,0.35)"
    : speaking
    ? "0 0 20px rgba(245,158,11,0.35)"
    : "none";
  const onlineCount = agents.filter((a: any) => a.status === "online" || a.status === "active").length;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: 380,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {/* Orbital guide ring */}
      <div
        style={{
          position: "absolute",
          width: RADIUS * 2,
          height: RADIUS * 2,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.05)",
          pointerEvents: "none",
        }}
      />

      {/* Center node */}
      <div
        style={{
          position: "absolute",
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.04)",
          border: `1.5px solid ${centerBorder}`,
          backdropFilter: "blur(12px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          zIndex: 10,
          boxShadow: centerGlow,
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
      >
        <span style={{ fontSize: 20 }}>{micEmoji}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.05em" }}>
          {onlineCount}/{agents.length}
        </span>
      </div>

      {/* Agent orbs */}
      {agents.map((agent: any, i: number) => {
        const angle = (2 * Math.PI * i) / agents.length - Math.PI / 2;
        const x = RADIUS * Math.cos(angle);
        const y = RADIUS * Math.sin(angle);
        const isActive = agent.id === activeId;
        const isConferenceParticipant = conferenceMode && conferenceIds.has(agent.id);
        const isOnline = agent.status === "online" || agent.status === "active";
        const hasRaisedHand = inlineQueue.some(q => q.agentId === agent.id);
        const agentKey = agent.name?.toLowerCase() || "";
        const agentColor = AGENT_VOICE_COLORS[agentKey] || "var(--accent)";

        const orbGradient = !isOnline
          ? "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.12), rgba(255,255,255,0.04) 55%, rgba(0,0,0,0.3) 100%)"
          : isActive
          ? "radial-gradient(circle at 38% 32%, #fde68a, #f59e0b 45%, #b45309 100%)"
          : isConferenceParticipant
          ? "radial-gradient(circle at 38% 32%, #fde68a, #f59e0b 50%, #ca8a04 100%)"
          : "radial-gradient(circle at 38% 32%, #fcd34d, #f59e0b 55%, #d97706 100%)";

        const orbGlow = !isOnline
          ? "0 4px 16px rgba(0,0,0,0.5)"
          : isActive
          ? `0 0 36px rgba(253,230,138,0.8), 0 0 12px rgba(245,158,11,0.9), 0 8px 32px rgba(0,0,0,0.6)`
          : isConferenceParticipant
          ? `0 0 24px rgba(253,230,138,0.5), 0 0 8px rgba(245,158,11,0.6)`
          : "0 0 20px rgba(245,158,11,0.45), 0 8px 32px rgba(0,0,0,0.55)";

        const dotColor = isOnline ? "#4ade80" : "#6b7280";

        return (
          <div
            key={agent.id}
            onClick={() => onAgentClick(agent)}
            style={{
              position: "absolute",
              left: `calc(50% + ${x}px - ${ORB_SIZE / 2}px)`,
              top: `calc(50% + ${y}px - ${ORB_SIZE / 2}px)`,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              userSelect: "none",
              transition: "transform 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            {/* Orb */}
            <div
              style={{
                width: ORB_SIZE,
                height: ORB_SIZE,
                borderRadius: "50%",
                background: orbGradient,
                boxShadow: orbGlow,
                border: isActive ? "2px solid rgba(253,230,138,0.6)" : isConferenceParticipant ? `1.5px solid ${agentColor}88` : "none",
                position: "relative",
                transition: "box-shadow 0.2s, border 0.2s",
              }}
            >
              {/* Specular highlight */}
              <div
                style={{
                  position: "absolute",
                  top: "14%",
                  left: "18%",
                  width: "36%",
                  height: "28%",
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)",
                  pointerEvents: "none",
                  opacity: !isOnline ? 0.25 : 1,
                }}
              />
              {/* Status dot */}
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: dotColor,
                  border: "1.5px solid rgba(0,0,0,0.4)",
                  boxShadow: isOnline ? `0 0 6px ${dotColor}` : "none",
                }}
              />
              {/* Raised hand badge */}
              {hasRaisedHand && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    left: -4,
                    fontSize: 14,
                    zIndex: 2,
                    filter: "drop-shadow(0 0 4px rgba(0,0,0,0.6))",
                  }}
                  title={`${agent.name} has something to say`}
                >✋</span>
              )}
            </div>
            {/* Name label */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: isActive ? "rgba(253,230,138,0.95)" : isConferenceParticipant ? agentColor : "rgba(255,255,255,0.62)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textAlign: "center",
                maxWidth: 80,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                transition: "color 0.2s",
              }}
            >
              {agent.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VoicePage({ data, focus, actions }: PageProps) {
  const agents: any[] = data.voice?.agents?.length ? data.voice.agents : data.agents;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState<VoiceMsg[]>([]);
  const [interimText, setInterimText] = useState("");
  const [statusText, setStatusText] = useState("Select an agent to start talking");
  const recogRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<{ stop: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeAgentRef = useRef<any>(null);
  const capturedTextRef = useRef("");
  const listeningRef = useRef(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const mrStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const convLogRef = useRef<VoiceConvLog | null>(null);

  // Conference + barge-in + inline queue
  const [conferenceMode, setConferenceMode] = useState(false);
  const [conferenceIds, setConferenceIds] = useState<Set<string>>(new Set());
  const conferenceModeRef = useRef(false);
  const conferenceIdsRef = useRef<Set<string>>(new Set());
  const autoChainRef = useRef<{ text: string; agentId: string; agentObj: any } | null>(null);
  const sendToAgentRef = useRef<any>(null);
  const bargeRecogRef = useRef<any>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const agentsRef = useRef<any[]>([]);
  const transcriptRef = useRef<VoiceMsg[]>([]);
  const actionsRef = useRef<any>(null);
  const inlineQueue: Array<{ agentId: string; agentName: string; message: string }> = (actions?.voiceInlineQueue) || [];
  const inlineQueueRef = useRef<typeof inlineQueue>([]);

  const activeAgent = agents.find((a: any) => a.id === activeId) || null;
  const agentKey = activeAgent?.name?.toLowerCase() || "";
  const agentColor = AGENT_VOICE_COLORS[agentKey] || "var(--accent)";

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { activeAgentRef.current = activeAgent; }, [activeAgent]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { conferenceModeRef.current = conferenceMode; }, [conferenceMode]);
  useEffect(() => { conferenceIdsRef.current = conferenceIds; }, [conferenceIds]);
  useEffect(() => { agentsRef.current = agents; }, [agents]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);
  useEffect(() => { inlineQueueRef.current = inlineQueue; }, [inlineQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Restore a conversation continued from the Logs tab
  useEffect(() => {
    const raw = sessionStorage.getItem("vc_continue");
    if (!raw) return;
    sessionStorage.removeItem("vc_continue");
    try {
      const { logId } = JSON.parse(raw);
      const log = loadVoiceLogs().find(l => l.id === logId);
      if (!log) return;
      const agent = agents.find((a: any) => a.id === log.agentId);
      if (agent) selectAgent(agent, log);
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendToAgent = useCallback(async (text: string, agentId: string, agentObj: any, opts?: { isChain?: boolean }) => {
    if (!text.trim()) return;
    setProcessing(true);
    setStatusText("Thinking…");

    // In conference mode, include recent transcript as context (skip for chain messages which already have context)
    let messageToSend = text.trim();
    if (conferenceModeRef.current && !opts?.isChain) {
      const recent = transcriptRef.current.slice(-6).map(m => `${m.agentName}: ${m.text}`).join("\n");
      if (recent) messageToSend = `[Conference — others in the room can hear this. Recent exchange:\n${recent}\n]\n${text.trim()}`;
    }

    // Chains show no user bubble (agent-to-agent relay)
    if (!opts?.isChain) {
      const userMsg: VoiceMsg = {
        id: `u-${Date.now()}`, role: "user", text: text.trim(),
        agentName: "You", ts: new Date().toISOString(),
      };
      setTranscript(prev => [...prev, userMsg]);
      if (convLogRef.current) {
        convLogRef.current.messages.push({ id: userMsg.id, role: "user", text: text.trim(), ts: userMsg.ts });
        convLogRef.current.lastUpdated = userMsg.ts;
        upsertVoiceLog(convLogRef.current);
      }
    }

    let replyText = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      let res: Response;
      try {
        res = await fetch("/api/voice/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, message: messageToSend }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const json = await res.json();
      replyText = stripMarkdown((json.reply || json.text || "").trim());
    } catch (err: any) {
      setProcessing(false);
      setSpeaking(false);
      setStatusText(err?.name === "AbortError" ? "Agent timed out — press S to try again" : "Error — press S to try again");
      return;
    }

    if (!replyText) {
      setProcessing(false);
      setStatusText("Agent returned empty reply — press S to try again");
      return;
    }

    const agentMsg: VoiceMsg = {
      id: `a-${Date.now()}`, role: "agent", text: replyText,
      agentName: agentObj?.name || "Agent", ts: new Date().toISOString(),
    };
    setTranscript(prev => [...prev, agentMsg]);
    if (convLogRef.current) {
      convLogRef.current.messages.push({ id: agentMsg.id, role: "agent", text: replyText, ts: agentMsg.ts });
      convLogRef.current.lastUpdated = agentMsg.ts;
      upsertVoiceLog(convLogRef.current);
    }
    setProcessing(false);

    // Conference: detect if this agent addressed another agent by name → auto-chain (one hop only)
    if (conferenceModeRef.current && !opts?.isChain) {
      const mentioned = detectMentionedAgent(replyText, agentsRef.current);
      if (mentioned && mentioned.id !== agentId) {
        autoChainRef.current = {
          text: `[${agentObj?.name || "Agent"} said to you: "${replyText.slice(0, 300)}" — respond naturally, you're all in a conference call together.]`,
          agentId: mentioned.id,
          agentObj: mentioned,
        };
      }
    }

    setSpeaking(true);
    setStatusText(`Speaking… (${agentObj?.name || "Agent"})`);

    const done = () => {
      // 1. Fire conference chain if set
      if (autoChainRef.current) {
        const chain = autoChainRef.current;
        autoChainRef.current = null;
        sendToAgentRef.current?.(chain.text, chain.agentId, chain.agentObj, { isChain: true });
        return;
      }
      // 2. Play queued inline messages (agent raised hand while on call)
      const q = inlineQueueRef.current;
      if (q.length > 0) {
        const msg = q[0];
        actionsRef.current?.dismissVoiceInline?.(msg.agentId);
        const qa = agentsRef.current.find((a: any) => a.id === msg.agentId) || { id: msg.agentId, name: msg.agentName };
        setTranscript(prev => [...prev, {
          id: `q-${Date.now()}`, role: "agent" as const, text: msg.message,
          agentName: msg.agentName, ts: new Date().toISOString(),
        }]);
        setStatusText(`Speaking… (${msg.agentName})`);
        const ap = AGENT_SYNTH_PARAMS[(msg.agentId || "").toLowerCase()];
        const done2 = () => {
          setSpeaking(false);
          setStatusText("Listening…");
          setTimeout(() => {
            if (!processing && !speaking && activeIdRef.current) {
              startListeningRef.current?.();
            }
          }, 220);
        };
        fetch("/api/voice/tts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: msg.agentId, text: msg.message }),
        }).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(buf => {
          if (!buf.byteLength) throw new Error("empty");
          const blobUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
          if (!audioRef.current) audioRef.current = new Audio();
          const audio = audioRef.current;
          audio.playbackRate = ap?.playbackRate ?? 1.0;
          audio.src = blobUrl;
          audio.onended = () => { URL.revokeObjectURL(blobUrl); activeSourceRef.current = null; done2(); };
          activeSourceRef.current = { stop: () => { audio.pause(); audio.src = ""; URL.revokeObjectURL(blobUrl); done2(); } };
          audio.play().catch(() => {
            setStatusText(`Voice unavailable for ${msg.agentName} — reply shown in transcript`);
            done2();
          });
        }).catch(() => {
          setStatusText(`Voice unavailable for ${msg.agentName} — reply shown in transcript`);
          done2();
        });
        return;
      }
      // 3. All done
      setSpeaking(false);
      setStatusText("Listening…");
      setTimeout(() => {
        if (!processing && !speaking && activeIdRef.current) {
          startListeningRef.current?.();
        }
      }, 220);
    };

    const agentParams = AGENT_SYNTH_PARAMS[(agentId || "").toLowerCase()];
    let usedServerTts = false;
    try {
      const ttsRes = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, text: replyText }),
      });
      if (ttsRes.ok) {
        const buf = await ttsRes.arrayBuffer();
        if (buf.byteLength > 0) {
          const blobUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
          if (!audioRef.current) audioRef.current = new Audio();
          const audio = audioRef.current;
          audio.playbackRate = agentParams?.playbackRate ?? 1.0;
          (audio as any).preservesPitch = true;
          (audio as any).mozPreservesPitch = true;

          // Web Audio gain boost for agents that need it (e.g. Prime)
          const targetGain = (agentParams as any)?.gain as number | undefined;
          const ctx = audioCtxRef.current;
          if (targetGain && targetGain > 1.0 && ctx && ctx.state !== "closed") {
            if (!mediaSourceRef.current) {
              try {
                if (ctx.state === "suspended") ctx.resume().catch(() => {});
                const src = ctx.createMediaElementSource(audio);
                const gn = ctx.createGain();
                src.connect(gn);
                gn.connect(ctx.destination);
                mediaSourceRef.current = src;
                gainNodeRef.current = gn;
              } catch { /* already wired or ctx unavailable */ }
            }
            if (gainNodeRef.current) gainNodeRef.current.gain.value = targetGain;
          } else if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = 1.0;
          }

          audio.src = blobUrl;
          audio.onended = () => { URL.revokeObjectURL(blobUrl); activeSourceRef.current = null; done(); };
          activeSourceRef.current = { stop: () => { audio.pause(); audio.src = ""; URL.revokeObjectURL(blobUrl); done(); } };
          await audio.play();
          usedServerTts = true;
        }
      }
    } catch { /* keep text-only fallback */ }
    if (!usedServerTts) {
      setStatusText(`Voice unavailable for ${agentObj?.name || "Agent"} — reply shown in transcript`);
      done();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a stable ref to sendToAgent so done() closures can call it for chaining
  useEffect(() => { sendToAgentRef.current = sendToAgent; }, [sendToAgent]);

  const pendingSendRef = useRef(false);
  const lastInterimRef = useRef("");

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    // Unlock AudioContext during this user-gesture so TTS can play later
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    listeningRef.current = true;
    audioChunksRef.current = [];

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      mrStreamRef.current = stream;
      const mimeType = (MediaRecorder as any).isTypeSupported?.("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mrRef.current = mr;
      mr.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.start();
      recogRef.current = {
        stop: () => { if (mr.state !== "inactive") mr.stop(); },
        abort: () => { if (mr.state !== "inactive") mr.stop(); stream.getTracks().forEach(t => t.stop()); },
      };
      setListening(true);
      setStatusText("Listening… press S to stop");
    }).catch((err: Error) => {
      listeningRef.current = false;
      setStatusText(`Mic error: ${err.message}`);
    });
  }, []);

  const stopListeningAndSend = useCallback(() => {
    const agentId = activeIdRef.current;
    const agentObj = activeAgentRef.current;
    if (recogRef.current && !mrRef.current) {
      listeningRef.current = false;
      setListening(false);
      setStatusText("Transcribing…");
      try { recogRef.current.stop(); } catch { /* ignore */ }
      return;
    }

    const mr = mrRef.current;
    const recordedMimeType = mr?.mimeType || "audio/webm";
    mrRef.current = null;
    recogRef.current = null;
    listeningRef.current = false;
    setListening(false);
    setInterimText("");

    if (!mr || mr.state === "inactive") {
      setStatusText("Nothing heard — press S to try again");
      return;
    }

    setStatusText("Transcribing…");

    mr.onstop = async () => {
      mrStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      mrStreamRef.current = null;
      const chunks = audioChunksRef.current;
      audioChunksRef.current = [];
      if (!chunks.length || !agentId) { setStatusText("Nothing heard — press S to try again"); return; }
      try {
        const mimeType =
          (chunks[0] instanceof Blob && chunks[0].type) ||
          recordedMimeType ||
          "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        const res = await fetch("/api/voice/stt", {
          method: "POST",
          headers: { "Content-Type": mimeType },
          body: blob,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`STT ${res.status} ${detail}`.trim());
        }
        const { text } = await res.json();
        const trimmed = (text || "").trim();
        if (trimmed && !isLikelySttNoise(trimmed)) {
          sendToAgent(trimmed, agentId, agentObj);
        } else {
          setStatusText("Nothing heard — press S to try again");
        }
      } catch (err: any) {
        setStatusText("Transcription error — check mic and try again");
        console.warn("[VoicePage STT]", err?.message || err);
      }
    };

    mr.stop();
  }, [sendToAgent]);

  // Barge-in: while agent is speaking, run SpeechRecognition in background.
  // If user says > 2 words, interrupt TTS and route that speech to the agent.
  useEffect(() => {
    if (!speaking) {
      if (bargeRecogRef.current) {
        try { bargeRecogRef.current.stop(); } catch { /* ignore */ }
        bargeRecogRef.current = null;
      }
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return; // browser doesn't support it

    let bargedIn = false;
    const recog = new SR();
    bargeRecogRef.current = recog;
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";

    recog.onresult = (e: any) => {
      if (bargedIn) return;
      let words = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        words += e.results[i][0].transcript;
      }
      const capturedText = words.trim();
      const wordCount = capturedText.split(/\s+/).filter(Boolean).length;
      if (wordCount > 2 && !isLikelySttNoise(capturedText)) {
        bargedIn = true;
        // Stop TTS playback
        activeSourceRef.current?.stop();
        activeSourceRef.current = null;
        window.speechSynthesis.cancel();
        try { recog.stop(); } catch { /* ignore */ }
        bargeRecogRef.current = null;
        setSpeaking(false);
        // Route captured speech to the agent
        const aid = activeIdRef.current;
        const aobj = activeAgentRef.current;
        if (aid && capturedText) sendToAgentRef.current?.(capturedText, aid, aobj);
      }
    };

    recog.onend = () => {
      // Auto-restart so it stays active for the full duration of TTS
      if (!bargedIn && bargeRecogRef.current === recog) {
        try { recog.start(); } catch { /* ignore */ }
      }
    };

    try { recog.start(); } catch { /* ignore */ }
    return () => {
      bargedIn = true;
      bargeRecogRef.current = null;
      try { recog.stop(); } catch { /* ignore */ }
    };
  }, [speaking]); // eslint-disable-line react-hooks/exhaustive-deps

  // S key: press to start, press again to stop & send
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() !== "s") return;
      if (!activeIdRef.current) return;
      if (processing) return;

      // If agent is speaking, S key stops audio only — press S again to start listening
      if (speaking) {
        activeSourceRef.current?.stop();
        activeSourceRef.current = null;
        window.speechSynthesis.cancel();
        setSpeaking(false);
        setStatusText("Press S to speak");
        return;
      }

      if (listeningRef.current) {
        stopListeningAndSend();
      } else {
        startListening();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startListening, stopListeningAndSend, processing, speaking]);

  const selectAgent = useCallback((agent: any, existingLog?: VoiceConvLog) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    mediaSourceRef.current = null;
    gainNodeRef.current = null;
    audioCtxRef.current?.suspend();
    recogRef.current?.stop();
    setInterimText("");
    setSpeaking(false);
    setProcessing(false);
    setListening(false);
    capturedTextRef.current = "";
    actionsRef.current?.setVoiceActive?.(true);
    if (existingLog) {
      convLogRef.current = existingLog;
      setTranscript(existingLog.messages.map(m => ({
        id: m.id, role: m.role, text: m.text,
        agentName: m.role === "user" ? "You" : agent.name, ts: m.ts,
      })));
      setStatusText(`Resumed with ${agent.name} — listening`);
    } else {
      const newLog: VoiceConvLog = {
        id: `vcl-${Date.now()}`, agentId: agent.id, agentName: agent.name,
        startTime: new Date().toISOString(), lastUpdated: new Date().toISOString(),
        messages: [], savedForever: false,
      };
      convLogRef.current = newLog;
      upsertVoiceLog(newLog);
      setTranscript([]);
      setStatusText(`Connected to ${agent.name} — listening`);
    }
    setActiveId(agent.id);
    focus("voice", agent);
    setTimeout(() => startListeningRef.current?.(), 240);
  }, [focus]);

  const stopConversation = () => {
    recogRef.current?.abort?.();
    recogRef.current?.stop?.();
    recogRef.current = null;
    if (bargeRecogRef.current) {
      try { bargeRecogRef.current.stop(); } catch { /* ignore */ }
      bargeRecogRef.current = null;
    }
    activeSourceRef.current?.stop?.();
    activeSourceRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
      audioRef.current = null;
    }
    mediaSourceRef.current = null;
    gainNodeRef.current = null;
    window.speechSynthesis.cancel();
    setListening(false);
    setSpeaking(false);
    setProcessing(false);
    setActiveId(null);
    setInterimText("");
    setConferenceMode(false);
    setConferenceIds(new Set());
    autoChainRef.current = null;
    capturedTextRef.current = "";
    convLogRef.current = null;
    actionsRef.current?.setVoiceActive?.(false);
    setStatusText("Select an agent to start talking");
    if (activeIdRef.current && actions?.disconnectVoiceAgent) {
      actions.disconnectVoiceAgent(activeIdRef.current);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      {/* Agent orbital ring */}
      <AgentOrbitRing
        agents={agents}
        activeId={activeId}
        conferenceMode={conferenceMode}
        conferenceIds={conferenceIds}
        inlineQueue={inlineQueue}
        listening={listening}
        speaking={speaking}
        processing={processing}
        onAgentClick={(agent: any) => {
          if (conferenceMode) {
            if (agent.id === activeId) return;
            setConferenceIds(prev => {
              const next = new Set(prev);
              next.has(agent.id) ? next.delete(agent.id) : next.add(agent.id);
              return next;
            });
          } else {
            agent.id === activeId ? stopConversation() : selectAgent(agent);
          }
        }}
      />

      {/* Active call strip + orb */}
      {activeId ? (
        <div className="voice-call-zone">
          {/* Identity strip: [Hold] [avatar · name] ... [status label] */}
          <div className="voice-call-strip">
            {/* Hold-to-talk button — transparent, stays open through pauses */}
            <button
              className={cn("voice-hold-btn", listening && "voice-hold-btn-active")}
              title="Hold to keep mic open through pauses — release to send"
              onMouseDown={() => { if (!processing && !speaking) startListening(); }}
              onMouseUp={() => { if (listeningRef.current) stopListeningAndSend(); }}
              onTouchStart={(e) => { e.preventDefault(); if (!processing && !speaking) startListening(); }}
              onTouchEnd={(e) => { e.preventDefault(); if (listeningRef.current) stopListeningAndSend(); }}
            >
              {listening ? "◉ Hold" : "Hold"}
            </button>

            {/* Agent identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <AgentAvatar agentId={activeId} name={activeAgent?.name} size={22} />
              <span style={{ fontWeight: 600, fontSize: 13, color: agentColor }}>{activeAgent?.name}</span>
            </div>

            {/* Status label */}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", letterSpacing: "0.08em" }}>
              {speaking ? "Speaking" : listening ? "Listening" : processing ? "Thinking…" : "Ready"}
            </span>

            {/* Controls */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                style={{
                  padding: "4px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                  background: listening ? "var(--accent)" : "rgba(255,255,255,0.1)",
                  color: listening ? "#000" : "var(--text-1)",
                  opacity: (processing || speaking) ? 0.4 : 1,
                  pointerEvents: (processing || speaking) ? "none" : "auto",
                }}
                onClick={() => listening ? stopListeningAndSend() : startListening()}
              >{listening ? "⏹ S" : "🎙 S"}</button>
              <button
                title={conferenceMode ? "Exit conference" : "Conference mode — bring all agents into the call"}
                style={{
                  padding: "4px 10px", borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600,
                  border: conferenceMode ? "1px solid #4ade80" : "1px solid rgba(255,255,255,0.12)",
                  background: conferenceMode ? "rgba(74,222,128,0.1)" : "transparent",
                  color: conferenceMode ? "#4ade80" : "var(--text-3)",
                }}
                onClick={() => {
                  if (conferenceMode) { setConferenceMode(false); setConferenceIds(new Set()); }
                  else { setConferenceIds(new Set(agents.filter((a: any) => a.id !== activeId).map((a: any) => a.id))); setConferenceMode(true); }
                }}
              >{conferenceMode ? "📞 On" : "👥"}</button>
              <Btn variant="ghost" size="sm" onClick={stopConversation}>End</Btn>
            </div>
          </div>

          {/* Visual orb */}
          <div className="voice-orb-zone">
            {listening ? (
              /* User speaking: mic icon with outward ripple rings */
              <div className="voice-orb voice-orb-listening">
                <div className="voice-ripple-ring" style={{ animationDelay: "0s" }} />
                <div className="voice-ripple-ring" style={{ animationDelay: "0.4s" }} />
                <div className="voice-ripple-ring" style={{ animationDelay: "0.8s" }} />
                <span style={{ fontSize: 22, position: "relative", zIndex: 2 }}>🎤</span>
              </div>
            ) : (
              /* Agent orb: glows in agent color when speaking, dim when idle/thinking */
              <div
                className={cn("voice-orb", speaking && "voice-orb-speaking", processing && "voice-orb-thinking")}
                style={speaking ? { "--orb-glow": agentColor, "--orb-glow-dim": agentColor + "33" } as any : {}}
              >
                <AgentAvatar agentId={activeId} name={activeAgent?.name} size={speaking ? 52 : 44} />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* No active call — minimal status */
        <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
          <span className="text-sm text-3">{statusText}</span>
        </div>
      )}

      {/* Conversation transcript */}
      <div className="voice-transcript">
        {transcript.length === 0 && !activeId && (
          <div className="empty" style={{ flex: 1 }}>
            <span className="empty-text">Click an agent above and start talking</span>
          </div>
        )}
        {transcript.length === 0 && activeId && (
          <div className="empty" style={{ flex: 1 }}>
            <span className="empty-text" style={{ color: agentColor }}>Connected to {activeAgent?.name} — start talking when you are ready</span>
          </div>
        )}
        {transcript.map(msg => {
          const msgColor = msg.role === "agent"
            ? (AGENT_VOICE_COLORS[msg.agentName?.toLowerCase()] || agentColor)
            : undefined;
          return (
            <div key={msg.id} className={cn("voice-msg", msg.role === "user" ? "voice-msg-user" : "voice-msg-agent")}>
              <div className="voice-msg-name" style={msgColor ? { color: msgColor } : {}}>{msg.agentName}</div>
              <div className="voice-msg-bubble" style={msg.role === "agent" ? { borderColor: (msgColor || agentColor) + "44" } : {}}>
                {msg.text}
              </div>
              <div className="voice-msg-time">{formatRelative(msg.ts)}</div>
            </div>
          );
        })}
        {interimText && (
          <div className="voice-msg voice-msg-user">
            <div className="voice-msg-name">You</div>
            <div className="voice-msg-bubble voice-msg-interim">{interimText}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

/* ─── Visionary Universe ─── */


// ── System Registry ──────────────────────────────────────────────────────────

type SystemStatus = "healthy" | "degraded" | "offline" | "unknown" | "planned" | "experimental";

type SystemNode = {
  id: string;
  name: string;
  type: "world" | "system" | "service" | "container" | "agent" | "database" | "api" | "workflow" | "integration" | "website" | "portal" | "monitor" | "memory" | "deployment";
  parentId?: string;
  description: string;
  status: SystemStatus;
  environment?: "local" | "vps" | "vercel" | "supabase" | "external" | "unknown";
  ownerAgent?: string;
  tags: string[];
  position: { x: number; y: number };
  color: string;
  icon: string;
  runtime?: {
    container?: string;
    ports?: string[];
    url?: string;
    host?: string;
    repo?: string;
    path?: string;
  };
  dependencies?: string[];
  connections?: string[];
  health?: {
    endpoint?: string;
    command?: string;
    logsCommand?: string;
    restartCommand?: string;
    lastKnownState?: string;
  };
  risks?: string[];
  nextActions?: string[];
  children?: SystemNode[];
};

const REGISTRY: SystemNode[] = [
  // ── World 1: Public Business Systems ──────────────────────────────────────
  {
    id: "public", name: "Public Business Systems", type: "world",
    description: "Task Enterprise public-facing web presence, landing pages, lead capture, and brand identity.",
    status: "healthy", environment: "vercel", color: "#ef4444",
    icon: "globe", tags: ["public", "website", "marketing"],
    position: { x: -1400, y: -600 },
    runtime: { url: "https://taskenterprise.tech" },
    children: [
      { id: "public.site", name: "taskenterprise.tech", type: "website", parentId: "public",
        description: "Primary Task Enterprise website. React/Next.js. Deployed on Vercel.",
        status: "healthy", environment: "vercel", color: "#ef4444", icon: "globe", tags: ["website", "vercel"],
        position: { x: -1400, y: -500 },
        runtime: { url: "https://taskenterprise.tech", repo: "Task-Ent-Site" },
        health: { command: "curl -s https://taskenterprise.tech/api/health", lastKnownState: "healthy" },
        ownerAgent: "atlas", nextActions: ["Verify WebGL atmosphere visibility on live site"],
        dependencies: ["vercel", "public.cloudflare"] },
      { id: "public.services", name: "Services Pages", type: "website", parentId: "public",
        description: "Tech Rescue, Sygma House, automation packages, AI consulting pages.",
        status: "healthy", environment: "vercel", color: "#ef4444", icon: "document", tags: ["marketing", "services"],
        position: { x: -1540, y: -420 }, runtime: { url: "https://taskenterprise.tech/services" }, ownerAgent: "atlas" },
      { id: "public.agents-page", name: "Agents Page", type: "website", parentId: "public",
        description: "Public-facing AI agent roster page showing Task Enterprise agent capabilities.",
        status: "healthy", environment: "vercel", color: "#ef4444", icon: "agent", tags: ["agents", "marketing"],
        position: { x: -1400, y: -420 }, runtime: { url: "https://taskenterprise.tech/agents" }, ownerAgent: "atlas" },
      { id: "public.systems-page", name: "Systems Page", type: "website", parentId: "public",
        description: "Infrastructure and systems showcase page — public view of the stack.",
        status: "planned", environment: "vercel", color: "#ef4444", icon: "document", tags: ["marketing"],
        position: { x: -1260, y: -420 }, runtime: { url: "https://taskenterprise.tech/systems" }, ownerAgent: "atlas" },
      { id: "public.lead-capture", name: "Lead Capture", type: "integration", parentId: "public",
        description: "Intake forms, Calendly scheduling, lead routing into n8n CRM workflows.",
        status: "healthy", environment: "vercel", color: "#ef4444", icon: "form", tags: ["leads", "crm"],
        position: { x: -1400, y: -340 }, ownerAgent: "sygma",
        dependencies: ["automation", "public.site"], nextActions: ["Connect leads to Supabase CRM table"] },
      { id: "public.cloudflare", name: "Cloudflare", type: "service", parentId: "public",
        description: "DNS, CDN, DDoS protection. Routes all public traffic to VPS and Vercel.",
        status: "healthy", environment: "external", color: "#f97316", icon: "shield", tags: ["dns", "cdn", "security"],
        position: { x: -1540, y: -340 }, runtime: { url: "cc.taskenterprise.tech" } },
    ]
  },

  // ── World 2: C2 / Command Center ──────────────────────────────────────────
  {
    id: "c2", name: "C2 Command Center", type: "world",
    description: "The Task Enterprise Command & Control interface. Agent management, voice, monitoring, logs, projects, memory. Public at cc.taskenterprise.tech.",
    status: "healthy", environment: "vps", color: "#ef4444",
    icon: "terminal", tags: ["c2", "command", "control"],
    position: { x: 0, y: -700 },
    runtime: { url: "https://cc.taskenterprise.tech", host: "187.77.211.125", container: "codex-mcp-server-mcp-server-1", ports: ["3000 MCP", "4000 Mirror"] },
    health: { command: "curl https://cc.taskenterprise.tech/api/health", logsCommand: "docker logs --tail 50 codex-mcp-server-mcp-server-1", restartCommand: "docker restart codex-mcp-server-mcp-server-1", lastKnownState: "healthy" },
    ownerAgent: "rex",
    children: [
      { id: "c2.runtime", name: "C2 Runtime (Node.js)", type: "service", parentId: "c2",
        description: "Express/Next.js server. Serves the C2 UI and all /api routes. Port 3000 on VPS behind Caddy.",
        status: "healthy", environment: "vps", color: "#ef4444", icon: "server", tags: ["node", "express"],
        position: { x: 0, y: -600 },
        runtime: { container: "codex-mcp-server-mcp-server-1", ports: ["3000 HTTP", "4000 MCP Mirror"] },
        health: { logsCommand: "docker logs --tail 50 codex-mcp-server-mcp-server-1", restartCommand: "docker restart codex-mcp-server-mcp-server-1" },
        ownerAgent: "ayub", dependencies: ["c2.redis", "vps.caddy"] },
      { id: "c2.redis", name: "Redis Cache", type: "database", parentId: "c2",
        description: "In-memory cache, session store, runtime state, queue state, lock state.",
        status: "healthy", environment: "vps", color: "#ef4444", icon: "database", tags: ["redis", "cache"],
        position: { x: 160, y: -600 },
        runtime: { container: "redis", ports: ["6379"] },
        health: { command: "docker exec redis redis-cli PING", restartCommand: "docker restart redis" },
        ownerAgent: "rex" },
      { id: "c2.agents-tab", name: "Agents Tab", type: "portal", parentId: "c2",
        description: "Agent conversation interface. Tabs per agent. Real-time message streaming.",
        status: "healthy", environment: "vps", color: "#ef4444", icon: "agent", tags: ["ui", "agents"],
        position: { x: -160, y: -600 }, ownerAgent: "abdi" },
      { id: "c2.voice", name: "Voice Interface", type: "service", parentId: "c2",
        description: "Web Speech API STT + Groq STT + ElevenLabs TTS. All 8 agents auto-active. Push-to-talk + live subtitle.",
        status: "healthy", environment: "vps", color: "#ec4899", icon: "voice", tags: ["voice", "stt", "tts"],
        position: { x: -160, y: -520 },
        runtime: { url: "https://cc.taskenterprise.tech/voice" },
        dependencies: ["c2.runtime", "agents"], ownerAgent: "abdi",
        health: { lastKnownState: "healthy" } },
      { id: "c2.memory-tab", name: "Memory Tab", type: "memory", parentId: "c2",
        description: "Ahmed-owned memory surface. Claude/Codex memory vaults. Notion sync.",
        status: "healthy", environment: "vps", color: "#84cc16", icon: "memory", tags: ["memory", "ahmed"],
        position: { x: 160, y: -520 }, ownerAgent: "ahmed" },
      { id: "c2.projects-tab", name: "Projects Tab", type: "portal", parentId: "c2",
        description: "Plan, resources, process, status. One tab per project. Sygma compliance view.",
        status: "healthy", environment: "vps", color: "#ef4444", icon: "document", tags: ["projects"],
        position: { x: 0, y: -520 }, ownerAgent: "sygma" },
      { id: "c2.monitoring", name: "Monitoring Feed", type: "monitor", parentId: "c2",
        description: "Logs, health feed, container status, events stream from /api/command-center.",
        status: "healthy", environment: "vps", color: "#f59e0b", icon: "monitor", tags: ["monitoring"],
        position: { x: -320, y: -600 }, ownerAgent: "rex",
        runtime: { ports: ["3011 Kuma"] },
        health: { command: "curl http://localhost:3011/status" } },
    ]
  },

  // ── World 3: MCP Runtime ──────────────────────────────────────────────────
  {
    id: "mcp", name: "MCP Runtime", type: "world",
    description: "Model Context Protocol server. Routes all agent tool calls. 111+ tools across 15+ tool groups.",
    status: "healthy", environment: "vps", color: "#3b82f6",
    icon: "antenna", tags: ["mcp", "tools", "protocol"],
    position: { x: 400, y: -300 },
    runtime: { container: "codex-mcp-server-mcp-server-1", ports: ["3000 MCP HTTP", "4000 MCP Mirror"], host: "187.77.211.125" },
    health: { endpoint: "http://localhost:3000/health", command: "curl http://localhost:3000/health", logsCommand: "docker logs --tail 50 codex-mcp-server-mcp-server-1", restartCommand: "docker restart codex-mcp-server-mcp-server-1" },
    ownerAgent: "ayub",
    dependencies: ["vps", "c2.runtime"],
    children: [
      { id: "mcp.server", name: "MCP Server Core", type: "service", parentId: "mcp",
        description: "Handles /mcp endpoint. Tool registry, agent tool routing, OpenRouter access, stdio + HTTP transports.",
        status: "healthy", environment: "vps", color: "#3b82f6", icon: "antenna", tags: ["mcp", "server"],
        position: { x: 400, y: -200 },
        runtime: { container: "codex-mcp-server-mcp-server-1", ports: ["3000", "4000"] },
        health: { endpoint: "http://localhost:3000/ready", command: "curl http://localhost:3000/ready", logsCommand: "docker logs --tail 50 codex-mcp-server-mcp-server-1", restartCommand: "docker restart codex-mcp-server-mcp-server-1" },
        risks: ["All agents lose tool access if down"], ownerAgent: "ayub" },
      { id: "mcp.openclaw", name: "OpenClaw Gateway", type: "service", parentId: "mcp",
        description: "Persistent socket bridge for external tool events. Port 61299. Desktop automation bridge.",
        status: "healthy", environment: "vps", color: "#06b6d4", icon: "antenna", tags: ["openclaw", "bridge"],
        position: { x: 560, y: -200 },
        runtime: { container: "codex-mcp-server-mcp-server-1", ports: ["61299"] },
        health: { command: "curl http://localhost:61299/health" }, ownerAgent: "dame" },
      { id: "mcp.openrouter", name: "OpenRouter", type: "api", parentId: "mcp",
        description: "LLM routing layer. Agents use OpenRouter for all model calls. claude-*, mistral-*, llama-*, gemma-*.",
        status: "healthy", environment: "external", color: "#8b5cf6", icon: "model", tags: ["llm", "openrouter"],
        position: { x: 400, y: -120 }, runtime: { url: "https://openrouter.ai/api" },
        risks: ["API key rotation", "rate limits"] },
      { id: "mcp.relay", name: "MCP Relay", type: "service", parentId: "mcp",
        description: "Relay server on port 3099. Bridges stdio agents to HTTP MCP transport.",
        status: "healthy", environment: "vps", color: "#3b82f6", icon: "server", tags: ["relay"],
        position: { x: 560, y: -120 },
        runtime: { ports: ["3099"] }, ownerAgent: "ayub" },
    ]
  },

  // ── World 4: Agent Workforce ──────────────────────────────────────────────
  {
    id: "agents", name: "Agent Workforce", type: "world",
    description: "8 AI agents (OpenRouter runtime) + Codex (OpenAI runtime). Each has a role, color, tools, and domain ownership.",
    status: "healthy", environment: "vps", color: "#f59e0b",
    icon: "agents", tags: ["agents", "ai", "workforce"],
    position: { x: -600, y: 0 },
    children: [
      { id: "agents.abdi", name: "Abdi", type: "agent", parentId: "agents",
        description: "CEO / Supervisor / Strategist. Handles strategy, prioritization, delegation, and cross-agent coordination.",
        status: "healthy", environment: "vps", color: "#ef4444", icon: "agent", tags: ["ceo", "strategy", "supervisor"],
        position: { x: -800, y: 100 }, ownerAgent: "abdi",
        runtime: { host: "OpenRouter" } },
      { id: "agents.dame", name: "Dame", type: "agent", parentId: "agents",
        description: "Local Machine Operator. Terminal access, Docker, desktop, filesystem. Owns MCP tools admin.",
        status: "healthy", environment: "local", color: "#f59e0b", icon: "agent", tags: ["local", "docker", "terminal"],
        position: { x: -680, y: 100 }, ownerAgent: "dame",
        runtime: { host: "Local Windows / OpenRouter" } },
      { id: "agents.ayub", name: "Ayub", type: "agent", parentId: "agents",
        description: "Builder / Coder / Implementation. Writes all production code. Deploys. Edits infrastructure.",
        status: "healthy", environment: "vps", color: "#3b82f6", icon: "agent", tags: ["code", "builder", "deploy"],
        position: { x: -560, y: 100 }, ownerAgent: "ayub",
        runtime: { host: "OpenRouter" } },
      { id: "agents.ahmed", name: "Ahmed", type: "agent", parentId: "agents",
        description: "Organizer / Docs / Memory. Owns Claude & Codex memory surfaces. Notion sync. Knowledge management.",
        status: "healthy", environment: "vps", color: "#84cc16", icon: "agent", tags: ["memory", "docs", "organizer"],
        position: { x: -440, y: 100 }, ownerAgent: "ahmed" },
      { id: "agents.atlas", name: "Atlas", type: "agent", parentId: "agents",
        description: "Marketing / Growth / SEO / Social Media. Owns public website strategy, content, and GTM.",
        status: "healthy", environment: "vps", color: "#06b6d4", icon: "agent", tags: ["marketing", "seo", "growth"],
        position: { x: -800, y: 180 }, ownerAgent: "atlas" },
      { id: "agents.rex", name: "Rex", type: "agent", parentId: "agents",
        description: "Infrastructure / Security. Full monitoring inventory. Container recovery. Port and service ownership. Ports: MCP :3000/:4000, n8n :3001, Kuma :3011, OpenClaw :61299, Postgres :5432, Relay :3099.",
        status: "healthy", environment: "vps", color: "#22c55e", icon: "agent", tags: ["infra", "security", "monitoring"],
        position: { x: -680, y: 180 }, ownerAgent: "rex" },
      { id: "agents.prime", name: "Prime", type: "agent", parentId: "agents",
        description: "Trading Research / Systems. Desktop control for broker windows. Market analysis automation.",
        status: "healthy", environment: "local", color: "#8b5cf6", icon: "agent", tags: ["trading", "research", "desktop"],
        position: { x: -560, y: 180 }, ownerAgent: "prime" },
      { id: "agents.sygma", name: "Sygma", type: "agent", parentId: "agents",
        description: "Operations / Compliance / Assisted-Living. Projects tab owner. Sygma House business lead.",
        status: "healthy", environment: "vps", color: "#ec4899", icon: "agent", tags: ["ops", "compliance", "sygma-house"],
        position: { x: -440, y: 180 }, ownerAgent: "sygma" },
      { id: "agents.codex", name: "Codex", type: "agent", parentId: "agents",
        description: "Technical Execution / Architecture / Debug / Deploy. OpenAI runtime (o1/GPT-4o). CLI-native. 319+ skills.",
        status: "healthy", environment: "local", color: "#e2e8f0", icon: "agent", tags: ["codex", "openai", "cli"],
        position: { x: -320, y: 140 },
        runtime: { host: "OpenAI o1/GPT-4o" } },
    ]
  },

  // ── World 5: Cortex / Brain ───────────────────────────────────────────────
  {
    id: "cortex", name: "Cortex", type: "world",
    description: "The command brain. Infrastructure map, system registry, runtime state, health orchestration, and intelligence layer.",
    status: "healthy", environment: "vps", color: "#ffffff",
    icon: "core", tags: ["cortex", "brain", "core"],
    position: { x: 0, y: 0 },
    children: [
      { id: "cortex.core", name: "Command Brain", type: "service", parentId: "cortex",
        description: "Central routing. Receives C2 commands, dispatches to agents, tracks system state.",
        status: "healthy", environment: "vps", color: "#ffffff", icon: "core", tags: ["core"],
        position: { x: 0, y: 80 }, ownerAgent: "abdi" },
      { id: "cortex.registry", name: "System Registry", type: "service", parentId: "cortex",
        description: "Runtime registry of all systems, tools, agents, and health states.",
        status: "healthy", environment: "vps", color: "#ffffff", icon: "document", tags: ["registry"],
        position: { x: 120, y: 80 }, ownerAgent: "ahmed" },
      { id: "cortex.memory", name: "Memory Index", type: "memory", parentId: "cortex",
        description: "Claude memory files at ~/.claude/projects. Persists across sessions.",
        status: "healthy", environment: "local", color: "#84cc16", icon: "memory", tags: ["memory"],
        position: { x: -120, y: 80 }, ownerAgent: "ahmed",
        runtime: { path: "C:\\Users\\offic\\.claude\\projects\\c--Users-offic-Sync\\memory" } },
    ]
  },

  // ── World 6: VPS / DevOps ────────────────────────────────────────────────
  {
    id: "vps", name: "VPS / DevOps Layer", type: "world",
    description: "Hostinger Ubuntu VPS at 187.77.211.125. Docker stack, Caddy reverse proxy, Cloudflare tunnel. Production host for all services.",
    status: "healthy", environment: "vps", color: "#22c55e",
    icon: "server", tags: ["vps", "docker", "devops"],
    position: { x: 700, y: 0 },
    runtime: { host: "187.77.211.125", url: "https://cc.taskenterprise.tech" },
    health: { command: "ssh root@187.77.211.125 'docker ps'", lastKnownState: "healthy" },
    ownerAgent: "rex",
    children: [
      { id: "vps.docker", name: "Docker Engine", type: "service", parentId: "vps",
        description: "Container runtime. Runs all production services.",
        status: "healthy", environment: "vps", color: "#22c55e", icon: "server", tags: ["docker"],
        position: { x: 700, y: 100 }, ownerAgent: "rex",
        health: { command: "docker ps --format 'table {{.Names}}\\t{{.Status}}'" } },
      { id: "vps.caddy", name: "Caddy Reverse Proxy", type: "service", parentId: "vps",
        description: "HTTPS reverse proxy. Routes cc.taskenterprise.tech → :3000. Auto-SSL via Let's Encrypt.",
        status: "healthy", environment: "vps", color: "#22c55e", icon: "shield", tags: ["caddy", "proxy", "ssl"],
        position: { x: 840, y: 100 }, ownerAgent: "rex",
        runtime: { container: "caddy", ports: ["80 HTTP", "443 HTTPS"] },
        health: { restartCommand: "docker restart caddy", logsCommand: "docker logs --tail 30 caddy" } },
      { id: "vps.cloudflared", name: "Cloudflare Tunnel", type: "service", parentId: "vps",
        description: "Cloudflare tunnel daemon. Exposes VPS services via cc.taskenterprise.tech without open firewall.",
        status: "healthy", environment: "vps", color: "#f97316", icon: "shield", tags: ["cloudflare", "tunnel"],
        position: { x: 560, y: 100 }, ownerAgent: "rex",
        runtime: { container: "task-cloudflared" },
        health: { restartCommand: "docker restart task-cloudflared", logsCommand: "docker logs --tail 30 task-cloudflared" } },
      { id: "vps.n8n", name: "n8n Automation", type: "service", parentId: "vps",
        description: "Workflow automation engine. Port 3001. Lead flows, CRM, email, SMS, scheduled jobs.",
        status: "healthy", environment: "vps", color: "#f59e0b", icon: "workflow", tags: ["n8n", "automation"],
        position: { x: 700, y: 180 },
        runtime: { container: "n8n", ports: ["3001"] },
        health: { command: "curl http://localhost:3001/healthz", logsCommand: "docker logs --tail 30 n8n", restartCommand: "docker restart n8n" },
        ownerAgent: "dame" },
      { id: "vps.postgres", name: "Postgres (n8n)", type: "database", parentId: "vps",
        description: "Postgres DB for n8n workflows and state persistence.",
        status: "healthy", environment: "vps", color: "#22c55e", icon: "database", tags: ["postgres", "db"],
        position: { x: 840, y: 180 },
        runtime: { container: "n8n-stack-postgres-1", ports: ["5432"] },
        health: { restartCommand: "docker restart n8n-stack-postgres-1" }, ownerAgent: "dame" },
      { id: "vps.kuma", name: "Uptime Kuma", type: "monitor", parentId: "vps",
        description: "Self-hosted uptime monitoring. Port 3011. Tracks all services with heartbeats and alerts.",
        status: "healthy", environment: "vps", color: "#f59e0b", icon: "monitor", tags: ["monitoring", "uptime"],
        position: { x: 560, y: 180 },
        runtime: { container: "task-project-monitor", ports: ["3011"] },
        health: { command: "curl http://localhost:3011/status", restartCommand: "docker restart task-project-monitor", logsCommand: "docker logs --tail 30 task-project-monitor" },
        ownerAgent: "rex" },
      { id: "vps.github", name: "GitHub", type: "integration", parentId: "vps",
        description: "Source of truth for codex-mcp-server repo. CI/CD via manual deploy triggers.",
        status: "healthy", environment: "external", color: "#ffffff", icon: "code", tags: ["git", "github"],
        position: { x: 700, y: 260 }, runtime: { url: "https://github.com" }, ownerAgent: "ayub" },
      { id: "vps.vercel", name: "Vercel", type: "deployment", parentId: "vps",
        description: "Hosts taskenterprise.tech. Auto-deploys from GitHub main branch.",
        status: "healthy", environment: "vercel", color: "#ffffff", icon: "cloud", tags: ["vercel", "deploy"],
        position: { x: 840, y: 260 }, runtime: { url: "https://vercel.com" }, ownerAgent: "ayub" },
    ]
  },

  // ── World 7: Automation Systems ───────────────────────────────────────────
  {
    id: "automation", name: "Automation Systems", type: "world",
    description: "n8n workflow automation. Lead flows, CRM, email, SMS, scheduled tasks, background workers.",
    status: "healthy", environment: "vps", color: "#f59e0b",
    icon: "workflow", tags: ["automation", "n8n", "workflows"],
    position: { x: 200, y: 400 },
    children: [
      { id: "automation.leads", name: "Lead Workflows", type: "workflow", parentId: "automation",
        description: "Website form → n8n → Supabase/Notion CRM → email notify → assign agent.",
        status: "healthy", environment: "vps", color: "#f59e0b", icon: "workflow", tags: ["leads"],
        position: { x: 200, y: 480 }, ownerAgent: "sygma" },
      { id: "automation.crm", name: "CRM Workflows", type: "workflow", parentId: "automation",
        description: "Client onboarding, status updates, project tracking via n8n.",
        status: "planned", environment: "vps", color: "#f59e0b", icon: "workflow", tags: ["crm"],
        position: { x: 320, y: 480 }, ownerAgent: "sygma" },
      { id: "automation.email", name: "Email Workflows", type: "workflow", parentId: "automation",
        description: "Automated email sequences, reply handling, digest sends via n8n.",
        status: "planned", environment: "vps", color: "#f59e0b", icon: "workflow", tags: ["email"],
        position: { x: 80, y: 480 }, ownerAgent: "atlas" },
      { id: "automation.scheduled", name: "Scheduled Jobs", type: "workflow", parentId: "automation",
        description: "Cron-triggered jobs: health checks, report generation, memory sync.",
        status: "healthy", environment: "vps", color: "#f59e0b", icon: "workflow", tags: ["cron"],
        position: { x: 200, y: 560 }, ownerAgent: "dame" },
    ]
  },

  // ── World 8: Data / Memory ────────────────────────────────────────────────
  {
    id: "data", name: "Data / Memory Layer", type: "world",
    description: "Supabase/Postgres, Notion, Google Drive, Claude memory files, Graphify, logs, tasks, docs.",
    status: "healthy", environment: "supabase", color: "#84cc16",
    icon: "database", tags: ["data", "memory", "storage"],
    position: { x: -200, y: 400 },
    children: [
      { id: "data.supabase", name: "Supabase / Postgres", type: "database", parentId: "data",
        description: "Primary structured database. Client records, projects, leads, agent data.",
        status: "healthy", environment: "supabase", color: "#22c55e", icon: "database", tags: ["supabase", "postgres"],
        position: { x: -200, y: 480 }, ownerAgent: "ayub",
        runtime: { url: "https://supabase.com" },
        health: { command: "supabase status" }, nextActions: ["Wire leads table", "Add client project rows"] },
      { id: "data.notion", name: "Notion", type: "memory", parentId: "data",
        description: "Docs, SOPs, memory dumps, project notes, knowledge base.",
        status: "healthy", environment: "external", color: "#84cc16", icon: "document", tags: ["notion", "docs"],
        position: { x: -80, y: 480 }, ownerAgent: "ahmed",
        runtime: { url: "https://notion.so" } },
      { id: "data.claude-memory", name: "Claude Memory Files", type: "memory", parentId: "data",
        description: "Persistent memory at ~/.claude/projects. User, feedback, project, and reference memories.",
        status: "healthy", environment: "local", color: "#84cc16", icon: "memory", tags: ["claude", "memory"],
        position: { x: -320, y: 480 }, ownerAgent: "ahmed",
        runtime: { path: "C:\\Users\\offic\\.claude\\projects\\c--Users-offic-Sync\\memory" } },
      { id: "data.gdrive", name: "Google Drive", type: "memory", parentId: "data",
        description: "File storage, shared docs, client deliverables.",
        status: "healthy", environment: "external", color: "#84cc16", icon: "cloud", tags: ["gdrive", "files"],
        position: { x: -200, y: 560 }, ownerAgent: "ahmed" },
      { id: "data.graphify", name: "Graphify", type: "service", parentId: "data",
        description: "Local code graph tool. Indexes codebase. Query symbols, dependencies, paths. Serves graph UI at :8765.",
        status: "healthy", environment: "local", color: "#06b6d4", icon: "graph", tags: ["graphify", "codebase"],
        position: { x: -80, y: 560 }, ownerAgent: "ayub",
        runtime: { path: "C:\\Users\\offic\\Sync\\development\\graphify", ports: ["8765 Graph UI"] },
        health: { command: "uv run python -m graphify query" } },
    ]
  },

  // ── World 9: Monitoring / Ops ─────────────────────────────────────────────
  {
    id: "monitoring", name: "Monitoring / Ops", type: "world",
    description: "Uptime Kuma heartbeats, container health, error logs, deployment checks, reverse proxy status.",
    status: "healthy", environment: "vps", color: "#f59e0b",
    icon: "monitor", tags: ["monitoring", "ops", "health"],
    position: { x: 700, y: 400 },
    ownerAgent: "rex",
    children: [
      { id: "monitoring.kuma", name: "Uptime Kuma :3011", type: "monitor", parentId: "monitoring",
        description: "Service at port 3011 (container: task-project-monitor). Tracks uptime of all containers, endpoints, and external services.",
        status: "healthy", environment: "vps", color: "#f59e0b", icon: "monitor", tags: ["kuma", "uptime"],
        position: { x: 700, y: 480 },
        runtime: { container: "task-project-monitor", ports: ["3011"] },
        health: { restartCommand: "docker restart task-project-monitor" }, ownerAgent: "rex" },
      { id: "monitoring.logs", name: "Container Logs", type: "monitor", parentId: "monitoring",
        description: "docker logs --tail N <container>. All services log to stdout. Rex owns triage.",
        status: "healthy", environment: "vps", color: "#f59e0b", icon: "monitor", tags: ["logs"],
        position: { x: 840, y: 480 }, ownerAgent: "rex",
        health: { command: "docker logs --tail 50 codex-mcp-server-mcp-server-1" } },
    ]
  },

  // ── World 10: Business Systems ────────────────────────────────────────────
  {
    id: "business", name: "Business Systems", type: "world",
    description: "Task Enterprise service lines: Tech Rescue, Sygma House, trading systems, client projects, sales, marketing, finance.",
    status: "healthy", environment: "unknown", color: "#8b5cf6",
    icon: "building", tags: ["business", "services"],
    position: { x: -1000, y: 400 },
    children: [
      { id: "business.tech-rescue", name: "Tech Rescue", type: "service", parentId: "business",
        description: "Emergency tech support service line. Hourly rescue packages. Lead capture on public site.",
        status: "healthy", environment: "unknown", color: "#8b5cf6", icon: "building", tags: ["tech-rescue"],
        position: { x: -1000, y: 480 }, ownerAgent: "sygma" },
      { id: "business.sygma-house", name: "Sygma House", type: "service", parentId: "business",
        description: "Assisted-living and care support business. Sygma agent owns this domain.",
        status: "healthy", environment: "unknown", color: "#ec4899", icon: "building", tags: ["sygma-house"],
        position: { x: -860, y: 480 }, ownerAgent: "sygma" },
      { id: "business.trading", name: "Trading Systems", type: "service", parentId: "business",
        description: "Prime agent desktop automation for trading platforms. Market research workflows.",
        status: "healthy", environment: "local", color: "#8b5cf6", icon: "chart", tags: ["trading", "prime"],
        position: { x: -1140, y: 480 }, ownerAgent: "prime" },
      { id: "business.packages", name: "AI Service Packages", type: "service", parentId: "business",
        description: "Task Enterprise AI service packages. Starter, Growth, Enterprise tiers.",
        status: "healthy", environment: "unknown", color: "#8b5cf6", icon: "document", tags: ["packages"],
        position: { x: -1000, y: 560 }, ownerAgent: "atlas" },
    ]
  },

  // ── World 11: Client Portal / SaaS ────────────────────────────────────────
  {
    id: "portal", name: "Client Portal (Planned)", type: "world",
    description: "Future client portal. Login, billing, plans, tools, requests, client dashboards, AI agent access.",
    status: "planned", environment: "unknown", color: "#06b6d4",
    icon: "portal", tags: ["portal", "saas", "clients"],
    position: { x: -600, y: -500 },
    children: [
      { id: "portal.auth", name: "Auth / Login", type: "portal", parentId: "portal",
        description: "Client authentication. Supabase Auth or custom auth middleware.",
        status: "planned", environment: "unknown", color: "#06b6d4", icon: "shield", tags: ["auth"],
        position: { x: -600, y: -420 }, ownerAgent: "ayub" },
      { id: "portal.billing", name: "Billing / Plans", type: "portal", parentId: "portal",
        description: "Stripe billing integration. Plan tiers, feature gates, usage metering.",
        status: "planned", environment: "unknown", color: "#06b6d4", icon: "document", tags: ["billing"],
        position: { x: -740, y: -420 }, ownerAgent: "sygma" },
      { id: "portal.dashboard", name: "Client Dashboard", type: "portal", parentId: "portal",
        description: "Client-facing project status, request tracking, AI tool access.",
        status: "planned", environment: "unknown", color: "#06b6d4", icon: "monitor", tags: ["dashboard"],
        position: { x: -460, y: -420 }, ownerAgent: "ayub" },
    ]
  },

  // ── World 12: Codex Skills / Extensions ──────────────────────────────────
  {
    id: "skills", name: "Codex Skills", type: "world",
    description: "319+ skills installed at ~/.codex/skills from alirezarezvani/claude-skills. Superpowers plugin system for brainstorming, planning, frontend-design, mcp-builder, and more.",
    status: "healthy", environment: "local", color: "#06b6d4",
    icon: "tool", tags: ["codex", "skills", "superpowers"],
    position: { x: -1000, y: -200 },
    runtime: { path: "C:\\Users\\offic\\.codex\\skills", repo: "alirezarezvani/claude-skills" },
    ownerAgent: "codex",
    children: [
      { id: "skills.brainstorming", name: "Brainstorming Skill", type: "service", parentId: "skills",
        description: "Visual companion + design flow. Runs brainstorm sessions with browser previews.",
        status: "healthy", environment: "local", color: "#06b6d4", icon: "tool", tags: ["brainstorming"],
        position: { x: -1100, y: -120 }, ownerAgent: "codex" },
      { id: "skills.writing-plans", name: "Writing Plans Skill", type: "service", parentId: "skills",
        description: "Converts approved designs into detailed TodoWrite implementation plans.",
        status: "healthy", environment: "local", color: "#06b6d4", icon: "tool", tags: ["planning"],
        position: { x: -1000, y: -120 }, ownerAgent: "codex" },
      { id: "skills.frontend-design", name: "Frontend Design Skill", type: "service", parentId: "skills",
        description: "Guides production React/TypeScript UI builds with design tokens and component patterns.",
        status: "healthy", environment: "local", color: "#06b6d4", icon: "tool", tags: ["frontend"],
        position: { x: -900, y: -120 }, ownerAgent: "codex" },
      { id: "skills.mcp-builder", name: "MCP Builder Skill", type: "service", parentId: "skills",
        description: "Scaffolds and extends MCP tool groups. Adds tools to the registry.",
        status: "healthy", environment: "local", color: "#06b6d4", icon: "tool", tags: ["mcp", "tools"],
        position: { x: -1100, y: -40 }, ownerAgent: "codex" },
    ]
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function flattenRegistry(nodes: SystemNode[]): Map<string, SystemNode> {
  const map = new Map<string, SystemNode>();
  const walk = (arr: SystemNode[]) => arr.forEach(n => {
    map.set(n.id, n);
    if (n.children?.length) walk(n.children);
  });
  walk(nodes);
  return map;
}

function sysStatusColor(s: SystemStatus | undefined): string {
  if (s === "healthy") return "#22c55e";
  if (s === "degraded") return "#f59e0b";
  if (s === "offline") return "#ef4444";
  if (s === "planned") return "#8b5cf6";
  if (s === "experimental") return "#06b6d4";
  return "rgba(255,255,255,0.38)";
}

function getWorldBounds(world: SystemNode): { x: number; y: number; w: number; h: number } {
  const all = [world, ...(world.children || [])];
  const xs = all.map(n => n.position.x);
  const ys = all.map(n => n.position.y);
  const pad = 120;
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + pad * 2 + 200,
    h: Math.max(...ys) - Math.min(...ys) + pad * 2 + 80,
  };
}

const WORLD_CONNECTIONS: Array<{ from: string; to: string; label: string }> = [
  { from: "agents", to: "mcp", label: "TOOL CALLS" },
  { from: "agents", to: "cortex", label: "COMMANDS" },
  { from: "c2", to: "agents", label: "DISPATCH" },
  { from: "c2", to: "cortex", label: "CONTROL" },
  { from: "mcp", to: "vps", label: "HOSTED ON" },
  { from: "c2", to: "vps", label: "HOSTED ON" },
  { from: "automation", to: "data", label: "READ/WRITE" },
  { from: "automation", to: "vps", label: "RUNS ON" },
  { from: "public", to: "automation", label: "LEADS" },
  { from: "public", to: "vps", label: "CF TUNNEL" },
  { from: "agents", to: "data", label: "MEMORY" },
  { from: "monitoring", to: "vps", label: "WATCHES" },
  { from: "cortex", to: "data", label: "MEMORY" },
  { from: "cortex", to: "skills", label: "USES" },
  { from: "business", to: "automation", label: "CRM" },
  { from: "portal", to: "c2", label: "AGENT ACCESS" },
  { from: "portal", to: "data", label: "CLIENT DATA" },
  { from: "c2", to: "skills", label: "RUNS SKILLS" },
];

// ── Universe Glyph ────────────────────────────────────────────────────────────

function UniverseGlyph({ icon, color, size = 28 }: { icon: string; color: string; size?: number }) {
  const s = size;
  const c = s / 2;
  const r = s * 0.42;
  const cm = { fill: "none" as const, stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (icon === "core") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={c} cy={c} r={r * 0.52} fill={`${color}18`} stroke={color} strokeWidth="1.6" />
      <circle cx={c} cy={c} r={r} {...cm} opacity=".38" />
      {[0,60,120,180,240,300].map(a => {
        const rd = a * Math.PI / 180;
        return <line key={a} x1={c+Math.cos(rd)*r*0.58} y1={c+Math.sin(rd)*r*0.58} x2={c+Math.cos(rd)*r} y2={c+Math.sin(rd)*r} {...cm} opacity=".65" />;
      })}
      <rect x={c-2.5} y={c-2.5} width={5} height={5} rx={1} fill={color} />
    </svg>
  );
  if (icon === "globe" || icon === "website") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={c} cy={c} r={r} {...cm} fill={`${color}0e`} />
      <ellipse cx={c} cy={c} rx={r*0.48} ry={r} {...cm} opacity=".5" />
      <line x1={c-r} y1={c} x2={c+r} y2={c} {...cm} opacity=".5" />
    </svg>
  );
  if (icon === "terminal" || icon === "server") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r} y={c-r*0.65} width={r*2} height={r*1.3} rx={2.5} {...cm} fill={`${color}0e`} />
      <path d={`M${c-r*0.5} ${c-r*0.1} l${r*0.26} ${r*0.24} l${-r*0.26} ${r*0.24}`} {...cm} />
      <line x1={c+r*0.05} y1={c+r*0.3} x2={c+r*0.45} y2={c+r*0.3} {...cm} />
    </svg>
  );
  if (icon === "agents") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={c} cy={c-r*0.15} r={r*0.36} fill={`${color}18`} stroke={color} strokeWidth="1.6" />
      <path d={`M${c-r*0.65} ${c+r*0.72} c${r*0.22}-${r*0.6} ${r*1.08}-${r*0.6} ${r*1.3} 0`} {...cm} />
      <circle cx={c-r*0.55} cy={c-r*0.1} r={r*0.2} fill={`${color}14`} stroke={color} strokeWidth="1.2" opacity=".65" />
      <circle cx={c+r*0.55} cy={c-r*0.1} r={r*0.2} fill={`${color}14`} stroke={color} strokeWidth="1.2" opacity=".65" />
    </svg>
  );
  if (icon === "agent") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={c} cy={c-r*0.18} r={r*0.4} fill={`${color}18`} stroke={color} strokeWidth="1.6" />
      <path d={`M${c-r*0.65} ${c+r*0.72} c${r*0.22}-${r*0.6} ${r*1.08}-${r*0.6} ${r*1.3} 0`} {...cm} />
    </svg>
  );
  if (icon === "database") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <ellipse cx={c} cy={c-r*0.42} rx={r*0.62} ry={r*0.26} {...cm} fill={`${color}12`} />
      <path d={`M${c-r*0.62} ${c-r*0.42} v${r*0.88} c0 ${r*0.26} ${r*1.24} ${r*0.26} ${r*1.24} 0 v${-r*0.88}`} {...cm} />
      <path d={`M${c-r*0.62} ${c+r*0.04} c0 ${r*0.26} ${r*1.24} ${r*0.26} ${r*1.24} 0`} {...cm} opacity=".5" />
    </svg>
  );
  if (icon === "monitor") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path d={`M${c-r*0.85} ${c+r*0.28} l${r*0.36}-${r*0.65} l${r*0.34} ${r*1.05} l${r*0.26}-${r*0.75} l${r*0.14} ${r*0.38} l${r*0.34} 0`} {...cm} />
      <circle cx={c} cy={c} r={r} {...cm} opacity=".28" />
    </svg>
  );
  if (icon === "workflow") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r} y={c-r*0.22} width={r*0.58} height={r*0.48} rx={1.5} {...cm} fill={`${color}12`} />
      <rect x={c-r*0.12} y={c-r*0.68} width={r*0.58} height={r*0.48} rx={1.5} {...cm} fill={`${color}12`} />
      <rect x={c-r*0.12} y={c+r*0.18} width={r*0.58} height={r*0.48} rx={1.5} {...cm} fill={`${color}12`} />
      <rect x={c+r*0.38} y={c-r*0.22} width={r*0.58} height={r*0.48} rx={1.5} {...cm} fill={`${color}12`} />
      <path d={`M${c-r*0.42} ${c} h${r*0.3}`} {...cm} />
      <path d={`M${c+r*0.08} ${c-r*0.44} h${r*0.3}`} {...cm} opacity=".65" />
      <path d={`M${c+r*0.08} ${c+r*0.42} h${r*0.3}`} {...cm} opacity=".65" />
    </svg>
  );
  if (icon === "shield") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path d={`M${c} ${c-r} l${r*0.68} ${r*0.34} v${r*0.62} c0 ${r*0.44} ${-r*0.68} ${r*0.68} ${-r*0.68} ${r*0.68} s${-r*0.68}-${r*0.24} ${-r*0.68}-${r*0.68} v${-r*0.62} z`} {...cm} fill={`${color}0e`} />
      <path d={`M${c-r*0.28} ${c} l${r*0.26} ${r*0.28} l${r*0.52}-${r*0.52}`} {...cm} />
    </svg>
  );
  if (icon === "memory") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r} y={c-r*0.38} width={r*2} height={r*0.76} rx={2.5} {...cm} fill={`${color}0e`} />
      {[-0.5,-0.18,0.14,0.46].map((ox, i) => (
        <rect key={i} x={c+ox*r-r*0.07} y={c-r*0.21} width={r*0.14} height={r*0.42} rx={1} fill={color} opacity=".68" />
      ))}
      <line x1={c-r*0.65} y1={c+r*0.52} x2={c-r*0.38} y2={c+r*0.52} {...cm} opacity=".48" />
      <line x1={c+r*0.38} y1={c+r*0.52} x2={c+r*0.65} y2={c+r*0.52} {...cm} opacity=".48" />
    </svg>
  );
  if (icon === "graph") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={c} cy={c-r*0.38} r={r*0.2} fill={`${color}18`} stroke={color} strokeWidth="1.4" />
      <circle cx={c-r*0.55} cy={c+r*0.38} r={r*0.2} fill={`${color}18`} stroke={color} strokeWidth="1.4" />
      <circle cx={c+r*0.55} cy={c+r*0.38} r={r*0.2} fill={`${color}18`} stroke={color} strokeWidth="1.4" />
      <line x1={c} y1={c-r*0.18} x2={c-r*0.38} y2={c+r*0.18} {...cm} opacity=".65" />
      <line x1={c} y1={c-r*0.18} x2={c+r*0.38} y2={c+r*0.18} {...cm} opacity=".65" />
      <line x1={c-r*0.35} y1={c+r*0.38} x2={c+r*0.35} y2={c+r*0.38} {...cm} opacity=".45" />
    </svg>
  );
  if (icon === "antenna" || icon === "tool") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path d={`M${c} ${c+r*0.68} v${-r*0.86} l${-r*0.3}-${r*0.34} l${r*0.3} ${r*0.22} l${r*0.3}-${r*0.22} l${-r*0.3} ${r*0.34}`} {...cm} />
      <path d={`M${c-r*0.46} ${c-r*0.12} a${r*0.52} ${r*0.52} 0 0 1 ${r*0.92} 0`} {...cm} opacity=".5" />
      <path d={`M${c-r*0.78} ${c-r*0.32} a${r*0.84} ${r*0.84} 0 0 1 ${r*1.56} 0`} {...cm} opacity=".28" />
    </svg>
  );
  if (icon === "building") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r*0.52} y={c-r*0.68} width={r*1.04} height={r*1.46} rx={1.5} {...cm} fill={`${color}0e`} />
      {[[-0.3,-0.62],[0.12,-0.62],[-0.3,-0.25],[0.12,-0.25]].map(([ox,oy],i) => (
        <rect key={i} x={c+ox*r-r*0.09} y={c+oy*r-r*0.09} width={r*0.18} height={r*0.22} rx={0.8} fill={color} opacity=".5" />
      ))}
      <rect x={c-r*0.16} y={c+r*0.12} width={r*0.32} height={r*0.66} rx={1} fill={color} opacity=".42" />
    </svg>
  );
  if (icon === "cloud" || icon === "deploy") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path d={`M${c-r*0.45} ${c+r*0.38} h${r*0.9} a${r*0.38} ${r*0.38} 0 0 0 0-${r*0.76} a${r*0.52} ${r*0.52} 0 0 0-${r*0.95}-${r*0.1} a${r*0.38} ${r*0.38} 0 0 0-${r*0.57} ${r*0.38} a${r*0.38} ${r*0.38} 0 0 0 ${r*0.19} ${r*0.48} z`} {...cm} fill={`${color}0e`} />
    </svg>
  );
  if (icon === "code" || icon === "chart") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path d={`M${c-r*0.28} ${c-r*0.33} l${-r*0.42} ${r*0.33} l${r*0.42} ${r*0.33}`} {...cm} />
      <path d={`M${c+r*0.28} ${c-r*0.33} l${r*0.42} ${r*0.33} l${-r*0.42} ${r*0.33}`} {...cm} />
      <line x1={c+r*0.08} y1={c-r*0.52} x2={c-r*0.08} y2={c+r*0.52} {...cm} opacity=".55" />
    </svg>
  );
  if (icon === "voice") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r*0.26} y={c-r*0.68} width={r*0.52} height={r*0.96} rx={r*0.26} {...cm} fill={`${color}12`} />
      <path d={`M${c-r*0.52} ${c+r*0.06} a${r*0.52} ${r*0.52} 0 0 0 ${r*1.04} 0`} {...cm} />
      <line x1={c} y1={c+r*0.52} x2={c} y2={c+r*0.75} {...cm} />
      <line x1={c-r*0.28} y1={c+r*0.75} x2={c+r*0.28} y2={c+r*0.75} {...cm} />
    </svg>
  );
  if (icon === "portal") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path d={`M${c-r*0.48} ${c-r} h${r*0.96} v${r*2} h${-r*0.96}`} {...cm} fill={`${color}0e`} />
      <path d={`M${c+r*0.48} ${c-r*0.48} h${r*0.48} v${r*0.96} h${-r*0.48}`} {...cm} opacity=".5" />
      <path d={`M${c-r*0.08} ${c-r*0.28} l${r*0.42} ${r*0.28} l${-r*0.42} ${r*0.28}`} {...cm} />
    </svg>
  );
  if (icon === "document" || icon === "form") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r*0.52} y={c-r*0.72} width={r*1.04} height={r*1.44} rx={1.5} {...cm} fill={`${color}0e`} />
      <line x1={c-r*0.28} y1={c-r*0.24} x2={c+r*0.28} y2={c-r*0.24} {...cm} opacity=".65" />
      <line x1={c-r*0.28} y1={c+r*0.06} x2={c+r*0.28} y2={c+r*0.06} {...cm} opacity=".65" />
      <line x1={c-r*0.28} y1={c+r*0.34} x2={c+r*0.05} y2={c+r*0.34} {...cm} opacity=".48" />
    </svg>
  );
  if (icon === "model") return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r*0.55} y={c-r*0.55} width={r*1.1} height={r*1.1} rx={2.5} {...cm} fill={`${color}0e`} />
      <rect x={c-r*0.22} y={c-r*0.22} width={r*0.44} height={r*0.44} rx={1.2} fill={color} opacity=".75" />
      <path d={`M${c-r*0.8} ${c-r*0.22} h${r*0.2} M${c-r*0.8} ${c+r*0.22} h${r*0.2}`} {...cm} opacity=".5" />
      <path d={`M${c+r*0.6} ${c-r*0.22} h${r*0.2} M${c+r*0.6} ${c+r*0.22} h${r*0.2}`} {...cm} opacity=".5" />
    </svg>
  );
  // default
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <rect x={c-r*0.58} y={c-r*0.58} width={r*1.16} height={r*1.16} rx={2.5} {...cm} fill={`${color}0e`} />
      <path d={`M${c-r*0.28} ${c-r*0.14} h${r*0.56} M${c-r*0.28} ${c+r*0.14} h${r*0.38}`} {...cm} opacity=".65" />
    </svg>
  );
}

// ── Inspector Panel ───────────────────────────────────────────────────────────

function InspectorPanel({ node, onClose }: { node: SystemNode; onClose: () => void }) {
  const sc = sysStatusColor(node.status);
  const agentColor: Record<string, string> = {
    abdi: "#ef4444", dame: "#f59e0b", ayub: "#3b82f6", ahmed: "#84cc16",
    atlas: "#06b6d4", rex: "#22c55e", prime: "#8b5cf6", sygma: "#ec4899", codex: "#e2e8f0",
  };
  const oc = node.ownerAgent ? (agentColor[node.ownerAgent] || "#fff") : "#fff";
  return (
    <div style={{ width: "100%", height: "100%", background: "rgba(5,7,14,0.97)", borderLeft: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: 999, background: sc, boxShadow: `0 0 10px ${sc}`, marginTop: 3, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: ".03em" }}>{node.name}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 1, textTransform: "uppercase", letterSpacing: ".1em" }}>{node.type}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.28)", fontSize: 17, cursor: "pointer", padding: 2, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <IChip color={sc} label={node.status} />
          {node.environment && <IChip color="rgba(255,255,255,0.3)" label={node.environment} />}
          {node.ownerAgent && <IChip color={oc} label={`→ ${node.ownerAgent}`} />}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "11px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        <ISection label="Description">
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", lineHeight: 1.55 }}>{node.description}</div>
        </ISection>
        {node.runtime && (
          <ISection label="Runtime">
            {node.runtime.container && <IRow label="Container" value={node.runtime.container} mono />}
            {node.runtime.host && <IRow label="Host" value={node.runtime.host} mono />}
            {node.runtime.ports?.map(p => <IRow key={p} label="Port" value={p} mono />)}
            {node.runtime.url && <IRow label="URL" value={node.runtime.url} mono />}
            {node.runtime.path && <IRow label="Path" value={node.runtime.path} mono />}
            {node.runtime.repo && <IRow label="Repo" value={node.runtime.repo} mono />}
          </ISection>
        )}
        {node.health && (
          <ISection label="Health / Ops">
            {node.health.endpoint && <ICmd label="Endpoint" cmd={node.health.endpoint} />}
            {node.health.command && <ICmd label="Health check" cmd={node.health.command} />}
            {node.health.logsCommand && <ICmd label="Logs" cmd={node.health.logsCommand} />}
            {node.health.restartCommand && <ICmd label="Restart" cmd={node.health.restartCommand} />}
            {node.health.lastKnownState && <IRow label="Last state" value={node.health.lastKnownState} />}
          </ISection>
        )}
        {node.dependencies?.length ? (
          <ISection label="Depends on">
            {node.dependencies.map(d => <IRow key={d} label="" value={d} mono />)}
          </ISection>
        ) : null}
        {node.tags?.length ? (
          <ISection label="Tags">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {node.tags.map(t => (
                <span key={t} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.38)", border: "1px solid rgba(255,255,255,0.08)" }}>{t}</span>
              ))}
            </div>
          </ISection>
        ) : null}
        {node.risks?.length ? (
          <ISection label="⚠ Risks" color="#f59e0b">
            {node.risks.map((r, i) => <div key={i} style={{ fontSize: 10, color: "#f59e0b", lineHeight: 1.45, marginBottom: 2 }}>• {r}</div>)}
          </ISection>
        ) : null}
        {node.nextActions?.length ? (
          <ISection label="→ Next Actions" color="#22c55e">
            {node.nextActions.map((a, i) => <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", lineHeight: 1.45, marginBottom: 2 }}>• {a}</div>)}
          </ISection>
        ) : null}
      </div>
    </div>
  );
}

function ISection({ label, color, children }: { label: string; color?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 8.5, color: color || "rgba(255,255,255,0.28)", letterSpacing: ".13em", textTransform: "uppercase", marginBottom: 5, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}

function IRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 3.5, alignItems: "flex-start" }}>
      {label && <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.26)", flexShrink: 0, minWidth: 54, paddingTop: 1, textTransform: "uppercase", letterSpacing: ".07em" }}>{label}</span>}
      <span style={{ fontSize: 9.5, color: mono ? "#7dd3fc" : "rgba(255,255,255,0.68)", fontFamily: mono ? "'Courier New',monospace" : "inherit", wordBreak: "break-all", lineHeight: 1.45 }}>{value}</span>
    </div>
  );
}

function ICmd({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.26)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 8.5, color: "#7dd3fc", fontFamily: "'Courier New',monospace", background: "rgba(125,211,252,0.07)", border: "1px solid rgba(125,211,252,0.14)", borderRadius: 3.5, padding: "3.5px 7px", wordBreak: "break-all", lineHeight: 1.5 }}>{cmd}</div>
    </div>
  );
}

function IChip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".09em", padding: "2.5px 7px", borderRadius: 3.5, background: `${color}1e`, color, border: `1px solid ${color}42`, textTransform: "uppercase" }}>{label}</span>
  );
}

// ── System Explorer ───────────────────────────────────────────────────────────

function SystemExplorer({ selected, onSelect, filter }: { selected: string | null; onSelect: (id: string) => void; filter: string }) {
  const q = filter.toLowerCase();
  const matches = (n: SystemNode) => !q || n.name.toLowerCase().includes(q) || n.tags?.some(t => t.includes(q)) || n.id.includes(q);
  return (
    <div style={{ width: "100%", height: "100%", background: "rgba(5,7,14,0.97)", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "9px 11px 7px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ fontSize: 8.5, fontWeight: 800, color: "rgba(255,255,255,0.28)", letterSpacing: ".16em", textTransform: "uppercase" }}>Systems</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {REGISTRY.filter(w => !q || matches(w) || w.children?.some(matches)).map(world => (
          <div key={world.id}>
            <button onClick={() => onSelect(world.id)} style={{ width: "100%", textAlign: "left", background: selected === world.id ? `${world.color}16` : "none", border: "none", borderLeft: `2px solid ${selected === world.id ? world.color : "transparent"}`, padding: "6px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5.5, height: 5.5, borderRadius: 999, background: sysStatusColor(world.status), flexShrink: 0 }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: selected === world.id ? world.color : "rgba(255,255,255,0.7)", letterSpacing: ".04em", textTransform: "uppercase", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{world.name}</span>
            </button>
            {world.children?.filter(c => !q || matches(c)).map(child => (
              <button key={child.id} onClick={() => onSelect(child.id)} style={{ width: "100%", textAlign: "left", background: selected === child.id ? `${child.color}12` : "none", border: "none", borderLeft: `2px solid ${selected === child.id ? child.color : "transparent"}`, padding: "4.5px 11px 4.5px 22px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 3.5, height: 3.5, borderRadius: 999, background: sysStatusColor(child.status), flexShrink: 0 }} />
                <span style={{ fontSize: 8.5, color: selected === child.id ? child.color : "rgba(255,255,255,0.42)", letterSpacing: ".03em", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.name}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Status Rail ───────────────────────────────────────────────────────────────

function StatusRail({ total, healthy, degraded, offline, planned }: { total: number; healthy: number; degraded: number; offline: number; planned: number }) {
  return (
    <div style={{ height: 26, background: "rgba(5,7,14,0.96)", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 18, padding: "0 14px", fontSize: 8.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
      <span style={{ color: "rgba(255,255,255,0.28)" }}>{total} Systems</span>
      {([["#22c55e","Healthy",healthy],["#f59e0b","Degraded",degraded],["#ef4444","Offline",offline],["#8b5cf6","Planned",planned]] as [string,string,number][]).map(([color,label,count]) => (
        <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, color: count > 0 ? color : "rgba(255,255,255,0.18)" }}>
          <span style={{ width: 4.5, height: 4.5, borderRadius: 999, background: color }} />{count} {label}
        </span>
      ))}
    </div>
  );
}

// ── Canvas ────────────────────────────────────────────────────────────────────

function UniverseCanvas({ cam, onCamChange, onSelectNode, selectedId, searchFilter }: {
  cam: { x: number; y: number; z: number };
  onCamChange: (c: { x: number; y: number; z: number }) => void;
  onSelectNode: (id: string | null) => void;
  selectedId: string | null;
  searchFilter: string;
}) {
  const camRef = useRef(cam);
  useEffect(() => { camRef.current = cam; }, [cam]);
  const panRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const didPanRef = useRef(false);

  const q = searchFilter.toLowerCase();
  const highlight = useCallback((n: SystemNode) => q ? (n.name.toLowerCase().includes(q) || n.tags?.some(t => t.includes(q)) || n.id.includes(q)) : false, [q]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.88 : 1.14;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cv = camRef.current;
    const z = Math.max(0.05, Math.min(14, cv.z * delta));
    const next = { x: mx - (mx - cv.x) * (z / cv.z), y: my - (my - cv.y) * (z / cv.z), z };
    onCamChange(next);
  }, [onCamChange]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    didPanRef.current = false;
    panRef.current = { sx: e.clientX, sy: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.sx;
    const dy = e.clientY - panRef.current.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) didPanRef.current = true;
    onCamChange({ ...camRef.current, x: panRef.current.cx + dx, y: panRef.current.cy + dy });
  }, [onCamChange]);

  const onMouseUp = useCallback(() => { panRef.current = null; }, []);

  const onCanvasClick = useCallback(() => { if (!didPanRef.current) onSelectNode(null); }, [onSelectNode]);
  const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => { e.stopPropagation(); if (!didPanRef.current) onSelectNode(id); }, [onSelectNode]);

  const zl = cam.z;

  return (
    <div style={{ position: "absolute", inset: 0, cursor: panRef.current ? "grabbing" : "grab", overflow: "hidden" }}
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={onCanvasClick}
    >
      {/* Grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(229,25,31,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(229,25,31,0.035) 1px,transparent 1px)", backgroundSize: `${100*zl}px ${100*zl}px`, backgroundPosition: `${cam.x%(100*zl)}px ${cam.y%(100*zl)}px`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 48%,transparent 38%,rgba(3,5,9,0.72))", pointerEvents: "none" }} />

      {/* World layer */}
      <div style={{ position: "absolute", left: 0, top: 0, transform: `translate(${cam.x}px,${cam.y}px) scale(${zl})`, transformOrigin: "0 0", willChange: "transform" }}>
        {/* Edges SVG */}
        <svg style={{ position: "absolute", left: -3500, top: -3000, width: 9000, height: 7000, overflow: "visible", pointerEvents: "none" }}>
          <defs>
            <filter id="eGlow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          {WORLD_CONNECTIONS.map(edge => {
            const fw = REGISTRY.find(w => w.id === edge.from);
            const tw = REGISTRY.find(w => w.id === edge.to);
            if (!fw || !tw) return null;
            const fx = fw.position.x; const fy = fw.position.y;
            const tx = tw.position.x; const ty = tw.position.y;
            const mx = (fx+tx)/2; const my = (fy+ty)/2;
            const cy2 = my + ((my > (fy+ty)/2) ? -55 : 55);
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path d={`M${fx} ${fy} Q${mx} ${cy2},${tx} ${ty}`} fill="none" stroke={fw.color} strokeWidth="2.2" opacity="0.12" filter="url(#eGlow)" />
                <path d={`M${fx} ${fy} Q${mx} ${cy2},${tx} ${ty}`} fill="none" stroke={fw.color} strokeWidth="0.85" opacity="0.42" strokeDasharray="5 11" />
                {zl > 0.3 && <text x={mx} y={my-6} fill={fw.color} fontSize={8} fontWeight={700} letterSpacing={0.7} textAnchor="middle" opacity={0.45} style={{ paintOrder: "stroke", stroke: "#030509", strokeWidth: 5 }}>{edge.label}</text>}
              </g>
            );
          })}
          {REGISTRY.flatMap(world => (world.children || []).map(child => (
            <line key={`${world.id}-${child.id}`} x1={world.position.x} y1={world.position.y} x2={child.position.x} y2={child.position.y} stroke={sysStatusColor(child.status)} strokeWidth={0.7} opacity={zl > 0.2 ? 0.22 : 0.08} strokeDasharray="2.5 8" />
          )))}
        </svg>

        {/* Worlds and children */}
        {REGISTRY.map(world => {
          const bounds = getWorldBounds(world);
          const isSel = selectedId === world.id;
          const isHit = highlight(world);
          const sc = sysStatusColor(world.status);
          const showChildren = zl > 0.18;
          const showChildLabels = zl > 0.5;
          return (
            <div key={world.id}>
              {/* Zone boundary */}
              <div onClick={(e) => handleNodeClick(e, world.id)} style={{ position: "absolute", left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h, border: `1px solid ${world.color}${isSel ? "55" : "1e"}`, borderRadius: 18, background: isSel ? `${world.color}09` : `${world.color}04`, cursor: "pointer", transition: "border-color 180ms,background 180ms" }} />
              {/* World node */}
              <div onClick={(e) => handleNodeClick(e, world.id)} style={{ position: "absolute", left: world.position.x-84, top: world.position.y-26, width: 168, height: 52, background: isSel ? `linear-gradient(135deg,${world.color}26,${world.color}12)` : `linear-gradient(135deg,rgba(7,9,17,0.98),${world.color}18)`, border: `1px solid ${world.color}${isSel ? "aa" : "52"}`, borderRadius: 13, boxShadow: isHit ? `0 0 36px ${world.color}88` : isSel ? `0 0 28px ${world.color}58` : `0 0 18px ${world.color}26`, display: "flex", alignItems: "center", gap: 9, padding: "0 13px", cursor: "pointer", color: world.color, transition: "box-shadow 180ms,border-color 180ms", zIndex: 2 }}>
                <div style={{ flexShrink: 0, filter: `drop-shadow(0 0 7px ${world.color}7a)` }}>
                  <UniverseGlyph icon={world.icon} color={world.color} size={26} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{world.name}</div>
                  <div style={{ fontSize: 7.5, color: sc, letterSpacing: ".1em", textTransform: "uppercase", marginTop: 1.5 }}>{world.status}</div>
                </div>
                <div style={{ width: 4.5, height: 4.5, borderRadius: 999, background: sc, boxShadow: `0 0 7px ${sc}`, position: "absolute", top: 7, right: 7 }} />
              </div>
              {/* Children */}
              {showChildren && (world.children || []).map(child => {
                const csc = sysStatusColor(child.status);
                const cisSel = selectedId === child.id;
                const cisHit = highlight(child);
                return (
                  <div key={child.id} onClick={(e) => handleNodeClick(e, child.id)} style={{ position: "absolute", left: child.position.x-64, top: child.position.y-17, width: 128, height: 34, background: cisSel ? `linear-gradient(135deg,${child.color}1e,${child.color}0c)` : "rgba(6,8,15,0.95)", border: `1px solid ${child.color}${cisSel ? "82" : "34"}`, borderRadius: 7, boxShadow: cisHit ? `0 0 24px ${child.color}75` : cisSel ? `0 0 15px ${child.color}48` : `0 0 8px ${child.color}16`, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", cursor: "pointer", overflow: "hidden", transition: "box-shadow 140ms", zIndex: 3 }}>
                    <div style={{ flexShrink: 0 }}><UniverseGlyph icon={child.icon} color={child.color} size={16} /></div>
                    {showChildLabels && (
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 7.5, fontWeight: 700, color: child.color, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{child.name}</div>
                        {zl > 0.75 && <div style={{ fontSize: 6.5, color: "rgba(255,255,255,0.32)", letterSpacing: ".08em", textTransform: "uppercase", marginTop: 1 }}>{child.status}</div>}
                      </div>
                    )}
                    <div style={{ width: 3.5, height: 3.5, borderRadius: 999, background: csc, flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Zoom % */}
      <div style={{ position: "absolute", bottom: 34, right: 14, fontSize: 8.5, color: "rgba(255,255,255,0.22)", letterSpacing: ".12em", pointerEvents: "none" }}>{(zl*100).toFixed(0)}%</div>
    </div>
  );
}

// ── Main Visionary Universe ───────────────────────────────────────────────────

function VisionaryUniverse({ data }: { data: any }) {
  const allMap = useMemo(() => flattenRegistry(REGISTRY), []);

  const stats = useMemo(() => {
    let total = 0, healthy = 0, degraded = 0, offline = 0, planned = 0;
    const walk = (arr: SystemNode[]) => arr.forEach(n => {
      total++;
      if (n.status === "healthy") healthy++;
      else if (n.status === "degraded") degraded++;
      else if (n.status === "offline") offline++;
      else if (n.status === "planned") planned++;
      if (n.children?.length) walk(n.children);
    });
    walk(REGISTRY);
    return { total, healthy, degraded, offline, planned };
  }, []);

  const [cam, setCam] = useState({ x: 0, y: 0, z: 0.3 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showExplorer, setShowExplorer] = useState(true);
  const selectedNode = selectedId ? (allMap.get(selectedId) ?? null) : null;

  useEffect(() => {
    const vw = window.innerWidth - 220;
    const vh = window.innerHeight - 44 - 26 - 96;
    const allPositions = Array.from(allMap.values()).map(n => n.position);
    const allX = allPositions.map(p => p.x);
    const allY = allPositions.map(p => p.y);
    const minX = Math.min(...allX) - 250; const maxX = Math.max(...allX) + 250;
    const minY = Math.min(...allY) - 250; const maxY = Math.max(...allY) + 250;
    const z = Math.max(0.05, Math.min(0.45, Math.min(vw/(maxX-minX), vh/(maxY-minY)) * 0.8));
    setCam({ x: vw/2 - ((minX+maxX)/2)*z + 220, y: vh/2 - ((minY+maxY)/2)*z + 44, z });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCamChange = useCallback((c: { x: number; y: number; z: number }) => setCam(c), []);
  const handleSelectNode = useCallback((id: string | null) => setSelectedId(id), []);

  const breadcrumb = useMemo(() => {
    if (!selectedNode) return ["Universe"];
    if (selectedNode.parentId) {
      const parent = allMap.get(selectedNode.parentId);
      return ["Universe", parent?.name ?? selectedNode.parentId, selectedNode.name];
    }
    return ["Universe", selectedNode.name];
  }, [selectedNode, allMap]);

  const fitAll = useCallback(() => {
    const leftW = showExplorer ? 220 : 0;
    const rightW = selectedNode ? 340 : 0;
    const vw = window.innerWidth - leftW - rightW;
    const vh = window.innerHeight - 44 - 26 - 96;
    const allPositions = Array.from(allMap.values()).map(n => n.position);
    const allX = allPositions.map(p => p.x);
    const allY = allPositions.map(p => p.y);
    const minX = Math.min(...allX)-250; const maxX = Math.max(...allX)+250;
    const minY = Math.min(...allY)-250; const maxY = Math.max(...allY)+250;
    const z = Math.max(0.05, Math.min(0.45, Math.min(vw/(maxX-minX), vh/(maxY-minY)) * 0.8));
    setCam({ x: vw/2 - ((minX+maxX)/2)*z + leftW, y: vh/2 - ((minY+maxY)/2)*z + 44, z });
  }, [showExplorer, selectedNode, allMap]);

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 96px)", overflow: "hidden", background: "radial-gradient(ellipse at 28% 22%,rgba(229,25,31,0.11),transparent 44%),radial-gradient(ellipse at 74% 72%,rgba(229,25,31,0.065),transparent 38%),#030509" }}>
      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: showExplorer ? 220 : 0, right: selectedNode ? 340 : 0, height: 44, background: "rgba(5,7,14,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 11, padding: "0 14px", zIndex: 28, transition: "left 180ms,right 180ms" }}>
        <button onClick={() => setShowExplorer(v => !v)} style={{ background: showExplorer ? "rgba(229,25,31,0.14)" : "rgba(255,255,255,0.05)", border: `1px solid ${showExplorer ? "rgba(229,25,31,0.48)" : "rgba(255,255,255,0.09)"}`, borderRadius: 5.5, padding: "3.5px 9px", cursor: "pointer", color: showExplorer ? "#ef4444" : "rgba(255,255,255,0.42)", fontSize: 8.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", flexShrink: 0 }}>Systems</button>
        <div style={{ display: "flex", alignItems: "center", gap: 4.5, flex: 1, minWidth: 0 }}>
          {breadcrumb.map((seg, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4.5 }}>
              {i > 0 && <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 9.5 }}>›</span>}
              <span style={{ fontSize: 9.5, fontWeight: i === breadcrumb.length-1 ? 700 : 500, color: i === breadcrumb.length-1 ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.32)", letterSpacing: ".04em" }}>{seg}</span>
            </span>
          ))}
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search systems, agents, ports…"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, padding: "4.5px 9px", color: "#fff", fontSize: 9.5, width: 210, outline: "none" }} />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.32)", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>}
        </div>
        <button onClick={fitAll} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 5.5, padding: "3.5px 9px", cursor: "pointer", color: "rgba(255,255,255,0.42)", fontSize: 8.5, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", flexShrink: 0 }}>Fit</button>
      </div>

      {/* Explorer panel */}
      {showExplorer && (
        <div style={{ position: "absolute", top: 44, left: 0, width: 220, height: "calc(100% - 44px - 26px)", zIndex: 27 }}>
          <SystemExplorer selected={selectedId} onSelect={handleSelectNode} filter={search} />
        </div>
      )}

      {/* Canvas */}
      <div style={{ position: "absolute", top: 44, left: showExplorer ? 220 : 0, right: selectedNode ? 340 : 0, bottom: 26 }}>
        <UniverseCanvas cam={cam} onCamChange={handleCamChange} onSelectNode={handleSelectNode} selectedId={selectedId} searchFilter={search} />
      </div>

      {/* Inspector panel */}
      {selectedNode && (
        <div style={{ position: "absolute", top: 44, right: 0, width: 340, height: "calc(100% - 44px - 26px)", zIndex: 27 }}>
          <InspectorPanel node={selectedNode} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {/* Status rail */}
      <div style={{ position: "absolute", bottom: 0, left: showExplorer ? 220 : 0, right: selectedNode ? 340 : 0, zIndex: 27 }}>
        <StatusRail {...stats} />
      </div>

      {/* Hint */}
      <div style={{ position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)", fontSize: 8.5, color: "rgba(255,255,255,0.16)", letterSpacing: ".1em", textTransform: "uppercase", pointerEvents: "none", whiteSpace: "nowrap" }}>
        Scroll to zoom · Drag to pan · Click to inspect
      </div>
    </div>
  );
}

export function VisionaryPage({ data, actions }: PageProps) {
  return <VisionaryUniverse data={data} />;
}

export function ModelsPage({ data, actions }: PageProps) {
  const agents = data.agents as any[];
  const agentColors = _AGENT_COLORS;

  const CURATED_MODELS = [
    { id: "openai/gpt-oss-120b:free",               label: "GPT-OSS 120B",        tier: "free", provider: "OpenRouter" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free",  label: "Nemotron Super 120B", tier: "free", provider: "OpenRouter" },
    { id: "google/gemini-2.0-flash-exp:free",        label: "Gemini 2.0 Flash Exp",tier: "free", provider: "Google" },
    { id: "google/gemini-2.5-flash:free",            label: "Gemini 2.5 Flash",    tier: "free", provider: "Google" },
    { id: "meta-llama/llama-3.3-70b-instruct:free",  label: "Llama 3.3 70B",       tier: "free", provider: "Meta" },
    { id: "meta-llama/llama-3.1-8b-instruct:free",   label: "Llama 3.1 8B",        tier: "free", provider: "Meta" },
    { id: "deepseek/deepseek-r1:free",               label: "DeepSeek R1",         tier: "free", provider: "DeepSeek" },
    { id: "mistralai/mistral-7b-instruct:free",      label: "Mistral 7B",          tier: "free", provider: "Mistral" },
    { id: "openai/gpt-4o-mini",                     label: "GPT-4o Mini",         tier: "paid", provider: "OpenAI" },
    { id: "openai/gpt-4.1-mini",                    label: "GPT-4.1 Mini",        tier: "paid", provider: "OpenAI" },
    { id: "openai/gpt-4o",                          label: "GPT-4o",              tier: "paid", provider: "OpenAI" },
    { id: "openai/gpt-4.1",                         label: "GPT-4.1",             tier: "paid", provider: "OpenAI" },
    { id: "openai/o3",                              label: "OpenAI o3",           tier: "paid", provider: "OpenAI" },
    { id: "anthropic/claude-haiku-4-5",             label: "Claude Haiku 4.5",    tier: "paid", provider: "Anthropic" },
    { id: "anthropic/claude-sonnet-4-6",            label: "Claude Sonnet 4.6",   tier: "paid", provider: "Anthropic" },
    { id: "anthropic/claude-opus-4-7",              label: "Claude Opus 4.7",     tier: "paid", provider: "Anthropic" },
    { id: "google/gemini-2.0-flash-001",            label: "Gemini 2.0 Flash",    tier: "paid", provider: "Google" },
    { id: "google/gemini-2.5-pro",                  label: "Gemini 2.5 Pro",      tier: "paid", provider: "Google" },
    { id: "openai/gpt-4.5",                         label: "GPT-4.5",             tier: "paid", provider: "OpenAI" },
  ];

  const AGENT_ICONS: Record<string, string> = {
    abdi: "👑", ahmed: "📊", dame: "⚙️",
    rex: "🛡️", prime: "📈", atlas: "🚀",
    ayub: "🔨", sygma: "🎯",
  };

  const [search, setSearch] = useState("");
  const [pendingModels, setPendingModels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (document.getElementById("mp2-style")) return;
    const s = document.createElement("style");
    s.id = "mp2-style";
    s.textContent = `
      @keyframes mp2-pop { 0%{transform:scale(1.15);opacity:1} 100%{transform:scale(1);opacity:0} }
      .mp2-card { transition: box-shadow 0.2s, border-color 0.2s; }
      .mp2-card:hover { box-shadow: 0 0 24px 0 var(--mp2-glow,#3d9de840) !important; }
      .mp2-btn { transition: all 0.15s; }
      .mp2-btn:hover:not(:disabled) { filter: brightness(1.15); }
      .mp2-btn:active:not(:disabled) { transform: scale(0.96); }
      .mp2-select:focus { outline: none; box-shadow: 0 0 0 2px var(--mp2-ring,#3d9de840); }
    `;
    document.head.appendChild(s);
  }, []);

  const getModel = (agent: any) => pendingModels[agent.id] ?? agent.currentModel ?? "";
  const pendingCount = Object.keys(pendingModels).length;
  const freeCount = agents.filter(a => (getModel(a) || "").includes(":free")).length;

  const filteredModels = search.trim()
    ? CURATED_MODELS.filter(m =>
        m.label.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        m.provider.toLowerCase().includes(search.toLowerCase())
      )
    : CURATED_MODELS;

  const handleSave = async (agentId: string) => {
    const modelId = pendingModels[agentId];
    if (!modelId) return;
    setSaving(agentId);
    try {
      await actions.assignPrimaryModel(agentId, modelId);
      setPendingModels(prev => { const n = { ...prev }; delete n[agentId]; return n; });
      setSaved(agentId);
      setTimeout(() => setSaved(v => v === agentId ? null : v), 2000);
    } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  const handleSaveAll = async () => {
    for (const [agentId, modelId] of Object.entries(pendingModels)) {
      setSaving(agentId);
      try { await actions.assignPrimaryModel(agentId, modelId); } catch { /* ignore */ }
    }
    setSaving(null);
    setPendingModels({});
    setSaved("__all__");
    setTimeout(() => setSaved(null), 2000);
  };

  const applyToAll = (modelId: string) => {
    if (!modelId) return;
    const next: Record<string, string> = {};
    for (const a of agents) next[a.id] = modelId;
    setPendingModels(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>

      {/* ── Stats strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {[
          { label: "Agents Online",   value: agents.filter(a => a.status === "online").length,  glow: "#4caf7d" },
          { label: "On Free Models",  value: freeCount,                                          glow: "#9b6fd4" },
          { label: "Unique Models",   value: new Set(agents.map(a => getModel(a))).size,         glow: "#3d9de8" },
          { label: "Pending Changes", value: pendingCount,                                       glow: pendingCount > 0 ? "#e08a3c" : "var(--text-3)" },
        ].map(k => (
          <div key={k.label} style={{
            padding: "10px 14px", borderRadius: 10,
            background: `linear-gradient(135deg,${k.glow}12 0%,var(--surface) 100%)`,
            border: `1px solid ${k.glow}30`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: k.glow, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <input className="field field-sm mp2-select" placeholder="Search models…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", paddingLeft: 28 }} />
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--text-3)", pointerEvents: "none" }}>🔍</span>
        </div>
        <select className="field field-sm mp2-select" style={{ minWidth: 220 }} defaultValue=""
          onChange={e => { applyToAll(e.target.value); (e.target as HTMLSelectElement).value = ""; }}>
          <option value="">Apply one model to all agents…</option>
          <optgroup label="── Free ──">
            {CURATED_MODELS.filter(m => m.tier === "free").map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </optgroup>
          <optgroup label="── Paid ──">
            {CURATED_MODELS.filter(m => m.tier === "paid").map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </optgroup>
        </select>
        {pendingCount > 0 && (
          <button className="mp2-btn" onClick={handleSaveAll} style={{
            padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#e08a3c,#e05c5c)", color: "#fff",
            fontSize: 12, fontWeight: 700, boxShadow: "0 0 12px #e08a3c44",
          }}>Save All ({pendingCount})</button>
        )}
        {saved === "__all__" && <span style={{ fontSize: 12, color: "#4caf7d", fontWeight: 700 }}>✓ All saved</span>}
      </div>

      {/* ── Agent cards ── */}
      <div style={{ padding: "18px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
        {agents.map((agent: any) => {
          const key = agent.name?.toLowerCase() || agent.id;
          const color = (agentColors as any)[key] || "#3d9de8";
          const icon = AGENT_ICONS[key] || "🤖";
          const currentModelId = getModel(agent);
          const isDirty = pendingModels[agent.id] !== undefined;
          const modelInfo = CURATED_MODELS.find(m => m.id === currentModelId);
          const isFree = currentModelId.includes(":free");
          const isSavingThis = saving === agent.id;
          const isSavedThis = saved === agent.id;

          return (
            <div key={agent.id} className="mp2-card" style={{
              "--mp2-glow": color + "44",
              "--mp2-ring": color + "44",
              borderRadius: 14,
              border: `1px solid ${isDirty ? color + "70" : color + "22"}`,
              background: `linear-gradient(145deg,${color}0d 0%,var(--surface) 65%)`,
              padding: "18px 18px 16px",
              display: "flex", flexDirection: "column", gap: 13,
              boxShadow: isDirty ? `0 0 20px ${color}28` : "none",
            } as any}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                  background: `${color}1c`, border: `2px solid ${color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 19, boxShadow: `0 0 10px ${color}38`,
                }}>{icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)" }}>{agent.name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: ".07em",
                      textTransform: "uppercase",
                      background: agent.status === "online" ? "#4caf7d1e" : "#5555551e",
                      color: agent.status === "online" ? "#4caf7d" : "var(--text-3)",
                      border: `1px solid ${agent.status === "online" ? "#4caf7d38" : "#55555538"}`,
                    }}>{agent.status}</span>
                    {isFree && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: ".07em", textTransform: "uppercase", background: "#9b6fd41e", color: "#9b6fd4", border: "1px solid #9b6fd438" }}>FREE</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{agent.role || agent.specialty || "Agent"}</div>
                </div>
              </div>

              {/* Active model badge */}
              <div style={{
                padding: "8px 11px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(0,0,0,0.25)", border: `1px solid ${color}1c`,
              }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 2 }}>Active Model</div>
                  <div style={{ fontSize: 12, color: "var(--text-1)", fontFamily: "monospace", fontWeight: 600 }}>
                    {modelInfo?.label || currentModelId || "unassigned"}
                  </div>
                  {modelInfo && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>{modelInfo.provider}</div>}
                </div>
                {isDirty && <span style={{ fontSize: 10, color: "#e08a3c", fontWeight: 700, letterSpacing: ".04em" }}>UNSAVED</span>}
              </div>

              {/* Picker */}
              <select
                className="field mp2-select"
                value={currentModelId}
                onChange={e => setPendingModels(prev => ({ ...prev, [agent.id]: e.target.value }))}
                style={{
                  fontSize: 12, borderRadius: 8, padding: "8px 10px",
                  borderColor: isDirty ? color : "var(--border)",
                  background: "var(--surface)", color: "var(--text-1)",
                  "--mp2-ring": color + "55",
                } as any}
              >
                {currentModelId && !CURATED_MODELS.find(m => m.id === currentModelId) && (
                  <option value={currentModelId}>{currentModelId}</option>
                )}
                <optgroup label="── Free Models ──">
                  {(search ? filteredModels.filter(m => m.tier === "free") : CURATED_MODELS.filter(m => m.tier === "free")).map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.provider}</option>
                  ))}
                </optgroup>
                <optgroup label="── Paid Models ──">
                  {(search ? filteredModels.filter(m => m.tier === "paid") : CURATED_MODELS.filter(m => m.tier === "paid")).map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.provider}</option>
                  ))}
                </optgroup>
              </select>

              {/* Save row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="mp2-btn"
                  disabled={!isDirty || isSavingThis}
                  onClick={() => handleSave(agent.id)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                    cursor: isDirty ? "pointer" : "default",
                    background: isDirty ? `linear-gradient(135deg,${color}cc,${color}88)` : "var(--surface)",
                    color: isDirty ? "#fff" : "var(--text-3)",
                    fontSize: 12, fontWeight: 700,
                    opacity: isSavingThis ? 0.65 : 1,
                    boxShadow: isDirty ? `0 0 14px ${color}44` : "none",
                  }}
                >{isSavingThis ? "Saving…" : "Apply Model"}</button>
                {isSavedThis && <span style={{ fontSize: 16, animation: "mp2-pop 2s forwards" }}>✓</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Model directory ── */}
      <div style={{ padding: "0 20px 28px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
          Model Directory — {filteredModels.length} available
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 7 }}>
          {filteredModels.map(m => (
            <div key={m.id} style={{
              padding: "9px 13px", borderRadius: 9,
              background: "var(--surface)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{m.label}</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1, fontFamily: "monospace" }}>{m.provider}</div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: ".07em", padding: "3px 7px", borderRadius: 5, textTransform: "uppercase",
                background: m.tier === "free" ? "#9b6fd41e" : "#3d9de81e",
                color: m.tier === "free" ? "#9b6fd4" : "#3d9de8",
                border: `1px solid ${m.tier === "free" ? "#9b6fd438" : "#3d9de838"}`,
              }}>{m.tier}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
