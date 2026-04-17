import { useState, useDeferredValue, useMemo, useEffect, useRef, useCallback } from "react";
import { ActionButton, Btn, MetricCard, StatusBadge, StatusDot, TagRow } from "./shell";
import { cn, dotTone, formatRelative, formatStamp, type PageProps } from "./types";

const AGENT_TONES: Record<string, string> = {
  TASK: "tone-task", Abdi: "tone-abdi", Ahmed: "tone-ahmed", Dame: "tone-dame",
  Rex: "tone-rex", Prime: "tone-prime", Atlas: "tone-atlas", Ayub: "tone-ayub", Sygma: "tone-sygma",
};

/* ─── Home ─── */

function ProjectRing({ pct }: { pct: number }) {
  const r = 26, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="64" height="64" style={{ flexShrink: 0 }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="5"
        strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
        strokeLinecap="round" />
      <text x="32" y="36" textAnchor="middle" fill="var(--text-1)" fontSize="11" fontWeight="600">{pct}%</text>
    </svg>
  );
}

export function HomePage({ data, focus, openRoute }: PageProps) {
  const tasks: any[] = data.tasks?.tasks || [];
  const projects: any[] = data.projects?.items || [];
  const primaryProject = projects[0];

  // Completion stats for primary project
  const primaryTasks = tasks.filter((t: any) =>
    primaryProject?.linkedAgents?.some((a: string) => (t.assignedAgent || "").toLowerCase() === a.toLowerCase())
    || (t.project && t.project === primaryProject?.name)
  );
  const donePrimary = primaryTasks.filter((t: any) => t.status === "completed").length;
  const totalPrimary = Math.max(primaryTasks.length, 1);
  const primaryPct = primaryProject?.progress ?? Math.round((donePrimary / totalPrimary) * 100);

  // Agent workload: tasks per agent
  const agentTaskMap: Record<string, any[]> = {};
  for (const t of tasks) {
    const a = t.assignedAgent || t.owner;
    if (a) { agentTaskMap[a] = agentTaskMap[a] || []; agentTaskMap[a].push(t); }
  }

  // Checklist = tasks in review/completed recently
  const checklist = [...tasks]
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6);

  const statusColor = (s: string) => {
    if (!s) return "var(--text-3)";
    s = s.toLowerCase();
    if (s === "active" || s === "live" || s === "aligned") return "#22c55e";
    if (s === "queued" || s === "pending") return "var(--text-3)";
    if (s === "monitored") return "#f59e0b";
    return "var(--text-3)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "4px 0" }}>

      {/* Primary project status card */}
      {primaryProject && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 700, marginBottom: 10 }}>
            Project Status
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2, marginBottom: 4 }}>{primaryProject.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                Task Enterprise LLC · {primaryProject.phase || primaryProject.status}
              </div>
            </div>
            <span style={{ background: statusColor(primaryProject.status), color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4, letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0, marginTop: 4 }}>
              {primaryProject.status}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${primaryPct}%`, background: "var(--accent)", borderRadius: 3, transition: "width 0.4s ease" }} />
          </div>
          {/* Stat row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {[
              { label: "Completion", value: `${primaryPct}%` },
              { label: "Done", value: `${donePrimary}/${totalPrimary}` },
              { label: "Deadline", value: primaryProject.deadline ? new Date(primaryProject.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—" },
              { label: "Owner", value: primaryProject.owner || "—" },
              { label: "Agents", value: (primaryProject.linkedAgents || []).length.toString() },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "var(--r)", padding: "8px 10px" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects section */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 10 }}>
          Projects
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {projects.map((p: any) => {
            const pAgentTasks = Object.entries(agentTaskMap)
              .filter(([a]) => (p.linkedAgents || []).some((la: string) => la.toLowerCase() === a.toLowerCase()))
              .map(([a, ts]) => ({ agent: a, count: (ts as any[]).filter((t: any) => t.status !== "completed").length }))
              .filter(x => x.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, 3);
            const pPct = p.progress ?? 0;
            return (
              <button key={p.id} className="home-project-card" onClick={() => { focus("project", p); openRoute("/projects"); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <ProjectRing pct={pPct} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{p.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: statusColor(p.status), color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
                      Task Enterprise LLC · {p.phase || p.priority}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pPct}%`, background: "var(--accent)", borderRadius: 2 }} />
                    </div>
                    {/* Agent workload chips */}
                    {pAgentTasks.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Remaining Work by Agent</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {pAgentTasks.map(x => (
                            <span key={x.agent} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", fontSize: 11 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                              <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{x.agent}</span>
                              <span style={{ color: "var(--text-3)" }}>{x.count} task{x.count !== 1 ? "s" : ""}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Checklist */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 600, marginBottom: 10 }}>
          Checklist
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
          {checklist.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-3)" }}>No tasks yet.</div>
          ) : checklist.map((t: any, i: number) => (
            <button
              key={t.id}
              onClick={() => focus("task", t)}
              style={{ display: "grid", gridTemplateColumns: "6px 1fr auto", gap: 10, padding: "9px 14px", background: "var(--surface)", borderBottom: i < checklist.length - 1 ? "1px solid var(--border)" : "none", textAlign: "left", cursor: "pointer" }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.status === "active" ? "var(--accent)" : t.status === "completed" ? "#22c55e" : "var(--text-3)", marginTop: 5, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)", marginBottom: 2 }}>{t.title}</div>
                {t.detail && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{t.detail}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-2)" }}>{t.assignedAgent || t.owner}</span>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>{formatRelative(t.timestamp)}</span>
              </div>
            </button>
          ))}
        </div>
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

