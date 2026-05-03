import { useEffect, useMemo, useState } from "react";
import { ActionButton, Btn, StatusBadge, StatusDot, TagRow } from "./shell";
import { cn, dayKey, formatDate, formatRelative, formatStamp, formatTime, monthCells, dotTone, type PageProps } from "./types";
import { AGENT_COLORS as _AGENT_COLORS } from "./agent-constants";
import { CortexPage } from "./pages-cortex";

/* ─── Projects ─── */

export function ProjectsPage({ data, context, focus, openRoute, actions }: PageProps) {
  const selected = context?.type === "project" ? context.item : data.projects.items[0];
  const [activeTab, setActiveTab] = useState<"overview" | "plan" | "activity" | "assets">("overview");
  const [planCollapsed, setPlanCollapsed] = useState<Record<number, boolean>>({});
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionResult, setNotionResult] = useState<{url?: string; created?: boolean} | null>(null);

  const todayDay = 1;
  const plan: any[] = selected?.thirtyDayPlan || [];
  const currentDayPlan = plan.find((d: any) => d.day === todayDay);

  const syncToNotion = async () => {
    setNotionSyncing(true);
    setNotionResult(null);
    try {
      const result = await actions?.notionOperatorSync(selected?.id || "zero-budget-marketing-engine");
      setNotionResult(result);
    } catch { /* handled by pushEvent */ }
    finally { setNotionSyncing(false); }
  };

  const toggleDay = (day: number) =>
    setPlanCollapsed((prev) => ({ ...prev, [day]: !prev[day] }));

  const portfolio = useMemo(() => {
    const items = data.projects.items || [];
    const active = items.filter((item: any) => ["active", "live", "monitored", "aligned"].includes(String(item.status || "").toLowerCase())).length;
    const completed = items.filter((item: any) => (item.progress || 0) >= 100 || String(item.status || "").toLowerCase() === "completed").length;
    const avgHealth = items.length ? Math.round(items.reduce((sum: number, item: any) => sum + (item.health || 0), 0) / items.length) : 0;
    return { total: items.length, active, completed, avgHealth };
  }, [data.projects.items]);

  const projectLogs = selected
    ? (data.logs?.events || []).filter((event: any) =>
        (event.stream && selected.linkedAgents?.some((agent: string) => event.stream?.toLowerCase().includes(agent.toLowerCase()))) ||
        (event.summary && event.summary.toLowerCase().includes((selected.name || "").toLowerCase().split(" ")[0].toLowerCase()))
      ).slice(0, 16)
    : [];

  const checklist = Array.isArray(selected?.checklist) ? selected.checklist : [];
  const linksList = Array.isArray(selected?.linksList) ? selected.linksList : [];
  const timeline = Array.isArray(selected?.timeline) ? selected.timeline : [];
  const notionPages = Array.isArray(selected?.notionPages) ? selected.notionPages : [];
  const driveFiles = Array.isArray(selected?.driveFiles) ? selected.driveFiles : [];
  const localFiles = Array.isArray(selected?.localFiles) ? selected.localFiles : [];

  const openHref = (href?: string) => {
    if (!href) return;
    if (href.startsWith("/")) {
      openRoute(href);
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ padding: 18, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.018))", boxShadow: "0 18px 48px rgba(0,0,0,0.22)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 8 }}>Project Portfolio</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", lineHeight: 1.15, marginBottom: 8 }}>Command surface for every major Task Enterprise build.</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>Open a project to get its execution state, links, files, ownership, and the current operating trail around it.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            {[
              { label: "Tracked", value: portfolio.total },
              { label: "Active", value: portfolio.active },
              { label: "Closed", value: portfolio.completed },
              { label: "Health", value: `${portfolio.avgHealth}%` },
            ].map((metric) => (
              <div key={metric.label} style={{ padding: "12px 14px", borderRadius: "var(--r-lg)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>{metric.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)" }}>{metric.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: 12, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)", display: "flex", flexDirection: "column", gap: 8 }}>
          {data.projects.items.map((project: any) => (
            <button
              key={project.id}
              onClick={() => { focus("project", project); setActiveTab("overview"); }}
              style={{
                textAlign: "left",
                padding: "14px 14px 13px",
                borderRadius: "var(--r-lg)",
                border: selected?.id === project.id ? "1px solid rgba(224,53,53,0.5)" : "1px solid rgba(255,255,255,0.06)",
                background: selected?.id === project.id ? "linear-gradient(180deg, rgba(224,53,53,0.12), rgba(224,53,53,0.04))" : "rgba(255,255,255,0.02)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className={cn("status-dot", dotTone(project.status))} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                <StatusBadge value={project.status} />
              </div>
              <div style={{ fontSize: 11, color: "var(--accent-text)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>{project.category || "System"} · {project.phase}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55, marginBottom: 10 }}>{project.summary}</div>
              <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(6, project.progress || 0)}%`, height: "100%", background: "linear-gradient(90deg, rgba(224,53,53,0.85), rgba(251,197,99,0.8))" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>
                <span>{project.owner}</span>
                <span>{project.lastUpdated ? formatRelative(project.lastUpdated) : formatRelative(project.deadline)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ padding: 22, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.018))", boxShadow: "0 20px 52px rgba(0,0,0,0.24)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 18 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span className={cn("status-dot", dotTone(selected.status))} />
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--accent-text)" }}>{selected.category || "Project"}</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "var(--text-1)", lineHeight: 1.08, marginBottom: 8 }}>{selected.name}</div>
                <div style={{ fontSize: 14, color: "var(--text-3)", lineHeight: 1.7 }}>{selected.description || selected.summary}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                <StatusBadge value={selected.status} />
                <StatusBadge value={selected.phase} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 12 }}>
              {[
                { label: "Owner", value: selected.owner, span: 1 },
                { label: "Client", value: selected.client || "Task Enterprise LLC", span: 2 },
                { label: "Progress", value: `${selected.progress || 0}%`, span: 1 },
                { label: "Health", value: `${selected.health || 0}%`, span: 1 },
                { label: "Updated By", value: selected.registryUpdatedBy || selected.owner, span: 1 },
                { label: "Target", value: selected.deadline ? formatDate(selected.deadline) : "Open", span: 1 },
              ].map((metric) => (
                <div key={metric.label} style={{ padding: "14px 14px 12px", borderRadius: "var(--r-lg)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.055)", minWidth: 0, overflow: "hidden", gridColumn: `span ${metric.span}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>{metric.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.45, whiteSpace: "normal", overflowWrap: "normal", wordBreak: "normal", hyphens: "none" }}>{metric.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              {linksList.slice(0, 6).map((link: any) => (
                <button key={link.id} onClick={() => openHref(link.href)} style={{ padding: "10px 14px", borderRadius: "var(--r-lg)", border: link.primary ? "1px solid rgba(224,53,53,0.45)" : "1px solid rgba(255,255,255,0.08)", background: link.primary ? "rgba(224,53,53,0.12)" : "rgba(255,255,255,0.025)", color: "var(--text-1)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          <div className="segmented" style={{ width: "fit-content" }}>
            {(["overview", "plan", "activity", "assets"] as const).map((tab) => (
              <button key={tab} className={cn("segmented-btn", activeTab === tab && "segmented-btn-active")} onClick={() => setActiveTab(tab)}>
                {tab === "overview" ? "Overview"
                  : tab === "plan" ? `30-Day Plan${plan.length ? ` (${plan.filter((d:any)=>d.tasks?.some((t:any)=>t.status==="done")).length}/${plan.length})` : ""}`
                  : tab === "activity" ? `Activity (${projectLogs.length})` : "Assets"}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
              <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 8 }}>Execution Board</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-1)", marginBottom: 14 }}>Workstream and current delivery state</div>
                {checklist.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {checklist.map((item: any) => (
                      <div key={item.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", gap: 12, alignItems: "start", padding: "12px 14px", borderRadius: "var(--r-lg)", background: item.done ? "rgba(31,85,53,0.15)" : "rgba(255,255,255,0.025)", border: item.done ? "1px solid rgba(80,200,120,0.12)" : "1px solid rgba(255,255,255,0.05)" }}>
                        <span className={cn("status-dot", item.done ? "dot-online" : item.status === "in-progress" ? "dot-active" : "dot-warning")} style={{ marginTop: 4 }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>{item.title}</div>
                          {item.note && <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>{item.note}</div>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <StatusBadge value={item.done ? "completed" : item.status || "queued"} />
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{item.agent}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty"><span className="empty-text">No tracked execution items for this project yet.</span></div>
                )}
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Linked Agents</div>
                  <TagRow values={selected.linkedAgents || []} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Linked Tools</div>
                  <TagRow values={selected.linkedTools || []} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 8 }}>Command Summary</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: "var(--text-1)", lineHeight: 1.3, marginBottom: 8 }}>{selected.recentUpdate}</div>
                  <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.65 }}>{selected.summary}</div>
                </div>
                <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 8 }}>Timeline</div>
                  {timeline.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {timeline.map((entry: any, index: number) => (
                        <div key={`${entry.label}-${index}`} style={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr)", gap: 10 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <span className="status-dot dot-active" />
                            {index < timeline.length - 1 && <span style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{entry.label}</div>
                            <div style={{ fontSize: 11, color: "var(--text-3)", margin: "2px 0 4px" }}>{formatStamp(entry.at)}</div>
                            {entry.detail && <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>{entry.detail}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty"><span className="empty-text">Timeline is not populated yet.</span></div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "plan" && (
            <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 6 }}>30-Day Execution Plan</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)" }}>Zero Budget Marketing Engine</div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {notionResult?.url && (
                    <a href={notionResult.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent-text)", textDecoration: "underline" }}>
                      {notionResult.created ? "Notion page created ↗" : "Notion updated ↗"}
                    </a>
                  )}
                  <Btn variant="secondary" size="sm" onClick={syncToNotion}>
                    {notionSyncing ? "Syncing…" : "Sync to Notion"}
                  </Btn>
                </div>
              </div>

              {currentDayPlan && (
                <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: "var(--r-lg)", border: "1px solid rgba(224,53,53,0.4)", background: "rgba(224,53,53,0.07)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span className="status-dot dot-active" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Today · Day {currentDayPlan.day} — {currentDayPlan.theme}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(currentDayPlan.tasks || []).map((task: any) => (
                      <div key={task.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center" }}>
                        <span className={cn("status-dot", task.status === "done" ? "dot-online" : task.status === "active" ? "dot-active" : "dot-standby")} />
                        <span style={{ fontSize: 13, color: "var(--text-1)" }}>{task.title}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{task.agent}</span>
                        <StatusBadge value={task.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {plan.length === 0 ? (
                <div className="empty"><span className="empty-text">No 30-day plan found for this project.</span></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 540, overflowY: "auto" }}>
                  {plan.map((day: any) => {
                    const done = (day.tasks || []).filter((t: any) => t.status === "done").length;
                    const total = (day.tasks || []).length;
                    const isToday = day.day === todayDay;
                    const collapsed = planCollapsed[day.day] !== false && !isToday;
                    return (
                      <div key={day.day} style={{ borderRadius: "var(--r-lg)", border: isToday ? "1px solid rgba(224,53,53,0.35)" : "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <button
                          style={{ width: "100%", background: isToday ? "rgba(224,53,53,0.08)" : "rgba(255,255,255,0.025)", border: 0, padding: "10px 16px", cursor: "pointer", textAlign: "left" }}
                          onClick={() => toggleDay(day.day)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", width: 42, flexShrink: 0 }}>Day {day.day}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>{day.theme}</span>
                            <span style={{ fontSize: 11, color: "var(--text-3)", marginRight: 8 }}>{done}/{total}</span>
                            <div style={{ width: 60, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${total ? Math.round((done/total)*100) : 0}%`, background: "var(--accent)" }} />
                            </div>
                            <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 4 }}>{collapsed ? "▸" : "▾"}</span>
                          </div>
                        </button>
                        {!collapsed && (
                          <div style={{ padding: "10px 16px 14px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 9 }}>
                            {(day.tasks || []).map((task: any) => (
                              <div key={task.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "flex-start" }}>
                                <span className={cn("status-dot", task.status === "done" ? "dot-online" : task.status === "active" ? "dot-active" : "dot-standby")} style={{ marginTop: 3 }} />
                                <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.45 }}>{task.title}</span>
                                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{task.agent}</span>
                                <StatusBadge value={task.status} />
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

          {activeTab === "activity" && (
            <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 12 }}>Project Activity</div>
              {projectLogs.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {projectLogs.map((event: any) => (
                    <div key={event.id} style={{ display: "grid", gridTemplateColumns: "10px minmax(0, 1fr) auto", gap: 12, alignItems: "start", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <span className={cn("status-dot", event.level === "error" ? "dot-error" : event.level === "warning" ? "dot-warning" : "dot-info")} style={{ marginTop: 5 }} />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>{event.summary}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{event.stream}</div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{formatRelative(event.timestamp)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty"><span className="empty-text">No live activity is attached to this project yet.</span></div>
              )}
            </div>
          )}

          {activeTab === "assets" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 12 }}>Live Links</div>
                {linksList.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {linksList.map((link: any) => (
                      <button key={link.id} onClick={() => openHref(link.href)} style={{ textAlign: "left", padding: "12px 14px", borderRadius: "var(--r-lg)", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.025)", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{link.label}</div>
                          <StatusBadge value={link.type || "web"} />
                        </div>
                        {link.description && <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>{link.description}</div>}
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.href}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty"><span className="empty-text">No tracked links for this project yet.</span></div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 10 }}>Artifact Index</div>
                  {selected.artifacts?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {selected.artifacts.map((artifact: any) => (
                        <button key={artifact.id} onClick={() => openHref(artifact.href)} style={{ textAlign: "left", padding: "12px 14px", borderRadius: "var(--r-lg)", border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.025)", cursor: "pointer" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{artifact.title}</div>
                            <div style={{ fontSize: 11, color: "var(--text-3)" }}>{artifact.kind}</div>
                          </div>
                          {artifact.description && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{artifact.description}</div>}
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>{formatRelative(artifact.updatedAt)}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty"><span className="empty-text">No artifacts indexed yet.</span></div>
                  )}
                </div>
                <div style={{ padding: 20, borderRadius: "var(--r-xl)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-text)", marginBottom: 10 }}>File Surfaces</div>
                  {[...notionPages, ...driveFiles, ...localFiles].length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[...notionPages, ...driveFiles, ...localFiles].map((item: any, index: number) => (
                        <div key={index} style={{ padding: "10px 12px", borderRadius: "var(--r-lg)", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{item.label || item.title || item.name || "File Reference"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, wordBreak: "break-word" }}>{item.path || item.href || item.url || item.id || item}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty"><span className="empty-text">No file references tracked for this project yet.</span></div>
                  )}
                </div>
              </div>
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

/* ─── Voice Conversation Logs (localStorage mirror) ─── */

interface VoiceConvLog {
  id: string; agentId: string; agentName: string;
  startTime: string; lastUpdated: string;
  messages: Array<{ id: string; role: "user" | "agent"; text: string; ts: string }>;
  savedForever: boolean;
}

const VOICE_LOGS_KEY = "vc_logs_v1";
const VOICE_LOG_TTL_MS = 7 * 24 * 3600_000;

function loadVoiceLogs(): VoiceConvLog[] {
  try { return JSON.parse(localStorage.getItem(VOICE_LOGS_KEY) || "[]"); }
  catch { return []; }
}

function saveVoiceLogs(logs: VoiceConvLog[]) {
  const cutoff = Date.now() - VOICE_LOG_TTL_MS;
  localStorage.setItem(VOICE_LOGS_KEY, JSON.stringify(
    logs.filter(l => l.savedForever || new Date(l.lastUpdated).getTime() > cutoff)
  ));
}

/* ─── Logs ─── */

export function LogsPage(props: PageProps) {
  return <CortexPage {...props} />;
}


/* ─── Calendar ─── */

const AGENT_CAL_COLORS: Record<string, string> = {
  ..._AGENT_COLORS,
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
