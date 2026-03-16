import { useState, useDeferredValue, useMemo, useEffect, useRef, useCallback } from "react";
import { ActionButton, Btn, MetricCard, StatusBadge, StatusDot, TagRow } from "./shell";
import { cn, dotTone, formatRelative, formatStamp, type PageProps } from "./types";

const AGENT_TONES: Record<string, string> = {
  TASK: "tone-task", Abdi: "tone-abdi", Ahmed: "tone-ahmed", Dame: "tone-dame",
  Rex: "tone-rex", Prime: "tone-prime", Atlas: "tone-atlas", Ayub: "tone-ayub", Sygma: "tone-sygma",
};

/* ─── Home ─── */

export function HomePage({ data, focus, openRoute, actions }: PageProps) {
  const [agentFilter, setAgentFilter] = useState("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAgent, setDraftAgent] = useState(data.agents[0]?.id || "");
  const [draftDetail, setDraftDetail] = useState("");

  const tasks = data.tasks.tasks;
  const filtered = agentFilter === "all" ? tasks : tasks.filter((t: any) => t.assignedAgent === agentFilter || t.owner === agentFilter);
  const backlog = filtered.filter((t: any) => t.status === "queued");
  const active = filtered.filter((t: any) => t.status === "active");
  const review = filtered.filter((t: any) => t.status === "completed" || t.status === "failed");
  const total = tasks.length;
  const done = tasks.filter((t: any) => t.status === "completed").length;
  const pct = Math.round((done / Math.max(1, total)) * 100);

  const recurring = data.calendar.upcoming
    .filter((e: any) => /daily|weekly|cron|routine/i.test(e.title + (e.type || "")))
    .slice(0, 4)
    .map((e: any) => ({ ...e, _kind: "recurring" }));

  const lanes = [
    { id: "recurring", label: "Recurring", dot: "#8b5cf6", items: recurring },
    { id: "backlog",   label: "Backlog",   dot: "var(--text-3)", items: backlog },
    { id: "active",    label: "In Progress", dot: "var(--accent)", items: active },
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, marginBottom: 16 }}>
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
                  <span>{lane.label}</span>
                  <span className="lane-count">{lane.items.length}</span>
                </div>
              </div>
              <div className="lane-stack">
                {lane.items.length === 0
                  ? <div className="lane-empty">Empty</div>
                  : lane.items.map((item: any) => (
                    <button key={item.id} className="lane-card" onClick={() => focus("task", item)}>
                      <div className="lane-card-title">
                        <span className={cn("status-dot", item.status === "active" ? "dot-active" : item.status === "failed" ? "dot-error" : item._kind === "recurring" ? "dot-info" : "dot-standby")} style={{ marginTop: 4, flexShrink: 0 }} />
                        <strong>{item.title}</strong>
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
                  ))
                }
              </div>
            </div>
          ))}
        </div>

        {/* Activity */}
        <aside>
          <div className="activity-header">
            <span className="activity-title">Live Activity</span>
          </div>
          <div className="activity-stack">
            {feed.map(entry => (
              <button key={entry.id} className="activity-item" onClick={() => openRoute("/tasks")}>
                <div className="activity-topline">
                  <span className={cn("activity-actor", AGENT_TONES[entry.actor] || "tone-task")}>{entry.actor}</span>
                  <span className="activity-time">{formatRelative(entry.timestamp)}</span>
                </div>
                <strong>{entry.summary}</strong>
                <p>{entry.detail}</p>
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
  abdi:  { pitch: 0.85, rate: 1.30, voiceHint: "male",   playbackRate: 1.30 },  // jamaican male, 30% above normal
  ahmed: { pitch: 0.80, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },  // calm male
  dame:  { pitch: 0.75, rate: 1.55, voiceHint: "male",   playbackRate: 1.55 },  // deep calm male
  rex:   { pitch: 0.65, rate: 1.49, voiceHint: "male",   playbackRate: 1.49 },  // deepest male
  prime: { pitch: 1.05, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },  // younger male
  ayub:  { pitch: 1.10, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },  // energetic male
  atlas: { pitch: 0.90, rate: 1.35, voiceHint: "male",   playbackRate: 1.35 },  // professional male
  sygma: { pitch: 1.20, rate: 1.55, voiceHint: "female", playbackRate: 1.55 },  // female
};

// Per-agent preferred voice name fragments (ordered by preference).
// Targets Windows 11 Microsoft Neural voices — very human-sounding with real accents.
// Chrome exposes these via Web Speech API when Edge/Windows neural voices are installed.
const AGENT_VOICE_PREFS: Record<string, string[]> = {
  abdi:  ["eze", "abeo", "obi", "eric", "guy", "christopher"],        // Nigerian → fallback US male
  ahmed: ["prabhat", "ravi", "neerja", "eric"],                       // Indian English male
  dame:  ["ryan", "george", "thomas", "eric"],                        // British English male
  rex:   ["william", "liam", "eric"],                                  // Australian English male
  prime: ["eric", "guy", "christopher", "andrew"],                    // US English male
  ayub:  ["liam", "eric", "guy"],                                      // Canadian English male
  atlas: ["ryan", "george", "thomas", "eric"],                        // British English male
  sygma: ["natasha", "libby", "aria", "jenny"],                       // Australian female
};

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
          const blobUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
          if (!audioRef.current) audioRef.current = new Audio();
          const audio = audioRef.current;
          audio.playbackRate = agentParams?.playbackRate ?? 1.0;
          (audio as any).preservesPitch = true;
          (audio as any).mozPreservesPitch = true;
          audio.src = blobUrl;
          audio.onended = () => { URL.revokeObjectURL(blobUrl); activeSourceRef.current = null; done(); };
          activeSourceRef.current = { stop: () => { audio.pause(); audio.src = ""; URL.revokeObjectURL(blobUrl); done(); } };
          await audio.play();
          usedServerTts = true;
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