export function AgentsPage({ data, context, focus, openRoute, actions }: PageProps) {
  const selected = context?.type === "agent" ? context.item : data.agents[0];

  return (
    <div className="split split-8-4">
      {/* List */}
      <div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {data.agents.map((agent: any) => (
            <button
              key={agent.id}
              className={cn("list-item", selected?.id === agent.id && "list-item-active")}
              onClick={() => focus("agent", agent)}
            >
              <span className={cn("status-dot", dotTone(agent.status))} />
              <div className="list-item-content">
                <div className="list-item-title">{agent.name}</div>
                <div className="list-item-sub">{agent.role}</div>
              </div>
              <div className="list-item-right">
                <span className="text-xs text-3 truncate" style={{ maxWidth: 140 }}>{agent.currentModel}</span>
                <StatusBadge value={agent.status} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className={cn("status-dot", dotTone(selected.status))} />
              <span className="text-md font-semibold">{selected.name}</span>
              <StatusBadge value={selected.status} />
            </div>
            <div className="text-sm text-2">{selected.role}</div>
            <div className="text-sm text-3 mt-4">{selected.specialty || selected.currentTask}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Primary Model", value: selected.currentModel },
              { label: "Fallback", value: selected.backupModel },
              { label: "Uptime", value: selected.uptime },
              { label: "Health", value: `${selected.healthScore || 0}%` },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-3">{f.label}</div>
                <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="text-xs text-3" style={{ marginBottom: 6 }}>Tools</div>
            <TagRow values={selected.toolAccess || []} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="text-xs text-3" style={{ marginBottom: 4 }}>Current task</div>
            <div className="text-sm text-2">{selected.latestTask || selected.currentTask || "—"}</div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="primary" size="sm" onClick={() => actions.connectVoiceAgent(selected.id)}>Open Voice</Btn>
            <Btn variant="secondary" size="sm" onClick={() => actions.restartAgent(selected.id)}>Restart</Btn>
            <Btn variant="secondary" size="sm" onClick={() => openRoute("/logs")}>View Logs</Btn>
          </div>

          {/* Model assignment */}
          <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Assign Model</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                className="field field-sm"
                defaultValue={selected.currentModel}
                onChange={e => actions.assignPrimaryModel(selected.id, e.target.value)}
              >
                {data.models.catalog.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <span className="text-xs text-3" style={{ alignSelf: "center" }}>Primary</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="field field-sm"
                defaultValue={selected.backupModel}
                onChange={e => actions.assignFallbackModel(selected.id, e.target.value)}
              >
                {data.models.catalog.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <span className="text-xs text-3" style={{ alignSelf: "center" }}>Fallback</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select an agent</span></div>
      )}
    </div>
  );
}

/* ─── Voice ─── */

const AGENT_VOICE_IDS: Record<string, string> = {
  abdi:  "29vD33N1CtxCmqQRPOHJ",
  ahmed: "eRcsJdPMOM0mtGC03ul7",
  dame:  "2EiwWnXFnvU5JabPnv8n",
  rex:   "5Q0t7uMcjvnagumLfvZi",
  ayub:  "N09NFwYJJG9VSSgdLQbT",
  prime: "TxGEqnHWrfWFTfGW9XjX",
  atlas: "VR6AewLTigWG4xSOukaG",
  sygma: "EXAVITQu4vr4xnSDxMaL",
};

// Browser SpeechSynthesis voice params — used when ElevenLabs is unavailable
// pitch/rate = browser SpeechSynthesis fallback params
// playbackRate = AudioContext playbackRate applied to server-side TTS audio
// Values < 1.0 → lower pitch (sounds male); > 1.0 → higher pitch (sounds female)
const AGENT_SYNTH_PARAMS: Record<string, { pitch: number; rate: number; voiceHint: string; playbackRate: number }> = {
  abdi:  { pitch: 0.72, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },
  ahmed: { pitch: 0.82, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },
  dame:  { pitch: 0.68, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },
  rex:   { pitch: 0.78, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },
  prime: { pitch: 0.84, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },
  ayub:  { pitch: 0.88, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },
  atlas: { pitch: 0.80, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },
  sygma: { pitch: 1.12, rate: 1.35, voiceHint: "female", playbackRate: 1.35 },
};

// Per-agent preferred voice name fragments (ordered by preference).
// Targets Windows 11 Microsoft Neural voices — very human-sounding with real accents.
// Chrome exposes these via Web Speech API when Edge/Windows neural voices are installed.
const AGENT_VOICE_PREFS: Record<string, string[]> = {
  abdi:  ["hamdan", "charles", "ismail", "eze", "eric", "guy"],       // East African / Arab male → fallback rich male
  ahmed: ["eze", "abeo", "kevin", "christopher", "guy", "eric"],      // Nigerian male → fallback Jamaican / neutral male
  dame:  ["ryan", "george", "thomas", "eric"],                        // British English male
  rex:   ["william", "natasha", "libby", "liam", "eric"],             // Australian English male
  prime: ["andrew", "christopher", "eric", "guy"],                    // polished East Asian-coded fallback male
  ayub:  ["prabhat", "ravi", "liam", "eric", "guy"],                  // Indian / Arab-leaning male
  atlas: ["eric", "andrew", "christopher", "guy"],                    // clean American male
  sygma: ["natasha", "libby", "aria", "jenny"],                       // Australian female
};

function speakWithBrowserVoice(text: string, agentId: string, onEnd: () => void): void {
  window.speechSynthesis.cancel();
  const params = AGENT_SYNTH_PARAMS[agentId.toLowerCase()] ?? { pitch: 1, rate: 1.35, voiceHint: "male" };
  const prefs = AGENT_VOICE_PREFS[agentId.toLowerCase()] ?? [];

  const knownFemale = ["zira", "susan", "female", "woman", "samantha", "victoria", "karen", "moira", "fiona",
    "aria", "jenny", "nova", "shimmer", "natasha", "libby", "neerja", "google us english", "google uk english female"];
  const knownMale = ["david", "mark", "daniel", "guy", "christopher", "eric", "ryan", "william", "prabhat",
    "liam", "andrew", "thomas", "george", "hamdan", "charles", "ismail", "eze", "kevin", "google uk english male"];

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

const AGENT_VOICE_COLORS: Record<string, string> = {
  abdi:  "#74d697", ahmed: "#8bd7ff", dame: "#f0b24c",
  rex:   "#ef4444", ayub:  "#a78bfa", prime: "#8b8fff",
  atlas: "#06b6d4", sygma: "#f9a8d4",
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

type MessageItem = {
  id: string;
  role: "user" | "agent" | "system";
  speaker: string;
  text: string;
  ts: string;
  agentId?: string;
};

type MessageThread = {
  id: string;
  name: string;
  mode: "direct" | "group";
  agentIds: string[];
  messages: MessageItem[];
  updatedAt: string;
  callActive: boolean;
  projectId?: string;
  projectName?: string;
};

const MESSAGE_THREADS_KEY = "mc_messages_threads_v1";

export function loadMessageThreads(): MessageThread[] {
  try {
    return JSON.parse(localStorage.getItem(MESSAGE_THREADS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveMessageThreads(threads: MessageThread[]) {
  localStorage.setItem(MESSAGE_THREADS_KEY, JSON.stringify(threads));
}

export function upsertProjectThread(project: { id: string; name: string; linkedAgents?: string[] }): string {
  const existing = loadMessageThreads();
  const found = existing.find((t) => t.projectId === project.id);
  if (found) return found.id;
  const agentIds = (project.linkedAgents || []).map((name: string) => name.toLowerCase());
  const threadId = `thread-project-${project.id}`;
  const kickoff: MessageItem = {
    id: `sys-${Date.now()}`,
    role: "system",
    speaker: "System",
    text: `📋 Project thread opened: ${project.name}. All linked agents are in this thread. Ask about status, tasks, blockers, or anything about the project.`,
    ts: new Date().toISOString(),
  };
  const thread: MessageThread = {
    id: threadId,
    name: project.name,
    mode: "group",
    agentIds,
    messages: [kickoff],
    updatedAt: new Date().toISOString(),
    callActive: false,
    projectId: project.id,
    projectName: project.name,
  };
  saveMessageThreads([thread, ...existing]);
  return threadId;
}

function seedMessageThreads(agents: any[]): MessageThread[] {
  return agents.map((agent: any) => ({
    id: `thread-${agent.id}`,
    name: agent.name,
    mode: "direct",
    agentIds: [agent.id],
    messages: [],
    updatedAt: new Date().toISOString(),
    callActive: false,
  }));
}

export function VoicePage({ data, focus }: PageProps) {
  const agents: any[] = data.voice?.agents?.length ? data.voice.agents : data.agents;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState<VoiceMsg[]>([]);
  const [interimText, setInterimText] = useState("");
  const [statusText, setStatusText] = useState("Select an agent, then press S to talk");
  const recogRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<{ stop: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeAgentRef = useRef<any>(null);
  const capturedTextRef = useRef("");
  const listeningRef = useRef(false);
  const convLogRef = useRef<VoiceConvLog | null>(null);

  const activeAgent = agents.find((a: any) => a.id === activeId) || null;
  const agentKey = activeAgent?.name?.toLowerCase() || "";
  const agentColor = AGENT_VOICE_COLORS[agentKey] || "var(--accent)";

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { activeAgentRef.current = activeAgent; }, [activeAgent]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);

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

  const sendToAgent = useCallback(async (text: string, agentId: string, agentObj: any) => {
    if (!text.trim()) return;
    setProcessing(true);
    setStatusText("Thinking…");

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

    let replyText = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      let res: Response;
      try {
        res = await fetch("/api/voice/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, message: text.trim() }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const json = await res.json();
      replyText = (json.reply || json.text || "").trim();
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

    // TTS — Google TTS (relay) for female agents only; male agents use browser SpeechSynthesis
    // (Google Translate TTS only produces female voices — no gender param in the API)
    setSpeaking(true);
    setStatusText("Speaking…");
    const done = () => { setSpeaking(false); setStatusText("Press S to speak"); };
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
          // Use AudioContext (already unlocked by S keypress) for reliable playback
          const ctx = audioCtxRef.current;
          if (ctx && ctx.state !== "closed") {
            if (ctx.state === "suspended") await ctx.resume();
            const decoded = await ctx.decodeAudioData(buf.slice(0));
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.playbackRate.value = agentParams?.playbackRate ?? 1.35;
            source.connect(ctx.destination);
            await new Promise<void>((resolve) => {
              source.onended = () => { activeSourceRef.current = null; resolve(); };
              activeSourceRef.current = { stop: () => { try { source.stop(); } catch {} resolve(); } };
              source.start(0);
            });
            usedServerTts = true;
          } else {
            // Fallback: HTMLAudioElement
            const blobUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
            if (!audioRef.current) audioRef.current = new Audio();
            const audio = audioRef.current;
            audio.volume = 1;
            audio.src = blobUrl;
            audio.onended = () => { URL.revokeObjectURL(blobUrl); activeSourceRef.current = null; done(); };
            activeSourceRef.current = { stop: () => { audio.pause(); audio.src = ""; URL.revokeObjectURL(blobUrl); done(); } };
            await audio.play();
            usedServerTts = true;
          }
        }
      }
    } catch { /* fall through to browser TTS */ }
    if (!usedServerTts) {
      speakWithBrowserVoice(replyText, agentId, done);
    }
  }, []);

  const pendingSendRef = useRef(false);
  const lastInterimRef = useRef("");

  const startListening = useCallback(() => {
    if (listeningRef.current) return;
    // Unlock AudioContext during this user-gesture so TTS can play later
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    // Unlock speechSynthesis with a silent utterance — Chrome blocks the first
    // speak() call unless it happens within a user gesture. Calling cancel()
    // right after primes the engine so the real reply can play asynchronously.
    const primer = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(primer);
    window.speechSynthesis.cancel();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setStatusText("Speech recognition not supported. Use Chrome."); return; }

    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    recogRef.current = recog;
    capturedTextRef.current = "";
    lastInterimRef.current = "";
    pendingSendRef.current = false;

    recog.onstart = () => { setListening(true); setStatusText("Listening… press S to stop"); };
    recog.onerror = (e: any) => {
      if (e.error !== "aborted") setStatusText(`Mic error: ${e.error}`);
      setListening(false);
    };
    recog.onend = () => {
      setListening(false);
      setInterimText("");
      if (pendingSendRef.current) {
        pendingSendRef.current = false;
        // Use final text first, fall back to last interim (Chrome often never marks isFinal)
        const text = (capturedTextRef.current || lastInterimRef.current).trim();
        capturedTextRef.current = "";
        lastInterimRef.current = "";
        const agentId = activeIdRef.current;
        const agentObj = activeAgentRef.current;
        if (text && agentId) {
          sendToAgent(text, agentId, agentObj);
        } else {
          setStatusText("Nothing heard — press S to try again");
        }
      }
    };

    recog.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) capturedTextRef.current += final;
      if (interim) lastInterimRef.current = interim;
      setInterimText(capturedTextRef.current + interim);
    };

    recog.start();
  }, [sendToAgent]);

  const stopListeningAndSend = useCallback(() => {
    const text = (capturedTextRef.current || lastInterimRef.current).trim();
    const agentId = activeIdRef.current;
    const agentObj = activeAgentRef.current;
    // Abort immediately (no audio finalization delay) — don't wait for onend
    pendingSendRef.current = false;
    recogRef.current?.abort();
    setListening(false);
    setInterimText("");
    if (text && agentId) {
      sendToAgent(text, agentId, agentObj);
    } else {
      setStatusText("Nothing heard — press S to try again");
    }
  }, [sendToAgent]);

  // S key: press to start, press again to stop & send
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() !== "s") return;
      if (!activeIdRef.current) return;
      if (processing) return;

      // If agent is speaking, S key interrupts and starts listening
      if (speaking) {
        activeSourceRef.current?.stop();
        activeSourceRef.current = null;
        window.speechSynthesis.cancel();
        setSpeaking(false);
        startListening();
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
    audioCtxRef.current?.suspend();
    recogRef.current?.stop();
    setInterimText("");
    setSpeaking(false);
    setProcessing(false);
    setListening(false);
    capturedTextRef.current = "";
    if (existingLog) {
      convLogRef.current = existingLog;
      setTranscript(existingLog.messages.map(m => ({
        id: m.id, role: m.role, text: m.text,
        agentName: m.role === "user" ? "You" : agent.name, ts: m.ts,
      })));
      setStatusText(`Resumed with ${agent.name} — press S to speak`);
    } else {
      const newLog: VoiceConvLog = {
        id: `vcl-${Date.now()}`, agentId: agent.id, agentName: agent.name,
        startTime: new Date().toISOString(), lastUpdated: new Date().toISOString(),
        messages: [], savedForever: false,
      };
      convLogRef.current = newLog;
      upsertVoiceLog(newLog);
      setTranscript([]);
      setStatusText(`Connected to ${agent.name} — press S to speak`);
    }
    setActiveId(agent.id);
    focus("voice", agent);
  }, [focus]);

  const stopConversation = () => {
    recogRef.current?.stop();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setListening(false);
    setSpeaking(false);
    setProcessing(false);
    setActiveId(null);
    setInterimText("");
    capturedTextRef.current = "";
    convLogRef.current = null;
    setStatusText("Select an agent, then press S to talk");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      {/* Agent picker grid — 4 columns, 2 rows */}
      <div className="voice-agents-grid">
        {agents.map((agent: any) => {
          const key = agent.name?.toLowerCase() || "";
          const color = AGENT_VOICE_COLORS[key] || "var(--accent)";
          const isActive = activeId === agent.id;
          return (
            <button
              key={agent.id}
              className={cn("voice-agent-card", isActive && "voice-agent-card-active")}
              style={isActive ? { borderColor: color, boxShadow: `0 0 0 2px ${color}22` } : {}}
              onClick={() => isActive ? stopConversation() : selectAgent(agent)}
            >
              <div className="voice-agent-avatar" style={{ background: isActive ? color : "rgba(255,255,255,0.06)", color: isActive ? "#000" : color }}>
                {agent.name.charAt(0)}
              </div>
              {isActive && (listening || speaking) && (
                <div className="voice-wave">
                  {[1,2,3,4,5].map(i => (
                    <span key={i} className={cn("voice-bar", speaking ? "voice-bar-speak" : "voice-bar-listen")} style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              )}
              <div className="voice-agent-name">{agent.name}</div>
              <div className="voice-agent-role">{agent.role?.split("/")[0] || agent.specialty?.split(" ")[0] || ""}</div>
              {isActive && (
                <div className="voice-agent-status" style={{ color }}>
                  {speaking ? "Speaking" : processing ? "Thinking" : listening ? "Listening" : "Ready"}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Status bar */}
      <div className="voice-status-bar">
        <span className={cn("voice-status-dot", listening ? "voice-status-dot-listen" : speaking ? "voice-status-dot-speak" : "voice-status-dot-idle")} />
        <span className="text-sm text-2">{statusText}</span>
        {activeId && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button
              style={{
                padding: "6px 18px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: listening ? "var(--accent)" : "rgba(255,255,255,0.1)",
                color: listening ? "#000" : "var(--text-1)",
                opacity: (processing || speaking) ? 0.4 : 1,
                pointerEvents: (processing || speaking) ? "none" : "auto",
              }}
              onClick={() => listening ? stopListeningAndSend() : startListening()}
            >
              {listening ? "⏹ Stop (S)" : "🎙 Speak (S)"}
            </button>
            <button
              style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", fontSize: 12, background: "transparent", color: "var(--text-2)", opacity: speaking ? 0.4 : 1, pointerEvents: speaking ? "none" : "auto" }}
              onClick={() => { speakWithBrowserVoice(`Hello, this is ${activeAgent?.name || "your agent"}. Voice test successful.`, agentId || "", () => {}); }}
            >Test Voice</button>
            <Btn variant="ghost" size="sm" onClick={stopConversation}>End</Btn>
          </div>
        )}
      </div>

      {/* Conversation transcript */}
      <div className="voice-transcript">
        {transcript.length === 0 && !activeId && (
          <div className="empty" style={{ flex: 1 }}>
            <span className="empty-text">Click an agent above, then press S to speak</span>
          </div>
        )}
        {transcript.length === 0 && activeId && (
          <div className="empty" style={{ flex: 1 }}>
            <span className="empty-text" style={{ color: agentColor }}>Connected to {activeAgent?.name} — press S to speak</span>
          </div>
        )}
        {transcript.map(msg => (
          <div key={msg.id} className={cn("voice-msg", msg.role === "user" ? "voice-msg-user" : "voice-msg-agent")}>
            <div className="voice-msg-name">{msg.agentName}</div>
            <div className="voice-msg-bubble" style={msg.role === "agent" ? { borderColor: agentColor + "44" } : {}}>
              {msg.text}
            </div>
            <div className="voice-msg-time">{formatRelative(msg.ts)}</div>
          </div>
        ))}
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

export function MessagesPage({ data, focus }: PageProps) {
  const agents: any[] = data.agents || [];
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [statusText, setStatusText] = useState("Pick a thread, then message or call your agents.");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<{ stop: () => void } | null>(null);
  const capturedTextRef = useRef("");
  const lastInterimRef = useRef("");
  const listeningRef = useRef(false);
  const selectedThreadRef = useRef<MessageThread | null>(null);

  useEffect(() => { listeningRef.current = listening; }, [listening]);

  useEffect(() => {
    const stored = loadMessageThreads();
    const base = stored.length ? stored : seedMessageThreads(agents);
    setThreads(base);
    // Auto-select project thread if navigated from Projects page
    const pendingThreadId = sessionStorage.getItem("mc_pending_thread_id");
    if (pendingThreadId && base.find((t) => t.id === pendingThreadId)) {
      setSelectedThreadId(pendingThreadId);
      sessionStorage.removeItem("mc_pending_thread_id");
    } else {
      setSelectedThreadId(base[0]?.id || "");
    }
  }, [agents]);

  useEffect(() => { saveMessageThreads(threads); }, [threads]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  useEffect(() => { selectedThreadRef.current = selectedThread; }, [selectedThread]);

  useEffect(() => {
    if (!selectedThread) return;
    setSelectedAgents(selectedThread.agentIds);
  }, [selectedThreadId, selectedThread]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedThread?.messages, interimText]);

  const patchThread = useCallback((threadId: string, updater: (thread: MessageThread) => MessageThread) => {
    setThreads((prev) => prev.map((thread) => thread.id === threadId ? updater(thread) : thread));
  }, []);

  const selectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId);
    const thread = threads.find((entry) => entry.id === threadId);
    if (!thread) return;
    const names = thread.agentIds
      .map((id) => agents.find((agent: any) => agent.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    setStatusText(thread.callActive ? `Call live with ${names}` : `Connected to ${names || thread.name}`);
  }, [agents, threads]);

  const createGroupThread = useCallback(() => {
    const roster = Array.from(new Set(selectedAgents)).filter(Boolean);
    if (!roster.length) return;
    const title = roster
      .map((id) => agents.find((agent: any) => agent.id === id)?.name)
      .filter(Boolean)
      .join(" + ");
    const next: MessageThread = {
      id: `thread-group-${Date.now()}`,
      name: title || "Group Thread",
      mode: roster.length > 1 ? "group" : "direct",
      agentIds: roster,
      messages: [{
        id: `sys-${Date.now()}`,
        role: "system",
        speaker: "System",
        text: `Thread created for ${title || "selected agents"}.`,
        ts: new Date().toISOString(),
      }],
      updatedAt: new Date().toISOString(),
      callActive: false,
    };
    setThreads((prev) => [next, ...prev]);
    setSelectedThreadId(next.id);
    setStatusText(`New ${next.mode} thread ready.`);
  }, [agents, selectedAgents]);

  const updateRoster = useCallback((nextRoster: string[]) => {
    if (!selectedThread) return;
    const roster = Array.from(new Set(nextRoster)).filter(Boolean);
    patchThread(selectedThread.id, (thread) => ({
      ...thread,
      agentIds: roster,
      mode: roster.length > 1 ? "group" : "direct",
      name: roster
        .map((id) => agents.find((agent: any) => agent.id === id)?.name)
        .filter(Boolean)
        .join(" + ") || thread.name,
      updatedAt: new Date().toISOString(),
    }));
  }, [agents, patchThread, selectedThread]);

  const speakServerReply = useCallback(async (text: string, agentId: string) => {
    const agentParams = AGENT_SYNTH_PARAMS[(agentId || "").toLowerCase()];
    let usedServerTts = false;
    try {
      const ttsRes = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, text }),
      });
      if (ttsRes.ok) {
        const buf = await ttsRes.arrayBuffer();
        if (buf.byteLength > 0) {
          const ctx = audioCtxRef.current;
          if (ctx && ctx.state !== "closed") {
            if (ctx.state === "suspended") await ctx.resume();
            const decoded = await ctx.decodeAudioData(buf.slice(0));
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.playbackRate.value = agentParams?.playbackRate ?? 1.35;
            source.connect(ctx.destination);
            await new Promise<void>((resolve) => {
              source.onended = () => { activeSourceRef.current = null; resolve(); };
              activeSourceRef.current = { stop: () => { try { source.stop(); } catch {} resolve(); } };
              source.start(0);
            });
            usedServerTts = true;
          } else {
            // Fallback: HTMLAudioElement
            const blobUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
            if (!audioRef.current) audioRef.current = new Audio();
            const audio = audioRef.current;
            audio.volume = 1;
            audio.src = blobUrl;
            let played = false;
            await new Promise<void>((resolve) => {
              audio.onended = () => { URL.revokeObjectURL(blobUrl); activeSourceRef.current = null; played = true; resolve(); };
              activeSourceRef.current = { stop: () => { audio.pause(); audio.src = ""; URL.revokeObjectURL(blobUrl); resolve(); } };
              audio.play().then(() => { played = true; }).catch(() => resolve());
            });
            usedServerTts = played;
          }
        }
      }
    } catch {
      usedServerTts = false;
    }

    if (!usedServerTts) {
      await new Promise<void>((resolve) => {
        speakWithBrowserVoice(text, agentId, resolve);
      });
    }
  }, []);

  const sendThreadMessage = useCallback(async (rawText: string) => {
    const thread = selectedThreadRef.current;
    if (!thread) return;
    const text = rawText.trim();
    if (!text) return;

    const now = new Date().toISOString();
    const userMsg: MessageItem = {
      id: `msg-u-${Date.now()}`,
      role: "user",
      speaker: "You",
      text,
      ts: now,
    };

    patchThread(thread.id, (entry) => ({
      ...entry,
      messages: [...entry.messages, userMsg],
      updatedAt: now,
    }));
    setDraft("");
    setInterimText("");
    setProcessing(true);
    setStatusText(thread.callActive ? "Agents are responding on the call…" : "Agents are responding…");

    try {
      const res = await fetch("/api/messages/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentIds: thread.agentIds,
          message: thread.callActive
            ? `${text}\n\nRespond like a real phone call: concise, energetic, human, 2-4 short sentences max.`
            : `${text}\n\nRespond concisely, practically, and avoid filler.`,
          history: thread.messages.slice(-8).map((entry) => ({ speaker: entry.speaker, text: entry.text })),
        }),
      });
      const json = await res.json();
      const replies = Array.isArray(json.replies) ? json.replies : [];
      const replyItems: MessageItem[] = replies.map((reply: any, index: number) => ({
        id: `msg-a-${Date.now()}-${index}`,
        role: "agent",
        speaker: agents.find((agent: any) => agent.id === reply.agentId)?.name || reply.agentId,
        text: reply.reply || "No response returned.",
        ts: reply.timestamp || new Date().toISOString(),
        agentId: reply.agentId,
      }));

      patchThread(thread.id, (entry) => ({
        ...entry,
        messages: [...entry.messages, ...replyItems],
        updatedAt: new Date().toISOString(),
      }));

      if (thread.callActive && replyItems.length) {
        setSpeaking(true);
        for (const item of replyItems) {
          setStatusText(`${item.speaker} is speaking…`);
          await speakServerReply(item.text, item.agentId || "");
        }
        setSpeaking(false);
      }

      setStatusText(thread.callActive ? "Call live and ready." : "Messages synced.");
    } catch (err: any) {
      setStatusText(err?.message || "Message delivery failed.");
    } finally {
      setProcessing(false);
      setSpeaking(false);
    }
  }, [agents, patchThread, speakServerReply]);

  const startListening = useCallback(() => {
    if (listeningRef.current || !selectedThreadRef.current) return;
    // Unlock AudioContext during this user gesture so TTS can play later
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    const primer = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(primer);
    window.speechSynthesis.cancel();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusText("Speech recognition not supported in this browser.");
      return;
    }
    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    recogRef.current = recog;
    capturedTextRef.current = "";
    lastInterimRef.current = "";

    recog.onstart = () => {
      setListening(true);
      setStatusText("Listening…");
    };
    recog.onerror = (e: any) => {
      if (e.error !== "aborted") setStatusText(`Mic error: ${e.error}`);
      setListening(false);
    };
    recog.onend = () => {
      setListening(false);
      setInterimText("");
      const text = (capturedTextRef.current || lastInterimRef.current).trim();
      capturedTextRef.current = "";
      lastInterimRef.current = "";
      if (text) {
        setDraft(text);
        void sendThreadMessage(text);
      } else {
        setStatusText("Nothing heard.");
      }
    };
    recog.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) capturedTextRef.current += final;
      if (interim) lastInterimRef.current = interim;
      setInterimText(capturedTextRef.current + interim);
    };
    recog.start();
  }, [sendThreadMessage]);

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  const toggleCall = useCallback(() => {
    if (!selectedThread) return;
    patchThread(selectedThread.id, (thread) => ({
      ...thread,
      callActive: !thread.callActive,
      updatedAt: new Date().toISOString(),
    }));
    setStatusText(selectedThread.callActive ? "Call ended." : "Call live. Use mic or text.");
  }, [patchThread, selectedThread]);

  const selectedNames = (selectedThread?.agentIds || [])
    .map((id) => agents.find((agent: any) => agent.id === id)?.name)
    .filter(Boolean);

  return (
    <div className="messages-shell">
      <aside className="messages-threads">
        <div className="messages-pane-header">
          <div>
            <div className="section-title">Threads</div>
            <div className="text-xs text-3">Direct agents and custom groups</div>
          </div>
          <Btn variant="secondary" size="sm" onClick={createGroupThread}>New Group</Btn>
        </div>
        <div className="messages-thread-list">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={cn("messages-thread-card", selectedThreadId === thread.id && "messages-thread-card-active")}
              onClick={() => selectThread(thread.id)}
            >
              <div className="row-between">
                <strong>{thread.name}</strong>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {thread.projectId ? <span className="messages-call-pill" style={{ background: "var(--accent-2, #1e3a5f)", color: "var(--text-1)" }}>Project</span> : null}
                  {thread.callActive ? <span className="messages-call-pill">On Call</span> : null}
                </div>
              </div>
              <div className="text-xs text-3">
                {thread.mode === "group" ? `${thread.agentIds.length} agents` : "Direct chat"} · {formatRelative(thread.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="messages-main">
        <div className="messages-pane-header">
          <div>
            <div className="section-title">{selectedThread?.name || "Messages"}</div>
            <div className="text-sm text-2">
              {selectedNames.length ? selectedNames.join(", ") : "Select a thread"}{selectedThread?.callActive ? " · live call" : ""}
            </div>
          </div>
          <div className="row gap-8">
            <button className={cn("messages-action-btn", selectedThread?.callActive && "messages-action-btn-live")} onClick={toggleCall} type="button" disabled={!selectedThread}>
              {selectedThread?.callActive ? "End Call" : "Start Call"}
            </button>
            <button className={cn("messages-action-btn", listening && "messages-action-btn-live")} onClick={() => listening ? stopListening() : startListening()} type="button" disabled={!selectedThread || processing}>
              {listening ? "Mic On" : "Mic"}
            </button>
          </div>
        </div>

        <div className="messages-status">
          <span className={cn("voice-status-dot", listening ? "voice-status-dot-listen" : speaking ? "voice-status-dot-speak" : "voice-status-dot-idle")} />
          <span className="text-sm text-2">{statusText}</span>
        </div>

        <div className="messages-transcript">
          {!selectedThread ? (
            <div className="empty"><span className="empty-text">Select a thread to start messaging.</span></div>
          ) : (
            <>
              {selectedThread.messages.map((msg) => (
                <div key={msg.id} className={cn("messages-msg", msg.role === "user" ? "messages-msg-user" : msg.role === "system" ? "messages-msg-system" : "messages-msg-agent")}>
                  <div className="messages-msg-name">{msg.speaker}</div>
                  <div className="messages-msg-bubble">{msg.text}</div>
                  <div className="messages-msg-time">{formatRelative(msg.ts)}</div>
                </div>
              ))}
              {interimText ? (
                <div className="messages-msg messages-msg-user">
                  <div className="messages-msg-name">You</div>
                  <div className="messages-msg-bubble voice-msg-interim">{interimText}</div>
                </div>
              ) : null}
            </>
          )}
          <div ref={transcriptEndRef} />
        </div>

        <div className="messages-composer">
          <textarea
            className="field"
            rows={3}
            placeholder="Message one agent or a full group. Call mode keeps replies short and natural."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row-between">
            <div className="text-xs text-3">Call mode uses the same thread roster and reads replies out loud.</div>
            <Btn variant="primary" size="sm" onClick={() => void sendThreadMessage(draft)}>{processing ? "Sending…" : "Send"}</Btn>
          </div>
        </div>
      </section>

      <aside className="messages-roster">
        <div className="messages-pane-header">
          <div>
            <div className="section-title">Roster</div>
            <div className="text-xs text-3">Add agents to this thread or call</div>
          </div>
        </div>
        <div className="messages-roster-list">
          {agents.map((agent: any) => {
            const active = selectedAgents.includes(agent.id);
            return (
              <button
                key={agent.id}
                type="button"
                className={cn("messages-roster-agent", active && "messages-roster-agent-active")}
                onClick={() => {
                  const next = active ? selectedAgents.filter((id) => id !== agent.id) : [...selectedAgents, agent.id];
                  setSelectedAgents(next);
                  if (selectedThread) updateRoster(next);
                }}
              >
                <span className={cn("status-dot", dotTone(agent.status))} />
                <div className="list-item-content">
                  <div className="list-item-title">{agent.name}</div>
                  <div className="list-item-sub">{agent.role}</div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/* ─── Models ─── */

export function ModelsPage({ data, focus, actions }: PageProps) {
  const [selectedModel, setSelectedModel] = useState(data.models.catalog[0]);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [primaryDraft, setPrimaryDraft] = useState("");
  const [fallbackDraft, setFallbackDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const openEdit = (agent: any) => {
    setEditingAgent(agent);
    setPrimaryDraft(agent.primaryModel || agent.currentModel || "");
    setFallbackDraft(agent.backupModel || "");
  };

  const saveAgentModel = async () => {
    if (!editingAgent) return;
    setSaving(true);
    try {
      await actions.assignPrimaryModel(editingAgent.agentId || editingAgent.agent, primaryDraft);
      await actions.assignFallbackModel(editingAgent.agentId || editingAgent.agent, fallbackDraft);
    } finally {
      setSaving(false);
      setEditingAgent(null);
    }
  };

  return (
    <div className="split split-7-5">
      <div>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Agent Model Assignments</span>
          <span className="text-xs text-3">Click any row to change model</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Agent</th><th>Primary</th><th>Fallback</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {data.models.assignments.map((row: any) => (
                <tr key={row.agent} style={{ cursor: "pointer" }} onClick={() => openEdit(row)}>
                  <td>{row.agent}</td>
                  <td className="text-2 mono" style={{ fontSize: 12 }}>{row.primaryModel}</td>
                  <td className="text-2 mono" style={{ fontSize: 12 }}>{row.backupModel}</td>
                  <td><StatusBadge value={row.status} /></td>
                  <td><span className="text-xs text-3">Edit</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edit panel */}
        {editingAgent && (
          <div style={{ marginTop: 20, padding: 16, borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <span className="text-sm font-semibold">Edit models for {editingAgent.agent}</span>
              <Btn variant="ghost" size="sm" onClick={() => setEditingAgent(null)}>×</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <div className="field-label">Primary Model</div>
                <select className="field field-sm" value={primaryDraft} onChange={e => setPrimaryDraft(e.target.value)}>
                  {data.models.catalog.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <div className="field-label">Fallback Model</div>
                <select className="field field-sm" value={fallbackDraft} onChange={e => setFallbackDraft(e.target.value)}>
                  {data.models.catalog.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <Btn variant="primary" size="sm" onClick={saveAgentModel}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Model Catalog</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.models.catalog.map((model: any) => (
              <button
                key={model.id}
                className={cn("list-item", selectedModel?.id === model.id && "list-item-active")}
                onClick={() => { setSelectedModel(model); focus("model", model); }}
              >
                <span className={cn("status-dot", dotTone(model.status || "online"))} />
                <div className="list-item-content">
                  <div className="list-item-title">{model.label}</div>
                  <div className="list-item-sub">{model.provider} · {model.family}</div>
                </div>
                <span className="text-xs text-3">{model.latencyMs}ms</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedModel && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="text-md font-semibold" style={{ marginBottom: 4 }}>{selectedModel.label}</div>
            <div className="text-sm text-3">{selectedModel.provider} · {selectedModel.family}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Latency", value: `${selectedModel.latencyMs}ms` },
              { label: "Cost", value: selectedModel.costIndex },
              { label: "Usage share", value: `${selectedModel.usageShare}%` },
              { label: "Status", value: selectedModel.status || "online" },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-3">{f.label}</div>
                <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
              </div>
            ))}
          </div>
          {selectedModel.assignedAgents?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Assigned agents</div>
              <TagRow values={selectedModel.assignedAgents} />
            </div>
          )}
          {selectedModel.specialization && (
            <div>
              <div className="text-xs text-3" style={{ marginBottom: 4 }}>Specialization</div>
              <div className="text-sm text-2">{selectedModel.specialization}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
