import { useState } from "react";
import type { ReactNode } from "react";
import {
  NAV_ITEMS,
  cn,
  badgeTone,
  formatRelative,
  type ContextState,
  type PageKey,
  type SearchResult,
  type PanelProps,
  labelForContext,
  statusValue,
  dotTone,
} from "./types";

/* ─── Sidebar ─── */

export function Sidebar({
  currentPage,
  openPage,
}: {
  currentPage: PageKey;
  openPage: (page: PageKey) => void;
}) {
  const sections: string[] = [];
  NAV_ITEMS.forEach((item) => {
    if (item.section && !sections.includes(item.section)) sections.push(item.section);
  });

  const topItems = NAV_ITEMS.filter((item) => !item.section);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ gap: 10 }}>
        <span className="sidebar-brand-title">Command Center</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">
          {topItems.map((item) => (
            <button
              key={item.key}
              className={cn("sidebar-item", currentPage === item.key && "sidebar-item-active")}
              onClick={() => openPage(item.key)}
              type="button"
            >
              <span className="sidebar-item-icon">{sidebarIcon(item.key)}</span>
              {item.label}
            </button>
          ))}
        </div>

        {sections.map((section) => (
          <div className="sidebar-section" key={section}>
            <div className="sidebar-section-label">{section}</div>
            {NAV_ITEMS.filter((item) => item.section === section).map((item) => (
              <button
                key={item.key}
                className={cn("sidebar-item", currentPage === item.key && "sidebar-item-active")}
                onClick={() => openPage(item.key)}
                type="button"
              >
                <span className="sidebar-item-icon">{sidebarIcon(item.key)}</span>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <span className="sidebar-footer-label">Task Enterprise LLC</span>
        </div>
      </div>
    </aside>
  );
}

function sidebarIcon(key: PageKey): string {
  switch (key) {
    case "home": return "⌂";
    case "leads-revenue": return "◫";
    case "agents": return "◎";
    case "voice": return "◉";
    case "models": return "◇";
    case "mcp": return "▣";
    case "mcp-tools": return "⚙";
    case "tool-store": return "□";
    case "openclaw": return "◈";
    case "protocols": return "⟡";
    case "projects": return "▪";
    case "tasks": return "☐";
    case "notes": return "≡";
    case "calendar": return "▦";
    case "docs": return "⊞";
    case "logs": return "▤";
    case "integrations": return "⊕";
    case "settings": return "⊙";
    default: return "·";
  }
}


/* ─── Right Rail ─── */

export function Rail({
  context,
  traceFeed,
  data,
}: {
  context: ContextState;
  openRoute: (route: string) => void;
  traceFeed: any[];
  data?: any;
}) {
  const [planCollapsed, setPlanCollapsed] = useState(true);

  const project = context?.type === "project" ? context.item : null;
  const plan: any[] = project?.thirtyDayPlan || [];
  const todayDay = 1;
  const currentDayPlan = plan.find((d: any) => d.day === todayDay);
  const planProgress = plan.filter((d: any) => d.tasks?.every((t: any) => t.status === "done")).length;

  const agent = context?.type === "agent" ? context.item : null;
  const agentTasks = agent && data?.tasks?.tasks
    ? (data.tasks.tasks as any[]).filter((t: any) =>
        (t.assignedAgent || "").toLowerCase() === (agent.name || "").toLowerCase()
      )
    : [];
  const currentTask = agentTasks.find((t: any) => t.status === "active") || agentTasks[0];
  const agentLogs = agent && data?.logs?.events
    ? (data.logs.events as any[]).filter((e: any) =>
        (e.stream || "").toLowerCase().includes((agent.name || "").toLowerCase()) ||
        (e.summary || "").toLowerCase().includes((agent.name || "").toLowerCase())
      ).slice(0, 3)
    : [];

  return (
    <aside className="rail">
      <div className="rail-header">
        <div className="rail-title">Inspector</div>
        {context ? (
          <div className="rail-subtitle">{labelForContext(context.type, context.item)}</div>
        ) : null}
      </div>

      <div className="rail-body">
        {context ? (
          <div className="rail-section">
            <div className="rail-section-title">Detail</div>
            <ContextDetail context={context} />
          </div>
        ) : (
          <div className="empty">
            <span className="empty-text">Select an item to inspect</span>
          </div>
        )}

        {/* Agent Activity Overlay */}
        {agent && (
          <div className="rail-section">
            <div className="rail-section-title">Agent Activity</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className={cn("status-dot", dotTone(agent.status || "online"))} />
                <span className="text-sm font-medium text-1">{agent.status || "online"}</span>
                {agent.queueSize != null && <span className="text-xs text-3">{agent.queueSize} queued</span>}
              </div>
              {currentTask ? (
                <div style={{ padding: "8px 10px", borderRadius: "var(--r)", border: "1px solid var(--border)", background: "var(--surface)" }}>
                  <div className="text-xs text-3" style={{ marginBottom: 4 }}>Current Task</div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className={cn("status-dot", statusValue("task", currentTask) === "active" ? "dot-active" : "dot-standby")} />
                    <span className="text-sm text-1" style={{ flex: 1, lineHeight: 1.4 }}>{currentTask.title}</span>
                  </div>
                  {currentTask.output && (
                    <div style={{ marginTop: 8 }}>
                      <div className="text-xs text-3" style={{ marginBottom: 3 }}>Last Output</div>
                      <div style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)", background: "var(--surface-raised)", borderRadius: "var(--r-sm)", padding: "6px 8px", maxHeight: 72, overflowY: "auto", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {typeof currentTask.output === "string" ? currentTask.output.slice(0, 240) : JSON.stringify(currentTask.output).slice(0, 240)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-3">No active task</div>
              )}
              {agentLogs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: "var(--r)", border: "1px solid var(--border)", overflow: "hidden" }}>
                  {agentLogs.map((e: any, i: number) => (
                    <div key={e.id || i} style={{ display: "grid", gridTemplateColumns: "6px 1fr auto", gap: 8, padding: "7px 10px", background: "var(--surface)", borderBottom: i < agentLogs.length - 1 ? "1px solid var(--border)" : undefined }}>
                      <span className={cn("status-dot", e.level === "error" ? "dot-error" : e.level === "warning" ? "dot-warning" : "dot-info")} style={{ marginTop: 3 }} />
                      <span style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.4 }}>{e.summary || e.detail}</span>
                      <span style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatRelative(e.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Project Panel */}
        {project && (
          <div className="rail-section">
            <div className="rail-section-title">Project Panel</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span className="text-xs text-3">30-Day Progress</span>
                  <span className="text-xs text-3">{planProgress}/{plan.length} days</span>
                </div>
                <ProgressMeter value={plan.length ? (planProgress / plan.length) * 100 : 0} />
              </div>
              {currentDayPlan && (
                <div style={{ padding: "8px 10px", borderRadius: "var(--r)", border: "1px solid var(--accent)", background: "rgba(224,53,53,0.05)" }}>
                  <div className="text-xs text-3" style={{ marginBottom: 6 }}>Today · Day {currentDayPlan.day} — {currentDayPlan.theme}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {(currentDayPlan.tasks || []).slice(0, 4).map((task: any) => (
                      <div key={task.id} className="row" style={{ gap: 6 }}>
                        <span className={cn("status-dot", task.status === "done" ? "dot-online" : task.status === "active" ? "dot-active" : "dot-standby")} />
                        <span className="text-xs text-2" style={{ flex: 1, lineHeight: 1.4 }}>{task.title}</span>
                        <span className="text-xs text-3">{task.agent}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {plan.length > 0 && (
                <div>
                  <button
                    style={{ width: "100%", background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "7px 10px", cursor: "pointer", textAlign: "left" }}
                    onClick={() => setPlanCollapsed((v) => !v)}
                  >
                    <div className="row-between">
                      <span className="text-xs font-medium text-2">Full Plan ({plan.length} days)</span>
                      <span className="text-xs text-3">{planCollapsed ? "▸ Expand" : "▾ Collapse"}</span>
                    </div>
                  </button>
                  {!planCollapsed && (
                    <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                      {plan.map((d: any) => {
                        const done = (d.tasks || []).filter((t: any) => t.status === "done").length;
                        const total = (d.tasks || []).length;
                        return (
                          <div key={d.day} className="row" style={{ gap: 8, padding: "5px 8px", borderRadius: "var(--r-sm)", background: d.day === todayDay ? "rgba(224,53,53,0.07)" : undefined }}>
                            <span className="text-xs text-3" style={{ width: 32, flexShrink: 0 }}>D{d.day}</span>
                            <span className="text-xs text-2" style={{ flex: 1 }}>{d.theme}</span>
                            <span className="text-xs text-3">{done}/{total}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {traceFeed.length > 0 ? (
          <div className="rail-section">
            <div className="rail-section-title">Live Events</div>
            <div className="activity-stack">
              {traceFeed.slice(0, 6).map((event) => (
                <div className="activity-item" key={event.id}>
                  <div className="activity-topline">
                    <span className="text-sm font-medium text-1">{event.title}</span>
                    <span className="activity-time">{formatRelative(event.timestamp)}</span>
                  </div>
                  <p>{event.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ContextDetail({ context }: { context: NonNullable<ContextState> }) {
  const { type, item } = context;
  const facts = contextFacts(type, item);

  return (
    <div>
      <div className="row gap-8" style={{ marginBottom: 12 }}>
        <span className={cn("status-dot", dotTone(statusValue(type, item)))} />
        <span className="text-sm font-medium">{statusValue(type, item)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {facts.map((f) => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span className="text-xs text-3">{f.label}</span>
            <span className="text-sm text-1 font-medium">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function contextFacts(type: string, item: any): Array<{ label: string; value: string }> {
  switch (type) {
    case "agent":
      return [
        { label: "Role", value: item.role },
        { label: "Model", value: item.currentModel },
        { label: "Fallback", value: item.backupModel },
        { label: "Uptime", value: item.uptime },
      ];
    case "voice":
      return [
        { label: "Channel", value: item.channel },
        { label: "Model", value: item.currentModel },
        { label: "Latency", value: `${item.latencyMs}ms` },
      ];
    case "model":
      return [
        { label: "Provider", value: item.provider },
        { label: "Family", value: item.family },
        { label: "Latency", value: `${item.latencyMs}ms` },
      ];
    case "tool":
      return [
        { label: "Category", value: item.category },
        { label: "Protocol", value: item.protocol },
        { label: "Permissions", value: item.permissions },
      ];
    case "store-tool":
      return [
        { label: "Vendor", value: item.vendor },
        { label: "Category", value: item.category },
        { label: "Install", value: item.installState },
      ];
    case "project":
      return [
        { label: "Owner", value: item.owner },
        { label: "Phase", value: item.phase },
        { label: "Priority", value: item.priority },
      ];
    case "log":
      return [
        { label: "Stream", value: item.stream },
        { label: "Level", value: item.level },
      ];
    case "task":
      return [
        { label: "Agent", value: item.assignedAgent },
        { label: "Model", value: item.model || item.assignedModel },
        { label: "Status", value: item.status },
        { label: "Priority", value: item.priority },
        { label: "Approval", value: item.approvalState && item.approvalState !== "none" ? item.approvalState : undefined },
        { label: "Created", value: item.timestamp },
        { label: "Started", value: item.startedAt },
        { label: "Completed", value: item.completedAt },
        { label: "Duration", value: item.durationMs ? `${(item.durationMs / 1000).toFixed(1)}s` : item.executionTime },
      ].filter(f => f.value) as { label: string; value: string }[];
    default:
      return [];
  }
}


/* ─── Shared Components ─── */

export function StatusBadge({ value }: { value: string }) {
  return <span className={cn("badge", badgeTone(value))}>{value}</span>;
}

export function StatusDot({ value }: { value: string }) {
  return <span className={cn("status-dot", dotTone(value))} />;
}

export function Btn({
  children,
  onClick,
  variant = "secondary",
  size,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
}) {
  return (
    <button
      className={cn("btn", `btn-${variant}`, size === "sm" && "btn-sm")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function Panel({ title, subtitle, action, className, children }: PanelProps) {
  return (
    <div className={cn("panel", className)}>
      <div className="panel-header">
        <div>
          <div className="panel-title">{title}</div>
          {subtitle ? <div className="panel-subtitle">{subtitle}</div> : null}
        </div>
        {action || null}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

export function SearchOverlay({
  results,
  openResult,
}: {
  results: SearchResult[];
  openResult: (result: SearchResult) => void;
}) {
  if (!results.length) return null;

  return (
    <div style={{
      position: "absolute",
      top: 48,
      left: 0,
      right: 0,
      zIndex: 100,
      background: "var(--surface-raised)",
      border: "1px solid var(--border-strong)",
      borderRadius: "var(--r-lg)",
      maxHeight: 400,
      overflow: "auto",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {results.map((r) => (
        <button key={r.id} className="list-item" onClick={() => openResult(r)}>
          <div className="list-item-content">
            <div className="list-item-title">{r.title}</div>
            <div className="list-item-sub">{r.subtitle}</div>
          </div>
          <span className="text-xs text-3">{r.type}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Legacy Compat Exports ─── */

export function ActionButton({
  children,
  onClick,
  variant = "secondary",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return <Btn variant={variant} onClick={onClick}>{children}</Btn>;
}

export function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {note ? <div className="metric-note">{note}</div> : null}
    </div>
  );
}

export function TagRow({ values }: { values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="tag-row">
      {values.slice(0, 6).map((v) => <span className="tag" key={v}>{v}</span>)}
    </div>
  );
}

export function ProgressMeter({ value }: { value: number }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, value))}%`, borderRadius: 2, background: "var(--accent)" }} />
    </div>
  );
}

export function TimelineItem({
  title,
  detail,
  meta,
  tone,
  onClick,
}: {
  title: string;
  detail: string;
  meta: string;
  tone?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="list-item">
      <span className={cn("status-dot", dotTone(tone || ""))} />
      <div className="list-item-content">
        <div className="list-item-title">{title}</div>
        <div className="list-item-sub">{detail}</div>
      </div>
      <span className="text-xs text-3">{meta}</span>
    </div>
  );

  if (onClick) {
    return <button onClick={onClick} style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: 0 }}>{inner}</button>;
  }
  return inner;
}
