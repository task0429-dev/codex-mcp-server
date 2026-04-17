import { useEffect, useState } from "react";
import { ActionButton, Btn, StatusBadge, StatusDot, TagRow } from "./shell";
import { cn, dayKey, formatDate, formatRelative, formatStamp, formatTime, monthCells, dotTone, type PageProps } from "./types";
import { MemoryConsolePage } from "./pages-memory-console";
import { CortexPage } from "./pages-cortex";
import { upsertProjectThread } from "./pages-core";

/* ─── Projects ─── */

export function ProjectsPage({ data, context, focus, actions, openRoute }: PageProps & { openRoute?: (path: string) => void }) {
  const selected = context?.type === "project" ? context.item : data.projects.items[0];
  const [activeTab, setActiveTab] = useState<"overview"|"plan"|"logs"|"files">("overview");
  const [planCollapsed, setPlanCollapsed] = useState<Record<number, boolean>>({});
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionResult, setNotionResult] = useState<{url?: string; created?: boolean} | null>(null);

  const todayDay = 1; // In production derive from project startDate
  const plan: any[] = selected?.thirtyDayPlan || [];
  const currentDayPlan = plan.find((d: any) => d.day === todayDay);
  const currentWeek = selected?.currentWeek || 1;
  const weeklyGoals: any[] = selected?.weeklyGoals || [];
  const currentWeekGoals = weeklyGoals.find((w: any) => w.week === currentWeek) || weeklyGoals[0];
  const agentExecutionBoard: any[] = selected?.agentExecutionBoard || [];

  const syncToNotion = async () => {
    setNotionSyncing(true);
    setNotionResult(null);
    try {
      const result = await actions.notionOperatorSync(selected?.id || "zero-budget-marketing-engine");
      setNotionResult(result);
    } catch { /* handled by pushEvent in performAction */ }
    finally { setNotionSyncing(false); }
  };

  const toggleDay = (day: number) =>
    setPlanCollapsed((prev) => ({ ...prev, [day]: !prev[day] }));

  // Gather logs relevant to this project
  const projectLogs = selected
    ? (data.logs?.events || []).filter((e: any) =>
        (e.stream && selected.linkedAgents?.some((a: string) => e.stream?.toLowerCase().includes(a.toLowerCase()))) ||
        (e.summary && e.summary.toLowerCase().includes((selected.name || "").toLowerCase().split(" ")[0].toLowerCase()))
      ).slice(0, 30)
    : [];

  // Determine file storage locations
  const notionPages: string[] = selected?.notionPages || selected?.docs || [];
  const driveFiles: string[] = selected?.driveFiles || selected?.googleDriveFiles || [];
  const localFiles: string[] = selected?.files || selected?.localFiles || [];

  return (
    <div className="split split-3-9">
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {data.projects.items.map((p: any) => (
          <button
            key={p.id}
            className={cn("list-item", selected?.id === p.id && "list-item-active")}
            onClick={() => { focus("project", p); setActiveTab("overview"); }}
          >
            <span className={cn("status-dot", dotTone(p.status))} />
            <div className="list-item-content">
              <div className="list-item-title">{p.name}</div>
              <div className="list-item-sub">{p.owner} · {p.phase}</div>
            </div>
            <StatusBadge value={p.status} />
          </button>
        ))}
      </div>

      {selected ? (
        <div>
          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className={cn("status-dot", dotTone(selected.status))} />
              <span className="text-lg font-semibold">{selected.name}</span>
              <StatusBadge value={selected.status} />
            </div>
            <div className="text-sm text-2" style={{ lineHeight: 1.6 }}>{selected.description || selected.summary}</div>
          </div>

          {/* Tabs */}
          <div className="segmented" style={{ marginBottom: 16 }}>
            {(["overview","plan","logs","files"] as const).map(t => (
              <button key={t} className={cn("segmented-btn", activeTab === t && "segmented-btn-active")} onClick={() => setActiveTab(t)}>
                {t === "overview" ? "Overview"
                  : t === "plan" ? `30-Day Plan${plan.length ? ` (${plan.filter((d:any)=>d.tasks?.some((tk:any)=>tk.status==="done")).length}/${plan.length})` : ""}`
                  : t === "logs" ? `Logs (${projectLogs.length})` : "Files"}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
                {[
                  { label: "Owner", value: selected.owner },
                  { label: "Priority", value: selected.priority },
                  { label: "Phase", value: selected.phase },
                  { label: "Deadline", value: selected.deadline ? formatDate(selected.deadline) : "—" },
                ].map(f => (
                  <div key={f.label}>
                    <div className="text-xs text-3">{f.label}</div>
                    <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
                  </div>
                ))}
              </div>
              {selected.linkedAgents?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 6 }}>Agents</div>
                  <TagRow values={selected.linkedAgents} />
                </div>
              )}
              {selected.linkedTools?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 6 }}>Tools</div>
                  <TagRow values={selected.linkedTools} />
                </div>
              )}
              {selected.steps?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 8 }}>Steps</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selected.steps.map((step: any, i: number) => (
                      <div key={i} className="row" style={{ gap: 8 }}>
                        <span className={cn("status-dot", step.done ? "dot-online" : step.active ? "dot-active" : "dot-standby")} />
                        <span className="text-sm text-2">{step.label || step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {weeklyGoals.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <div className="text-xs text-3">Weekly Goals</div>
                    <div className="text-xs text-3">Current week: {currentWeek}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                    {weeklyGoals.map((week: any) => (
                      <div
                        key={week.week}
                        style={{
                          border: week.week === currentWeek ? "1px solid var(--accent)" : "1px solid var(--border)",
                          background: week.week === currentWeek ? "rgba(224,53,53,0.06)" : "var(--surface)",
                          borderRadius: "var(--r)",
                          padding: "10px 12px",
                        }}
                      >
                        <div className="row-between" style={{ marginBottom: 6 }}>
                          <span className="text-sm font-medium text-1">Week {week.week}</span>
                          {week.week === currentWeek && <span className="badge badge-accent" style={{ fontSize: 10 }}>Active</span>}
                        </div>
                        <div className="text-xs text-3" style={{ lineHeight: 1.5 }}>{week.theme}</div>
                      </div>
                    ))}
                  </div>
                  {currentWeekGoals?.agentGoals?.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {currentWeekGoals.agentGoals.map((entry: any) => (
                        <div key={entry.agent} style={{ border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "10px 12px", background: "var(--surface)" }}>
                          <div className="row-between" style={{ marginBottom: 6 }}>
                            <span className="text-sm font-medium text-1">{entry.agent}</span>
                            <span className="text-xs text-3">{entry.goals?.length || 0} goals</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {(entry.goals || []).map((goal: string, idx: number) => (
                              <div key={idx} className="row" style={{ gap: 7, alignItems: "flex-start" }}>
                                <span className="status-dot dot-standby" style={{ marginTop: 4, flexShrink: 0 }} />
                                <span className="text-sm text-2" style={{ lineHeight: 1.45 }}>{goal}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {agentExecutionBoard.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 8 }}>Agent Execution Board</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {agentExecutionBoard.map((entry: any) => (
                      <div key={entry.agent} style={{ border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "10px 12px", background: "var(--surface)" }}>
                        <div className="row-between" style={{ marginBottom: 6 }}>
                          <div className="row" style={{ gap: 8 }}>
                            <span className={cn("status-dot", entry.status === "active" ? "dot-active" : entry.status === "done" ? "dot-online" : "dot-standby")} />
                            <span className="text-sm font-medium text-1">{entry.agent}</span>
                          </div>
                          <span className="text-xs text-3">{entry.progress || 0}%</span>
                        </div>
                        <div style={{ width: "100%", height: 4, borderRadius: 999, background: "var(--border)", overflow: "hidden", marginBottom: 8 }}>
                          <div style={{ width: `${entry.progress || 0}%`, height: "100%", background: "var(--accent)" }} />
                        </div>
                        <div className="text-xs text-3" style={{ marginBottom: 4 }}>Working on now</div>
                        <div className="text-sm text-1" style={{ lineHeight: 1.45, marginBottom: 8 }}>{entry.currentWork || "—"}</div>
                        {entry.completedWork?.length > 0 && (
                          <>
                            <div className="text-xs text-3" style={{ marginBottom: 4 }}>Done</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {entry.completedWork.map((item: string, idx: number) => (
                                <div key={idx} className="row" style={{ gap: 7, alignItems: "flex-start" }}>
                                  <span className="status-dot dot-online" style={{ marginTop: 4, flexShrink: 0 }} />
                                  <span className="text-sm text-2" style={{ lineHeight: 1.4 }}>{item}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 20 }}>
                <Btn variant="primary" size="sm" onClick={() => {
                  const threadId = upsertProjectThread({ id: selected.id, name: selected.name, linkedAgents: selected.linkedAgents || [] });
                  sessionStorage.setItem("mc_pending_thread_id", threadId);
                  openRoute?.("/messages");
                }}>
                  Open in Messages
                </Btn>
              </div>
            </>
          )}

          {activeTab === "plan" && (
            <div>
              {/* Header row */}
              <div className="row-between" style={{ marginBottom: 16 }}>
                <div>
                  <span className="text-sm font-semibold">30-Day Execution Plan</span>
                  {currentDayPlan && (
                    <span className="badge badge-accent" style={{ marginLeft: 8 }}>Day {todayDay} Active</span>
                  )}
                </div>
                <div className="row gap-8">
                  {notionResult?.url && (
                    <a href={notionResult.url} target="_blank" rel="noopener noreferrer" className="text-xs text-3" style={{ textDecoration: "underline" }}>
                      {notionResult.created ? "Notion page created ↗" : "Notion updated ↗"}
                    </a>
                  )}
                  <Btn variant="secondary" size="sm" onClick={syncToNotion}>
                    {notionSyncing ? "Syncing…" : "Sync to Notion"}
                  </Btn>
                </div>
              </div>

              {/* Current day highlight */}
              {currentDayPlan && (
                <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: "var(--r-lg)", border: "1px solid var(--accent)", background: "rgba(224,53,53,0.06)" }}>
                  <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <span className="status-dot dot-active" />
                    <span className="text-sm font-semibold">Today · Day {currentDayPlan.day} — {currentDayPlan.theme}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(currentDayPlan.tasks || []).map((task: any) => (
                      <div key={task.id} className="row" style={{ gap: 8 }}>
                        <span className={cn("status-dot", task.status === "done" ? "dot-online" : task.status === "active" ? "dot-active" : "dot-standby")} />
                        <span className="text-sm text-1" style={{ flex: 1 }}>{task.title}</span>
                        <span className="text-xs text-3">{task.agent}</span>
                        <span className="badge" style={{ fontSize: 10 }}>{task.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All days */}
              {plan.length === 0 ? (
                <div className="empty"><span className="empty-text">No 30-day plan found for this project</span></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 520, overflowY: "auto" }}>
                  {plan.map((day: any) => {
                    const done = (day.tasks || []).filter((t: any) => t.status === "done").length;
                    const total = (day.tasks || []).length;
                    const isToday = day.day === todayDay;
                    const collapsed = planCollapsed[day.day] !== false && !isToday;
                    return (
                      <div key={day.day} style={{ border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
                        <button
                          style={{ width: "100%", background: isToday ? "rgba(224,53,53,0.06)" : "var(--surface-raised)", border: 0, padding: "9px 14px", cursor: "pointer", textAlign: "left" }}
                          onClick={() => toggleDay(day.day)}
                        >
                          <div className="row" style={{ gap: 10 }}>
                            <span className="text-xs text-3" style={{ width: 36, flexShrink: 0 }}>Day {day.day}</span>
                            <span className="text-sm text-1" style={{ flex: 1 }}>{day.theme}</span>
                            <span className="text-xs text-3">{done}/{total}</span>
                            <div style={{ width: 48, height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${total ? Math.round((done/total)*100) : 0}%`, background: "var(--accent)" }} />
                            </div>
                            <span className="text-xs text-3">{collapsed ? "▸" : "▾"}</span>
                          </div>
                        </button>
                        {!collapsed && (
                          <div style={{ padding: "8px 14px 12px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 7 }}>
                            {(day.tasks || []).map((task: any) => (
                              <div key={task.id} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                                <span className={cn("status-dot", task.status === "done" ? "dot-online" : task.status === "active" ? "dot-active" : "dot-standby")} style={{ marginTop: 3, flexShrink: 0 }} />
                                <span className="text-sm text-2" style={{ flex: 1 }}>{task.title}</span>
                                <span className="text-xs text-3" style={{ flexShrink: 0 }}>{task.agent}</span>
                                <span className={cn("badge", task.status === "done" ? "badge-green" : task.status === "active" ? "badge-accent" : "")} style={{ fontSize: 10, flexShrink: 0 }}>{task.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "logs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 500, overflowY: "auto" }}>
              {projectLogs.length === 0
                ? <div className="empty"><span className="empty-text">No logs found for this project</span></div>
                : projectLogs.map((e: any) => (
                  <div key={e.id} className="log-row" style={{ display: "grid", gridTemplateColumns: "6px 1fr auto 100px", gap: 10, padding: "8px 0" }}>
                    <span className={cn("status-dot", e.level === "error" ? "dot-error" : e.level === "warning" ? "dot-warning" : "dot-info")} />
                    <span className="text-sm text-1">{e.summary}</span>
                    <span className="text-xs text-3">{e.stream}</span>
                    <span className="text-xs text-3">{formatRelative(e.timestamp)}</span>
                  </div>
                ))
              }
            </div>
          )}

          {activeTab === "files" && (
            <div>
              {notionPages.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 8 }}>
                    Notion Pages <span className="badge badge-purple" style={{ marginLeft: 4 }}>Notion</span>
                  </div>
                  {notionPages.map((p: any, i: number) => (
                    <div key={i} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 14 }}>📄</span>
                      <span className="text-sm text-1">{typeof p === "string" ? p : p.title || p.name}</span>
                      {(p.url || p.id) && <span className="text-xs text-3 mono" style={{ marginLeft: "auto" }}>{p.id || "Notion"}</span>}
                    </div>
                  ))}
                </div>
              )}
              {driveFiles.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 8 }}>
                    Google Drive <span className="badge badge-blue" style={{ marginLeft: 4 }}>Drive</span>
                  </div>
                  {driveFiles.map((f: any, i: number) => (
                    <div key={i} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 14 }}>☁</span>
                      <span className="text-sm text-1">{typeof f === "string" ? f : f.name}</span>
                      <span className="text-xs text-3" style={{ marginLeft: "auto" }}>Google Drive</span>
                    </div>
                  ))}
                </div>
              )}
              {localFiles.length > 0 && (
                <div>
                  <div className="text-xs text-3" style={{ marginBottom: 8 }}>
                    Local Files <span className="badge badge-neutral" style={{ marginLeft: 4 }}>Laptop</span>
                  </div>
                  {localFiles.map((f: any, i: number) => (
                    <div key={i} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ fontSize: 14 }}>💻</span>
                      <span className="text-sm text-1 mono" style={{ fontSize: 12 }}>{typeof f === "string" ? f : f.path || f.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {notionPages.length === 0 && driveFiles.length === 0 && localFiles.length === 0 && (
                <div className="empty"><span className="empty-text">No file references tracked for this project</span></div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a project</span></div>
      )}
    </div>
  );
}

/* ─── Tasks ─── */

export function TasksPage({ data, context, focus, actions }: PageProps) {
  const tasks = data.tasks.tasks;
  const backlog = tasks.filter((t: any) => t.status === "queued");
  const active = tasks.filter((t: any) => t.status === "active");
  const review = tasks.filter((t: any) => t.status === "review" || t.status === "failed");
  const done = tasks.filter((t: any) => t.status === "completed");
  const total = tasks.length;

  const selected = context?.type === "task" ? context.item : null;

  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAgent, setDraftAgent] = useState(data.agents[0]?.id || "");
  const [draftDetail, setDraftDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [approvalReason, setApprovalReason] = useState("");

  const submit = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setSubmitting(true);
    try {
      await actions.createTask({ title, assignedAgentId: draftAgent, detail: draftDetail.trim() });
      setDraftTitle(""); setDraftDetail(""); setComposerOpen(false);
    } finally { setSubmitting(false); }
  };

  const lanes = [
    { id: "backlog",  label: "Backlog",     dot: "var(--text-3)", items: backlog },
    { id: "active",   label: "In Progress", dot: "var(--accent)", items: active },
    { id: "review",   label: "Review",      dot: "var(--yellow)", items: review },
    { id: "done",     label: "Completed",   dot: "var(--green)",  items: done },
  ];

  const statusDot = (s: string) =>
    s === "active" ? "dot-active" : s === "failed" ? "dot-error" : s === "completed" ? "dot-online" : "dot-standby";

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div className="stats-strip" style={{ margin: 0 }}>
          <div className="stat-item"><strong>{active.length}</strong><span>In progress</span></div>
          <div className="stat-item stat-accent"><strong>{backlog.length}</strong><span>Backlog</span></div>
          <div className="stat-item"><strong>{total}</strong><span>Total</span></div>
          <div className="stat-item stat-green"><strong>{Math.round((done.length / Math.max(1, total)) * 100)}%</strong><span>Complete</span></div>
        </div>
        <div className="row gap-8">
          <span className="live-indicator"><span className="live-dot" />Live · auto-refresh 1m</span>
          <Btn variant="primary" size="sm" onClick={() => setComposerOpen(!composerOpen)}>+ New Task</Btn>
        </div>
      </div>

      {composerOpen && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 16, padding: 16, borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, gridColumn: "1/-1" }}>
            <input className="field field-sm" placeholder="Task title…" value={draftTitle} onChange={e => setDraftTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }} />
            <select className="field field-sm" value={draftAgent} onChange={e => setDraftAgent(e.target.value)}>
              {data.agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <input className="field field-sm" placeholder="Details (optional)…" value={draftDetail} onChange={e => setDraftDetail(e.target.value)} style={{ gridColumn: "1/-1" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="primary" size="sm" onClick={submit}>{submitting ? "Creating…" : "Create"}</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setComposerOpen(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Board */}
        <div style={{ flex: "1 1 0", minWidth: 0, overflowX: "auto" }}>
          <div className="board">
            {lanes.map(lane => (
              <div className="lane" key={lane.id}>
                <div className="lane-header">
                  <div className="lane-label">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: lane.dot, display: "inline-block", flexShrink: 0 }} />
                    <span>{lane.label}</span>
                    <span className="lane-count">{lane.items.length}</span>
                  </div>
                </div>
                <div className="lane-stack">
                  {lane.items.length === 0
                    ? <div className="lane-empty">Empty</div>
                    : lane.items.map((t: any) => (
                      <button key={t.id} className={cn("lane-card", selected?.id === t.id && "lane-card-active")} onClick={() => focus("task", t)}>
                        <div className="lane-card-title">
                          <span className={cn("status-dot", statusDot(t.status))} style={{ marginTop: 5, flexShrink: 0 }} />
                          <strong>{t.title}</strong>
                        </div>
                        {t.detail && <p>{t.detail}</p>}
                        <div className="lane-card-meta">
                          <span style={{ background: "var(--accent-faint, rgba(255,255,255,0.08))", width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "var(--text-1)", flexShrink: 0 }}>
                            {(t.assignedAgent || "?").charAt(0)}
                          </span>
                          <span style={{ fontWeight: 500 }}>{t.assignedAgent}</span>
                          <span style={{ marginLeft: "auto" }}>{formatRelative(t.timestamp)}</span>
                        </div>
                      </button>
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task detail panel */}
        {selected && (
          <div style={{ width: 360, flexShrink: 0, background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "16px 18px 20px", display: "flex", flexDirection: "column", gap: 0 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
                <span className={cn("status-dot", statusDot(selected.status))} style={{ marginTop: 5, flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.4 }}>{selected.title}</span>
              </div>
              <button
                style={{ background: "var(--surface-hover, rgba(255,255,255,0.06))", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--text-3)", fontSize: 14, lineHeight: 1, padding: "3px 7px", flexShrink: 0 }}
                onClick={() => focus("task", null)}
                title="Close"
              >×</button>
            </div>

            {/* Status badges */}
            <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
              <StatusBadge value={selected.status} />
              {selected.priority && <StatusBadge value={selected.priority} />}
              {selected.approvalState && selected.approvalState !== "none" && (
                <StatusBadge value={`approval: ${selected.approvalState}`} />
              )}
            </div>

            {/* Description / detail */}
            {(selected.detail || selected.description) && (
              <div style={{ marginBottom: 18 }}>
                <div className="text-xs text-3" style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</div>
                <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.65 }}>{selected.detail || selected.description}</div>
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--border)", marginBottom: 16 }} />

            {/* Meta grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 18 }}>
              {[
                { label: "Assigned Agent", value: selected.assignedAgent },
                { label: "Model", value: selected.model || selected.assignedModel },
                { label: "Created", value: selected.timestamp ? formatStamp(selected.timestamp) : undefined },
                { label: "Started", value: selected.startedAt ? formatStamp(selected.startedAt) : undefined },
                { label: "Completed", value: selected.completedAt ? formatStamp(selected.completedAt) : undefined },
                { label: "Duration", value: selected.durationMs ? `${(selected.durationMs / 1000).toFixed(1)}s` : selected.executionTime ? `${selected.executionTime}` : undefined },
              ].filter(f => f.value).map(f => (
                <div key={f.label}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>{f.value}</div>
                </div>
              ))}
            </div>

            {/* Tools used */}
            {selected.toolsUsed?.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Tools Used</div>
                <TagRow values={selected.toolsUsed} />
              </div>
            )}

            {/* Steps / subtasks */}
            {selected.steps?.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>Steps</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selected.steps.map((step: any, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className={cn("status-dot", step.done ? "dot-online" : step.active ? "dot-active" : "dot-standby")} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "var(--text-2)" }}>{step.label || step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trace entries */}
            {selected.traceEntries?.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>Trace</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 200, overflowY: "auto", borderRadius: "var(--r)", border: "1px solid var(--border)", background: "var(--surface)" }}>
                  {selected.traceEntries.map((e: any, i: number) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto", gap: 10, padding: "8px 12px", borderBottom: i < selected.traceEntries.length - 1 ? "1px solid var(--border)" : undefined }}>
                      <span className={cn("status-dot", e.level === "error" ? "dot-error" : e.level === "warning" ? "dot-warning" : "dot-info")} style={{ marginTop: 3 }} />
                      <span style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>{e.message || e.summary || e.text}</span>
                      <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{e.timestamp ? formatRelative(e.timestamp) : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Output / result */}
            {selected.output && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Output</div>
                <div style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)", background: "var(--surface)", borderRadius: "var(--r)", padding: "10px 12px", lineHeight: 1.6, maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", border: "1px solid var(--border)" }}>
                  {typeof selected.output === "string" ? selected.output : JSON.stringify(selected.output, null, 2)}
                </div>
              </div>
            )}

            {/* Approval actions */}
            {selected.approvalState === "pending" && (
              <div style={{ marginBottom: 18, padding: "14px 16px", borderRadius: "var(--r-md)", border: "1px solid var(--yellow, #eab308)", background: "rgba(234,179,8,0.05)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--yellow, #eab308)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Approval Required</div>
                <input
                  className="field field-sm"
                  placeholder="Reason (optional)…"
                  value={approvalReason}
                  onChange={e => setApprovalReason(e.target.value)}
                  style={{ marginBottom: 10, width: "100%" }}
                />
                <div className="row gap-8">
                  <Btn variant="primary" size="sm" onClick={() => { actions.setTaskApproval(selected.id, "approved", approvalReason); setApprovalReason(""); }}>Approve</Btn>
                  <Btn variant="ghost" size="sm" style={{ color: "var(--red, #ef4444)" }} onClick={() => { actions.setTaskApproval(selected.id, "rejected", approvalReason); setApprovalReason(""); }}>Reject</Btn>
                </div>
              </div>
            )}

            {/* Agent activity log */}
            {(() => {
              const agent = selected.assignedAgent;
              const agentLogs = agent
                ? (data.logs?.events || []).filter((e: any) =>
                    (e.stream && e.stream.toLowerCase().includes(agent.toLowerCase())) ||
                    (e.summary && e.summary.toLowerCase().includes(agent.toLowerCase()))
                  ).slice(0, 12)
                : [];
              if (!agentLogs.length) return null;
              return (
                <div style={{ marginTop: 4 }}>
                  <div style={{ borderTop: "1px solid var(--border)", marginBottom: 14 }} />
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>
                    {agent} Activity
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: "var(--r)", border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
                    {agentLogs.map((e: any, i: number) => (
                      <div key={e.id || i} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto", gap: 10, padding: "8px 12px", borderBottom: i < agentLogs.length - 1 ? "1px solid var(--border)" : undefined, alignItems: "start" }}>
                        <span className={`status-dot ${e.level === "error" ? "dot-error" : e.level === "warning" ? "dot-warning" : "dot-info"}`} style={{ marginTop: 4 }} />
                        <span style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.45 }}>{e.summary || e.detail}</span>
                        <span style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatRelative(e.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Logs — delegated to Memory Console ─── */

export function LogsPage(props: PageProps) {
  return <CortexPage {...props} />;
}

/* ─── Calendar ─── */

const AGENT_CAL_COLORS: Record<string, string> = {
  abdi:     "#74d697",
  ahmed:    "#8bd7ff",
  dame:     "#f0b24c",
  rex:      "#ef4444",
  ayub:     "#a78bfa",
  prime:    "#8b8fff",
  atlas:    "#06b6d4",
  sygma:    "#f9a8d4",
  business: "#fbbf24",
  cron:     "#a1a1aa",
  other:    "#6b7280",
};

function eventColor(ev: any): string {
  if (ev.type === "cron" || /cron|scheduled|recurring/i.test(ev.title || "")) return AGENT_CAL_COLORS.cron;
  if (/business|meeting|call|client/i.test(ev.title || ev.category || "")) return AGENT_CAL_COLORS.business;
  const owner = (ev.owner || ev.assignedAgent || "").toLowerCase();
  for (const [k, v] of Object.entries(AGENT_CAL_COLORS)) {
    if (owner.includes(k)) return v;
  }
  return AGENT_CAL_COLORS.other;
}

export function CalendarPage({ data, context, focus, actions }: PageProps) {
  const events: any[] = data.calendar.events || [];
  const upcoming: any[] = data.calendar.upcoming || [];
  const cronJobs: any[] = (data.crons || data.calendar.crons || []);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", start: "", end: "", owner: "", location: "", type: "meeting", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("all");

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submitEvent = async () => {
    if (!form.title || !form.start) return;
    setSubmitting(true);
    try {
      await actions.calendarCreateEvent({ ...form });
      setForm({ title: "", start: "", end: "", owner: "", location: "", type: "meeting", description: "" });
      setCreating(false);
    } finally { setSubmitting(false); }
  };

  const allItems = [
    ...upcoming.map((e: any) => ({ ...e, _src: "calendar" })),
    ...cronJobs.map((c: any) => ({ id: c.id || `cron-${c.name}`, title: c.name || c.expression, start: c.nextRun || c.next, owner: c.agent || "System", type: "cron", status: c.status || "scheduled", _src: "cron" })),
  ].sort((a, b) => new Date(a.start || 0).getTime() - new Date(b.start || 0).getTime());

  const filtered = filter === "all" ? allItems
    : filter === "cron" ? allItems.filter(e => e._src === "cron" || e.type === "cron")
    : filter === "meeting" ? allItems.filter(e => /meeting|call|standup/i.test(e.type + e.title))
    : filter === "deadline" ? allItems.filter(e => /deadline|due|launch/i.test(e.type + e.title))
    : allItems.filter(e => (e.owner || "").toLowerCase().includes(filter));

  return (
    <div className="split split-7-5">
      <div>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Schedule</span>
          <div className="row gap-8">
            <Btn variant="secondary" size="sm" onClick={() => actions.calendarSyncGoogle()}>Sync</Btn>
            <Btn variant="primary" size="sm" onClick={() => setCreating(!creating)}>+ Event</Btn>
          </div>
        </div>

        {/* Create event form */}
        {creating && (
          <div style={{ marginBottom: 16, padding: 16, borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <span className="text-sm font-semibold">New Event</span>
              <Btn variant="ghost" size="sm" onClick={() => setCreating(false)}>×</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div className="field-label">Title</div>
                <input className="field field-sm" value={form.title} onChange={e => setField("title", e.target.value)} placeholder="Event title…" />
              </div>
              <div>
                <div className="field-label">Type</div>
                <select className="field field-sm" value={form.type} onChange={e => setField("type", e.target.value)}>
                  {["meeting","deadline","call","cron","review","launch","other"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div className="field-label">Start</div>
                <input className="field field-sm" type="datetime-local" value={form.start} onChange={e => setField("start", e.target.value)} />
              </div>
              <div>
                <div className="field-label">End (optional)</div>
                <input className="field field-sm" type="datetime-local" value={form.end} onChange={e => setField("end", e.target.value)} />
              </div>
              <div>
                <div className="field-label">Owner / Agent</div>
                <select className="field field-sm" value={form.owner} onChange={e => setField("owner", e.target.value)}>
                  <option value="">— None —</option>
                  {data.agents.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  <option value="business">Business</option>
                </select>
              </div>
              <div>
                <div className="field-label">Location</div>
                <input className="field field-sm" value={form.location} onChange={e => setField("location", e.target.value)} placeholder="Zoom / Office / —" />
              </div>
            </div>
            <input className="field field-sm" value={form.description} onChange={e => setField("description", e.target.value)} placeholder="Description (optional)" style={{ marginBottom: 10, display: "block", width: "100%" }} />
            <Btn variant="primary" size="sm" onClick={submitEvent}>{submitting ? "Creating…" : "Create Event"}</Btn>
          </div>
        )}

        {/* Filter chips */}
        <div className="cal-filter-row" style={{ marginBottom: 12 }}>
          {["all", "cron", "meeting", "deadline", ...data.agents.slice(0, 5).map((a: any) => a.name.toLowerCase())].map(f => (
            <button key={f} className={cn("cal-chip", filter === f && "cal-chip-active")} onClick={() => setFilter(f)}
              style={filter === f && AGENT_CAL_COLORS[f] ? { borderColor: AGENT_CAL_COLORS[f], color: AGENT_CAL_COLORS[f] } : {}}>
              {f}
            </button>
          ))}
        </div>

        {/* Agenda */}
        <div className="agenda-list">
          {filtered.slice(0, 30).map((ev: any) => {
            const color = eventColor(ev);
            return (
              <button key={ev.id} className="agenda-item" onClick={() => focus("calendar-event", ev)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                  <span className="agenda-time">{ev.start ? formatTime(ev.start) : "—"}</span>
                </div>
                <div>
                  <div className="agenda-title">{ev.title}</div>
                  <div className="agenda-sub">
                    {ev.owner && <span style={{ color }}>{ev.owner}</span>}
                    {ev.location ? ` · ${ev.location}` : ""}
                    {ev._src === "cron" ? " · cron" : ""}
                  </div>
                </div>
                <StatusBadge value={ev.status || ev.type || "scheduled"} />
              </button>
            );
          })}
          {filtered.length === 0 && <div className="empty"><span className="empty-text">No events</span></div>}
        </div>

        {/* Cron jobs section */}
        {cronJobs.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="section-header" style={{ marginBottom: 8 }}>
              <span className="section-title">Cron Jobs</span>
              <span className="text-xs text-3">{cronJobs.length} scheduled</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {cronJobs.map((c: any, i: number) => (
                <div key={i} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div className="text-sm text-1">{c.name || c.expression}</div>
                    <div className="text-xs text-3 mono">{c.expression || c.schedule}</div>
                  </div>
                  <div className="row gap-8">
                    {c.agent && <span className="text-xs" style={{ color: AGENT_CAL_COLORS[c.agent?.toLowerCase()] || "var(--text-3)" }}>{c.agent}</span>}
                    <StatusBadge value={c.status || "scheduled"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Month grid */}
      <div>
        <div className="section-header" style={{ marginBottom: 16 }}>
          <span className="section-title">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date())}</span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {Object.entries(AGENT_CAL_COLORS).slice(0, 9).map(([k, v]) => (
            <div key={k} className="row gap-4">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: v, display: "inline-block" }} />
              <span className="text-xs text-3">{k}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
          {["M","T","W","T","F","S","S"].map((d, i) => (
            <div key={i} className="text-xs text-3" style={{ textAlign: "center", padding: "4px 0" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
          {monthCells(events).map(cell => (
            <div key={cell.key} style={{
              padding: "6px 4px", borderRadius: "var(--r-sm)",
              background: cell.today ? "var(--accent-muted)" : "transparent",
              border: cell.today ? "1px solid var(--accent)" : "1px solid transparent",
              textAlign: "center", minHeight: 44,
            }}>
              <div className={cn("text-sm", !cell.currentMonth && "text-3", cell.today && "font-semibold text-1")}>{cell.label}</div>
              {cell.events.length > 0 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 3, flexWrap: "wrap" }}>
                  {cell.events.slice(0, 4).map((ev: any, i: number) => (
                    <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: eventColor(ev), display: "inline-block" }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Notes ─── */

export function NotesPage({ data, context, focus, actions }: PageProps) {
  const notes = data.notes?.items || [];
  const selected = context?.type === "note" ? context.item : notes[0];
  const [body, setBody] = useState(selected?.body || "");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFolder, setNewFolder] = useState("General");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setBody(selected?.body || ""); }, [selected?.id]);

  const createNote = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      await actions.createNote(title, "", newFolder);
      setNewTitle(""); setCreating(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="notes-layout">
      <div className="notes-sidebar">
        <div className="section-header" style={{ marginBottom: 8 }}>
          <span className="section-title">Notes</span>
          <Btn variant="primary" size="sm" onClick={() => setCreating(!creating)}>+</Btn>
        </div>

        {creating && (
          <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <input className="field field-sm" placeholder="Note title…" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createNote(); }} autoFocus />
            <input className="field field-sm" placeholder="Folder (General)" value={newFolder} onChange={e => setNewFolder(e.target.value)} />
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="primary" size="sm" onClick={createNote}>{saving ? "…" : "Create"}</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Btn>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {notes.map((note: any) => (
            <button
              key={note.id}
              className={cn("list-item", selected?.id === note.id && "list-item-active")}
              onClick={() => { focus("note", note); setBody(note.body || ""); }}
            >
              <div className="list-item-content">
                <div className="list-item-title">{note.title}</div>
                <div className="list-item-sub">{note.folder} · {formatRelative(note.updatedAt)}</div>
              </div>
              {note.pinned && <span className="text-xs text-accent">●</span>}
            </button>
          ))}
          {notes.length === 0 && <div className="empty"><span className="empty-text">No notes yet</span></div>}
        </div>
      </div>

      {selected ? (
        <div className="notes-editor">
          <div className="row-between" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <div>
              <div className="text-md font-semibold">{selected.title}</div>
              <div className="text-xs text-3">{selected.folder} · {selected.project}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="secondary" size="sm" onClick={() => actions.pinNote(selected.id, !selected.pinned)}>
                {selected.pinned ? "Unpin" : "Pin"}
              </Btn>
              <Btn variant="primary" size="sm" onClick={() => actions.saveNote(selected.id, body)}>Save</Btn>
            </div>
          </div>
          <textarea className="notes-editor-area" value={body} onChange={e => setBody(e.target.value)} placeholder="Write here…" />
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a note or create one</span></div>
      )}
    </div>
  );
}

/* ─── Approvals ─── */

export function ApprovalsPage({ data, context, focus, actions }: PageProps) {
  const pending = (data.tasks.approvals || data.tasks.tasks.filter((t: any) => t.status === "queued" || t.status === "active")).slice(0, 20);
  const transportAlerts = Object.entries(data.mcp.transportState || {}).filter(([, v]) => String(v).toLowerCase() !== "online");

  return (
    <div>
      {transportAlerts.length > 0 && (
        <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: "var(--r-lg)", border: "1px solid rgba(234,179,8,0.3)", background: "var(--yellow-muted)" }}>
          <div className="text-sm font-semibold" style={{ marginBottom: 4, color: "var(--yellow)" }}>Transport Alerts</div>
          {transportAlerts.map(([transport, state]) => (
            <div key={transport} className="text-sm text-2">{transport} transport is {String(state)}</div>
          ))}
        </div>
      )}

      <div className="split split-7-5">
        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Pending Approvals</span>
            <span className="text-xs text-3">{pending.length} items</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {pending.map((task: any) => (
              <div key={task.id} className="list-item" style={{ flexDirection: "column", alignItems: "flex-start", padding: "12px 12px", gap: 8 }}>
                <div className="row-between" style={{ width: "100%" }}>
                  <div className="row">
                    <span className={cn("status-dot", dotTone(task.status))} />
                    <span className="list-item-title">{task.title}</span>
                  </div>
                  <StatusBadge value={task.status} />
                </div>
                <div className="list-item-sub">{task.assignedAgent} · {formatRelative(task.timestamp)}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="primary" size="sm" onClick={() => actions.setTaskApproval(task.id, "approved")}>Approve</Btn>
                  <Btn variant="danger" size="sm" onClick={() => actions.setTaskApproval(task.id, "rejected")}>Reject</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => focus("task", task)}>Inspect</Btn>
                </div>
              </div>
            ))}
            {pending.length === 0 && <div className="empty"><span className="empty-text">No items pending approval</span></div>}
          </div>
        </div>

        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">System Status</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[
              { label: "Active tasks", value: String(data.summary.activeTasks) },
              { label: "Queued tasks", value: String(data.summary.queuedTasks) },
              { label: "Agents online", value: String(data.summary.agentsOnline) },
              { label: "Alerts", value: String(data.summary.alerts) },
            ].map(row => (
              <div key={row.label} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="text-sm text-2">{row.label}</span>
                <span className="text-sm font-medium text-1">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Integrations ─── */

export function IntegrationsPage({ data, context, focus, actions }: PageProps) {
  const selected = context?.type === "integration" ? context.item : data.integrations.integrations[0];

  return (
    <div className="split split-7-5">
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {data.integrations.integrations.map((int: any) => (
            <button
              key={int.id}
              className={cn("list-item", selected?.id === int.id && "list-item-active")}
              onClick={() => focus("integration", int)}
            >
              <span className={cn("status-dot", dotTone(int.state))} />
              <div className="list-item-content">
                <div className="list-item-title">{int.name}</div>
                <div className="list-item-sub">{int.category} · {int.endpoint}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusBadge value={int.credentialState} />
                <StatusBadge value={int.state} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className={cn("status-dot", dotTone(selected.state))} />
              <span className="text-md font-semibold">{selected.name}</span>
              <StatusBadge value={selected.state} />
            </div>
            <div className="text-sm text-3">{selected.category}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {[
              { label: "Endpoint", value: selected.endpoint },
              { label: "Credentials", value: selected.credentialState },
              { label: "System", value: selected.owningSystem },
            ].map(f => (
              <div key={f.label} className="row-between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs text-3">{f.label}</span>
                <span className="text-sm text-1 mono">{f.value}</span>
              </div>
            ))}
          </div>

          {selected.dependencies?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Dependencies</div>
              <TagRow values={selected.dependencies} />
            </div>
          )}

          <Btn variant="primary" size="sm" onClick={() => actions.testIntegration(selected.id)}>Test Connection</Btn>
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select an integration</span></div>
      )}
    </div>
  );
}

/* ─── Settings ─── */

export function SettingsPage({ data, context, focus }: PageProps) {
  const sections = data.settings.sections;
  const selected = context?.type === "setting-section" ? context.item : sections[0];

  return (
    <div className="split split-3-9">
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {sections.map((s: any) => (
          <button
            key={s.id}
            className={cn("list-item", selected?.id === s.id && "list-item-active")}
            onClick={() => focus("setting-section", s)}
          >
            <div className="list-item-content">
              <div className="list-item-title">{s.title}</div>
              <div className="list-item-sub">{s.description}</div>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="text-lg font-semibold" style={{ marginBottom: 4 }}>{selected.title}</div>
            <div className="text-sm text-3">{selected.description}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {selected.items.map((item: any) => (
              <div key={item.label} className="row-between" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div className="text-sm font-medium text-1">{item.label}</div>
                  {item.description && <div className="text-xs text-3 mt-4">{item.description}</div>}
                </div>
                <div className="text-sm text-2 mono">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a section</span></div>
      )}
    </div>
  );
}
