import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AgentsPage, HomePage, ModelsPage, OverviewPage, VoicePage } from "./pages-core";
import { MessagesPage } from "./pages-messages";
import { RevenueDashboardPage } from "./pages-revenue";
import { McpPage, McpToolsPage, OpenClawPage, ProtocolsPage, ToolStorePage } from "./pages-infra";
import { MonitoringPage } from "./pages-monitoring";
import { ClaudeMemPage, ContentPage, DocsPage, MemoriesPage, OfficePage, TeamPage } from "./pages-knowledge";
import { ApprovalsPage, CalendarPage, IntegrationsPage, NotesPage, ProjectsPage, SettingsPage, TasksPage } from "./pages-ops";
import { CortexPage } from "./pages-cortex";
import { Btn, Rail, SearchOverlay, StatusBadge } from "./shell";
import { TopNav, BackendProofBar } from "./top-nav";
import { AnimatePresence, PageTransition, ScaleIn, FadeUp } from "./motion-primitives";
import { LOCK_TIMEOUT_MS, PASSWORD_HASH, PASSWORD_PLAIN, clearSession, isKnownDevice, markDeviceKnown, readSession, sha256, verifyTotp, writeSession } from "./app-state";
import { PAGE_META, buildSearchResults, cn, defaultContextForPage, pageFromPath, routeForPage, type ContextState, type PageKey, type SearchResult, type Tone } from "./types";

const AUTH_BYPASS = false;

/* ─── Loading ─── */
function LoadingShell() {
  return (
    <div className="loading-shell">
      <div className="loading-sidebar">
        <div className="loading-block loading-block-lg" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="loading-block loading-block-md" key={i} />
        ))}
      </div>
      <div className="loading-main">
        <div className="loading-block loading-block-lg" />
        <div className="loading-block" style={{ height: 200, width: "100%", marginTop: 16 }} />
      </div>
    </div>
  );
}

/* ─── Error ─── */
function ErrorShell({ message }: { message: string }) {
  return (
    <div className="error-shell">
      <div className="error-content">
        <div className="error-title">Unable to load Command Center</div>
        <div className="error-detail">{message}</div>
      </div>
    </div>
  );
}

/* ─── Lock Screen ─── */
function LockScreen({
  password,
  setPassword,
  onUnlock,
  error,
  currentTime,
  step,
  totpCode,
  setTotpCode,
  onBack,
}: {
  password: string;
  setPassword: (v: string) => void;
  onUnlock: () => void;
  error: string;
  reason: string;
  currentTime: string;
  step: "password" | "totp";
  totpCode: string;
  setTotpCode: (v: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="hero-bg" style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "#06060a",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes lockRotate   { to { transform: rotate(360deg); } }
        @keyframes lockRotateCCW{ to { transform: rotate(-360deg); } }
        @keyframes lockPulse    { 0%,100%{opacity:.55;transform:scale(1);}50%{opacity:1;transform:scale(1.06);} }
        @keyframes lockGlow     { 0%,100%{box-shadow:0 0 60px #e0353522,0 0 120px #e0353510;}50%{box-shadow:0 0 100px #e0353540,0 0 200px #e0353520;} }
        @keyframes lockFadeUp   { from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);} }
        @keyframes lockScan     { 0%{top:-2px;opacity:0;}8%{opacity:1;}92%{opacity:1;}100%{top:100%;opacity:0;} }
        @keyframes lockBlink    { 0%,100%{opacity:1;}50%{opacity:.3;} }
        @keyframes lockNodePop  { 0%,100%{r:2;opacity:.5;}50%{r:3.5;opacity:1;} }
        .lock-input {
          width: 100%; padding: 13px 18px; border-radius: 10px;
          background: rgba(255,255,255,.04); border: 1.5px solid rgba(224,53,53,.25);
          color: #f0f0f0; font-size: 15px; letter-spacing: .05em; outline: none;
          transition: border-color .2s, box-shadow .2s;
        }
        .lock-input:focus {
          border-color: #e03535;
          box-shadow: 0 0 0 3px rgba(224,53,53,.18), 0 0 20px rgba(224,53,53,.12);
        }
        .lock-input::placeholder { color: rgba(255,255,255,.25); }
        .lock-enter-btn {
          width: 100%; padding: 14px; border-radius: 10px; border: none; cursor: pointer;
          background: linear-gradient(135deg, #c42b2b 0%, #e03535 50%, #c42b2b 100%);
          background-size: 200% 100%; background-position: 100% 0;
          color: #fff; font-size: 14px; font-weight: 700; letter-spacing: .12em;
          transition: background-position .4s, box-shadow .2s, transform .1s;
          box-shadow: 0 4px 24px rgba(224,53,53,.35);
        }
        .lock-enter-btn:hover {
          background-position: 0% 0;
          box-shadow: 0 6px 36px rgba(224,53,53,.55);
          transform: translateY(-1px);
        }
        .lock-enter-btn:active { transform: translateY(0); }
      `}</style>

      {/* Atmospheric deep glow behind everything */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(224,53,53,.08) 0%, transparent 70%)",
        animation: "lockGlow 5s ease-in-out infinite",
      }} />

      {/* Outer orbit ring 1 */}
      <div style={{
        position: "absolute", width: 520, height: 520, borderRadius: "50%",
        border: "1px solid rgba(224,53,53,.08)",
        animation: "lockRotate 40s linear infinite",
        pointerEvents: "none",
      }}>
        {[0,60,120,180,240,300].map(deg => (
          <div key={deg} style={{
            position: "absolute", width: 5, height: 5, borderRadius: "50%",
            background: "#e03535", opacity: .35,
            top: `calc(50% + ${Math.sin(deg*Math.PI/180)*260}px - 2.5px)`,
            left: `calc(50% + ${Math.cos(deg*Math.PI/180)*260}px - 2.5px)`,
          }} />
        ))}
      </div>

      {/* Outer orbit ring 2 — counter */}
      <div style={{
        position: "absolute", width: 380, height: 380, borderRadius: "50%",
        border: "1px dashed rgba(224,53,53,.12)",
        animation: "lockRotateCCW 28s linear infinite",
        pointerEvents: "none",
      }}>
        {[45,135,225,315].map(deg => (
          <div key={deg} style={{
            position: "absolute", width: 4, height: 4, borderRadius: "50%",
            background: "#e03535", opacity: .5,
            top: `calc(50% + ${Math.sin(deg*Math.PI/180)*190}px - 2px)`,
            left: `calc(50% + ${Math.cos(deg*Math.PI/180)*190}px - 2px)`,
          }} />
        ))}
      </div>

      {/* Brand logo */}
      <div style={{ animation: "lockPulse 3.5s ease-in-out infinite", marginBottom: 22, position: "relative", zIndex: 1 }}>
        <img className="lock-logo" src="/assets/logo.png" alt="Task Enterprise LLC" />
      </div>

      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 8, animation: "lockFadeUp .8s ease both", position: "relative", zIndex: 1 }}>
        <div style={{
          fontSize: 24, fontWeight: 800, letterSpacing: ".22em",
          color: "#ffffff",
          textShadow: "0 0 20px rgba(224,53,53,.38)",
          textTransform: "uppercase",
          lineHeight: 1,
        }}>
          Command Center
        </div>
        <div style={{
          marginTop: 8, fontSize: 11, letterSpacing: ".35em", textTransform: "uppercase",
          color: "rgba(224,53,53,.72)", fontWeight: 600,
        }}>
          Secure Operator Access
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 36,
        animation: "lockFadeUp .8s .1s ease both",
        position: "relative", zIndex: 1,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "lockBlink 2.2s ease-in-out infinite" }} />
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", letterSpacing: ".1em" }}>SYSTEMS ONLINE</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.15)" }}>·</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)", letterSpacing: ".08em" }}>{currentTime}</span>
      </div>

      {/* Login card */}
      <ScaleIn>
      <div style={{
        width: "100%", maxWidth: 360, padding: "0 24px",
        animation: "lockFadeUp .8s .2s ease both",
        position: "relative", zIndex: 1,
      }}>
        {/* Scanning line effect inside the card area */}
        <div className="glass-card" style={{
          position: "relative", borderRadius: 14, overflow: "hidden",
          background: "rgba(255,255,255,.02)", border: "1px solid rgba(224,53,53,.15)",
          padding: "28px 24px",
          boxShadow: "0 0 40px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.04)",
        }}>
          <div style={{
            position: "absolute", left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(224,53,53,.4), transparent)",
            animation: "lockScan 4s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          {step === "password" ? (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: ".12em", color: "rgba(255,255,255,.35)", marginBottom: 8, textTransform: "uppercase" }}>
                Operator Access
              </div>
              <input
                id="mc-password"
                className="lock-input"
                type="password"
                autoFocus
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onUnlock(); }}
              />
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: ".12em", color: "rgba(255,255,255,.35)", marginBottom: 4, textTransform: "uppercase" }}>
                Two-Factor Authentication
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.2)", marginBottom: 10, letterSpacing: ".06em" }}>
                New device detected — enter your 6-digit code
              </div>
              <input
                className="lock-input"
                type="text"
                inputMode="numeric"
                autoFocus
                placeholder="000 000"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") onUnlock(); }}
                style={{ letterSpacing: ".3em", fontSize: 20, textAlign: "center" }}
              />
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: "#e03535", marginBottom: 12, letterSpacing: ".04em" }}>
              {error}
            </div>
          )}

          <button className="lock-enter-btn" onClick={onUnlock}>
            {step === "password" ? "ENTER" : "VERIFY"}
          </button>

          {step === "password" && !isKnownDevice() && (
            <button onClick={onBack} style={{
              width: "100%", marginTop: 10, padding: "10px", background: "none",
              border: "none", color: "rgba(255,255,255,.3)", fontSize: 12,
              cursor: "pointer", letterSpacing: ".06em",
            }}>← Back to 2FA</button>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, padding: "0 2px" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.2)", letterSpacing: ".08em" }}>AUTO-LOCK · 1 HR</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.2)", letterSpacing: ".05em" }}>v2.0</span>
        </div>
      </div>
      </ScaleIn>
    </div>
  );
}

/* ─── Page Router ─── */
function renderPage(page: PageKey, props: any) {
  switch (page) {
    case "home": return <HomePage {...props} />;
    case "leads-revenue": return <RevenueDashboardPage {...props} />;
    case "overview": return <OverviewPage {...props} />;
    case "agents": return <AgentsPage {...props} />;
    case "content": return <ContentPage {...props} />;
    case "approvals": return <ApprovalsPage {...props} />;
    case "voice": return <VoicePage {...props} />;
    case "messages": return <MessagesPage {...props} />;
    case "models": return <ModelsPage {...props} />;
    case "openclaw": return <OpenClawPage {...props} />;
    case "mcp": return <McpPage {...props} />;
    case "mcp-tools": return <McpToolsPage {...props} />;
    case "tool-store": return <ToolStorePage {...props} />;
    case "protocols": return <ProtocolsPage {...props} />;
    case "monitoring": return <MonitoringPage {...props} />;
    case "projects": return <ProjectsPage {...props} />;
    case "memories": return <MemoriesPage {...props} />;
    case "claude-mem": return <ClaudeMemPage {...props} />;
    case "docs": return <DocsPage {...props} />;
    case "team": return <TeamPage {...props} />;
    case "office": return <OfficePage {...props} />;
    case "notes": return <NotesPage {...props} />;
    case "calendar": return <CalendarPage {...props} />;
    case "tasks": return <TasksPage {...props} />;
    case "logs": return <CortexPage {...props} />;
    case "integrations": return <IntegrationsPage {...props} />;
    case "settings": return <SettingsPage {...props} />;
    default: return <HomePage {...props} />;
  }
}

/* Pages that show the right rail */
const RAIL_PAGES = new Set<PageKey>([
  "mcp-tools", "tool-store", "logs", "tasks", "projects", "integrations",
]);

function syncContext(current: ContextState, page: PageKey, data: any): ContextState {
  if (!current) return defaultContextForPage(page, data);
  const { type, item } = current;
  const lookup: Record<string, { list: any[]; key: string }> = {
    agent: { list: data.agents, key: "id" },
    voice: { list: data.voice.agents, key: "id" },
    model: { list: data.models.catalog, key: "id" },
    tool: { list: data.tools.tools, key: "id" },
    "store-tool": { list: data.toolStore.inventory, key: "id" },
    protocol: { list: data.protocols, key: "id" },
    project: { list: data.projects.items, key: "id" },
    memory: { list: data.memory.vaults, key: "id" },
    doc: { list: data.docs.items, key: "id" },
    team: { list: data.team.units, key: "id" },
    office: { list: data.office.zones, key: "id" },
    note: { list: data.notes.items, key: "id" },
    "calendar-event": { list: data.calendar.events, key: "id" },
    task: { list: data.tasks.tasks, key: "id" },
    log: { list: data.logs.events, key: "id" },
    integration: { list: data.integrations.integrations, key: "id" },
    "setting-section": { list: data.settings.sections, key: "id" },
  };
  const spec = lookup[type];
  if (spec) {
    const found = spec.list.find((e: any) => e[spec.key] === item?.[spec.key]);
    return { type, item: found || spec.list[0] };
  }
  if (type === "mcp") return { type, item: data.mcp };
  if (type === "openclaw") return { type, item: data.openclaw };
  if (type === "workspace") return { type, item: data.workspace };
  return defaultContextForPage(page, data);
}

/* ─── App ─── */
export function App() {
  const [page, setPage] = useState<PageKey>(() => pageFromPath(window.location.pathname));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [context, setContext] = useState<ContextState>(null);
  const [search, setSearch] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [operatorFeed, setOperatorFeed] = useState<any[]>([]);
  const [authReady, setAuthReady] = useState(AUTH_BYPASS);
  const [unlocked, setUnlocked] = useState(AUTH_BYPASS);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [lockReason, setLockReason] = useState("Enter the operator password to access Command Center.");
  const [lockStep, setLockStep] = useState<"password" | "totp">(() => isKnownDevice() ? "password" : "totp");
  const [totpCode, setTotpCode] = useState("");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ agentId: string; agentName: string; message: string } | null>(null);
  const ringtoneRef = useRef<{ stop: () => void } | null>(null);
  const voiceActiveRef = useRef(false);
  const [voiceInlineQueue, setVoiceInlineQueue] = useState<Array<{ agentId: string; agentName: string; message: string }>>([]);

  const deferredSearch = useDeferredValue(search);
  const lastActiveRef = useRef(Date.now());
  const sessionUnlockedAtRef = useRef(Date.now());

  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (AUTH_BYPASS) {
      setUnlocked(true);
      setAuthReady(true);
      return;
    }
    const existing = readSession();
    if (existing && Date.now() - existing.lastActiveAt < LOCK_TIMEOUT_MS) {
      sessionUnlockedAtRef.current = existing.unlockedAt || existing.lastActiveAt;
      lastActiveRef.current = existing.lastActiveAt;
      setUnlocked(true);
    } else {
      clearSession();
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    const sync = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => { document.title = `Command Center — ${PAGE_META[page].title}`; }, [page]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/command-center");
        if (!r.ok) throw new Error(`Status ${r.status}`);
        const payload = await r.json();
        if (!cancelled) {
          setData(payload);
          setContext(defaultContextForPage(pageFromPath(window.location.pathname), payload));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (data) setContext((c) => syncContext(c, page, data)); }, [data, page]);

  const appendTraceEvent = (event: any) => {
    if (!event?.id) return;
    setOperatorFeed((cur) => {
      if (cur.some((e) => e.id === event.id)) return cur;
      return [{ id: event.id, title: event.title, detail: event.detail, level: event.level, timestamp: event.timestamp }, ...cur];
    });
  };

  const pushEvent = (title: string, detail: string, level: Tone = "info") => {
    setOperatorFeed((cur) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, detail, level, timestamp: new Date().toISOString() },
      ...cur,
    ]);
  };

  const refreshPayload = async () => {
    const r = await fetch("/api/command-center");
    if (!r.ok) throw new Error(`Status ${r.status}`);
    const payload = await r.json();
    setData(payload);
    return payload;
  };

  const performAction = async (action: string, payload: Record<string, any> = {}) => {
    const r = await fetch("/api/mission-control/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await r.json().catch(() => null);
    if (!r.ok || !result?.success) {
      const msg = result?.error || `Action failed (${r.status})`;
      pushEvent("Action failed", msg, "error");
      throw new Error(msg);
    }
    if (result.event) appendTraceEvent(result.event);
    if (result.payload) setData(result.payload);
    return result.result;
  };

  const lockWorkspace = (reason = "Command Center locked.") => {
    if (AUTH_BYPASS) return;
    clearSession();
    setUnlocked(false);
    setPassword("");
    setAuthError("");
    setLockReason(reason);
  };

  // Auto-lock after inactivity
  useEffect(() => {
    if (!unlocked) return;
    let lastPersist = 0;
    const touch = () => {
      const now = Date.now();
      lastActiveRef.current = now;
      if (now - lastPersist > 15_000) {
        lastPersist = now;
        writeSession({ unlockedAt: sessionUnlockedAtRef.current, lastActiveAt: now });
      }
    };
    const interval = setInterval(() => {
      if (Date.now() - lastActiveRef.current >= LOCK_TIMEOUT_MS) lockWorkspace("Locked after inactivity.");
    }, 60_000);
    const events: Array<keyof WindowEventMap> = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    touch();
    return () => { clearInterval(interval); events.forEach((e) => window.removeEventListener(e, touch)); };
  }, [unlocked]);

  // SSE stream — handles mission-control events + agent incoming calls, auto-reconnects
  useEffect(() => {
    if (!unlocked) return;
    let stream: EventSource | null = null;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let dead = false;

    function connect() {
      if (dead) return;
      stream = new EventSource("/api/mission-control/events/stream");
      stream.onmessage = (e) => {
        retryDelay = 1000;
        try {
          const parsed = JSON.parse(e.data);
          if (parsed?.type === "connected") return;
          if (parsed?.type === "agent_incoming_call") {
            if (voiceActiveRef.current) {
              // User is on an active call — queue inline instead of ringing
              setVoiceInlineQueue(q => [...q, { agentId: parsed.agentId, agentName: parsed.agentName, message: parsed.message }]);
            } else {
              setIncomingCall({ agentId: parsed.agentId, agentName: parsed.agentName, message: parsed.message });
            }
            return;
          }
          appendTraceEvent(parsed);
          void refreshPayload().catch(() => undefined);
        } catch { /* ignore */ }
      };
      stream.onerror = () => {
        stream?.close();
        if (!dead) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30000);
            connect();
          }, retryDelay);
        }
      };
    }

    connect();
    return () => {
      dead = true;
      if (retryTimer) clearTimeout(retryTimer);
      stream?.close();
    };
  }, [unlocked]);

  // Ringtone — plays while incomingCall is active
  useEffect(() => {
    if (!incomingCall) {
      ringtoneRef.current?.stop();
      ringtoneRef.current = null;
      return;
    }
    let alive = true;
    const ctx = new AudioContext();
    async function ring() {
      await ctx.resume(); // needed when no prior user gesture
      while (alive) {
        for (let i = 0; i < 2 && alive; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.value = i === 0 ? 880 : 1100;
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.04);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.38);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
          await new Promise(r => setTimeout(r, 430));
        }
        await new Promise(r => setTimeout(r, 1600));
      }
    }
    ring();
    ringtoneRef.current = { stop: () => { alive = false; ctx.close().catch(() => {}); } };
    return () => { ringtoneRef.current?.stop(); };
  }, [!!incomingCall]);

  // Spacebar answers the call
  useEffect(() => {
    if (!incomingCall) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (!e.target || (e.target as HTMLElement).tagName !== "INPUT")) {
        e.preventDefault();
        ringtoneRef.current?.stop();
        setIncomingCall(null);
        openRoute("/messages");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [incomingCall]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!unlocked) return;
    const t = setInterval(() => { void refreshPayload().catch(() => undefined); }, 60_000);
    return () => clearInterval(t);
  }, [unlocked]);

  const openRoute = (route: string, nextContext?: ContextState) => {
    if (/^(https?:\/\/|mailto:|tel:)/i.test(route)) {
      window.open(route, "_blank", "noopener,noreferrer");
      return;
    }
    const nextPage = pageFromPath(route);
    if (window.location.pathname !== route) window.history.pushState({ page: nextPage }, "", route);
    startTransition(() => {
      setPage(nextPage);
      if (nextContext) setContext(nextContext);
      else if (data) setContext(defaultContextForPage(nextPage, data));
    });
    setSearch("");
    if (isMobile) setMobileSidebarOpen(false);
  };

  const focus = (type: string, item: any) => {
    setContext({ type, item });
  };

  const openResult = (result: SearchResult) => {
    openRoute(result.route, { type: result.type, item: result.item });
  };

  const actions = {
    lockWorkspace: () => lockWorkspace("Locked by operator."),
    syncWorkspace: () => performAction("sync-workspace"),
    pauseOperations: () => performAction("pause-operations"),
    executeQuickAction: (id: string, label: string) => performAction("execute-quick-action", { actionId: id, label }),
    runSystemDiagnostic: () => performAction("run-system-diagnostic"),
    setAgentStatus: (agentId: string, status: string) => performAction("set-agent-status", { agentId, status }),
    restartAgent: (agentId: string) => performAction("restart-agent", { agentId }),
    assignPrimaryModel: (agentId: string, modelId: string) => performAction("assign-model", { agentId, modelId, field: "currentModel" }),
    assignFallbackModel: (agentId: string, modelId: string) => performAction("assign-model", { agentId, modelId, field: "backupModel" }),
    connectVoiceAgent: (agentId: string) => performAction("connect-voice-agent", { agentId }),
    disconnectVoiceAgent: (agentId: string) => performAction("disconnect-voice-agent", { agentId }),
    restartGateway: () => performAction("restart-gateway"),
    reconnectOpenClaw: () => performAction("reconnect-openclaw"),
    runMcpHealthCheck: () => performAction("run-mcp-health-check"),
    setMcpTransportState: (transport: "http" | "stdio", state: string) => performAction("set-mcp-transport-state", { transport, state }),
    setProtocolState: (protocolId: string, state: string) => performAction("set-protocol-state", { protocolId, state }),
    toggleTool: (toolId: string) => performAction("toggle-tool", { toolId }),
    testTool: (toolId: string) => performAction("test-tool", { toolId }),
    configureStoreTool: (toolId: string, credentials: Record<string, string>) => performAction("configure-store-tool", { toolId, credentials }),
    validateStoreTool: (toolId: string, credentials: Record<string, string>, requiredFields: string[]) => performAction("validate-store-tool", { toolId, credentials, requiredFields }),
    installStoreTool: (toolId: string, credentials: Record<string, string>, requiredFields: string[]) => performAction("install-store-tool", { toolId, credentials, requiredFields }),
    testStoreTool: (toolId: string, credentials: Record<string, string>, requiredFields: string[]) => performAction("test-store-tool", { toolId, credentials, requiredFields }),
    calendarSyncGoogle: (calendarId = "primary") => performAction("calendar-sync-google", { calendarId }),
    calendarCreateEvent: (payload: any) => performAction("calendar-create-event", payload),
    calendarUpdateEvent: (payload: any) => performAction("calendar-update-event", payload),
    setTaskApproval: (taskId: string, decision: string, reason = "") => performAction("set-task-approval", { taskId, decision, reason }),
    searchMemory: (query: string) => performAction("search-memory", { query }),
    openProjectSurface: (name: string, target: string) => performAction("open-project-surface", { projectName: name, target }),
    openDocSurface: (title: string, action: string) => performAction("open-doc-surface", { docTitle: title, docAction: action }),
    testIntegration: (id: string) => performAction("test-integration", { integrationId: id }),
    sendVoicePrompt: (agentId: string, prompt: string) => performAction("send-voice-prompt", { agentId, prompt }),
    saveNote: (noteId: string, body: string) => performAction("save-note", { noteId, body }),
    pinNote: (noteId: string, pinned: boolean) => performAction("pin-note", { noteId, pinned }),
    createNote: (title: string, body: string, folder: string) => performAction("create-note", { title, body, folder }),
    createTask: (payload: any) => performAction("create-task", payload),
    createCalendarEvent: (payload: any) => performAction("calendar-create-event", payload),
    notionOperatorSync: (projectId: string) => performAction("notion-operator-sync", { projectId }),
    // Voice conference / inline queue
    setVoiceActive: (active: boolean) => { voiceActiveRef.current = active; },
    voiceInlineQueue,
    dismissVoiceInline: (agentId: string) => setVoiceInlineQueue(q => q.filter(x => x.agentId !== agentId)),
  };

  const traceFeed = useMemo(() => {
    if (!data) return operatorFeed;
    return operatorFeed.concat(
      data.logs.events.slice(0, 5).map((e: any) => ({
        id: `seed-${e.id}`, title: e.summary, detail: e.detail, level: e.level, timestamp: e.timestamp,
      }))
    );
  }, [data, operatorFeed]);

  const searchResults = useMemo(() => (data ? buildSearchResults(data, deferredSearch) : []), [data, deferredSearch]);

  if (!authReady || loading) return <LoadingShell />;
  if (error || !data) return <ErrorShell message={error || "Payload unavailable."} />;

  const currentTime = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: data.workspace.timezone, timeZoneName: "short",
  }).format(new Date(clock));

  if (!AUTH_BYPASS && !unlocked) {
    return (
      <LockScreen
        password={password}
        setPassword={setPassword}
        error={authError}
        reason={lockReason}
        currentTime={currentTime}
        step={lockStep}
        totpCode={totpCode}
        setTotpCode={setTotpCode}
        onBack={() => { setLockStep("totp"); setAuthError(""); setPassword(""); }}
        onUnlock={async () => {
          setAuthError("");
          try {
            if (lockStep === "password") {
              let valid = false;
              if (globalThis.crypto?.subtle) {
                const digest = await sha256(password);
                valid = digest === PASSWORD_HASH;
              } else {
                valid = password === PASSWORD_PLAIN;
              }
              if (!valid) { setAuthError("Incorrect password."); return; }
            } else {
              // TOTP first for new devices
              const valid = await verifyTotp(totpCode.trim());
              if (!valid) { setAuthError("Invalid code. Try again."); setTotpCode(""); return; }
              markDeviceKnown();
              // Now go to password step
              setLockStep("password");
              setTotpCode("");
              return;
            }
            const now = Date.now();
            sessionUnlockedAtRef.current = now;
            lastActiveRef.current = now;
            writeSession({ unlockedAt: now, lastActiveAt: now });
            setUnlocked(true);
            setPassword("");
            setTotpCode("");
            setLockStep(isKnownDevice() ? "password" : "totp");
            setLockReason("");
          } catch {
            setAuthError("Unlock failed. Refresh and try again.");
          }
        }}
      />
    );
  }

  const showRail = RAIL_PAGES.has(page);
  const meta = PAGE_META[page];

  return (
    <div className="app-shell">
      <TopNav
        currentPage={page}
        onNavigate={(p) => openRoute(routeForPage(p))}
        systemHealth={data.summary.overallHealth}
        onSearchOpen={() => setSearch("")}
        onLock={() => lockWorkspace("Locked by operator.")}
      />
      <BackendProofBar>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <input
            className="field field-sm"
            style={{ width: 200, height: 18, fontSize: 10, padding: "0 8px" }}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <SearchOverlay results={searchResults} openResult={openResult} />
          <StatusBadge value={`${data.summary.overallHealth}% health`} />
          <span className="text-xs text-3">{currentTime}</span>
          <h1 className="workspace-title" style={{ fontSize: 11, margin: 0, letterSpacing: ".04em" }}>{meta.title}</h1>
          <span className="text-xs text-3" style={{ opacity: 0.6 }}>{meta.description}</span>
        </div>
      </BackendProofBar>

      <div className="app-shell-body">
        <div className="app-workspace">
          <AnimatePresence mode="wait">
            <PageTransition key={page}>
              {renderPage(page, { data, context, focus, openRoute, actions })}
            </PageTransition>
          </AnimatePresence>
        </div>

        {showRail ? (
          <FadeUp key={`rail-${page}`}>
            <Rail context={context} openRoute={openRoute} traceFeed={traceFeed} data={data} />
          </FadeUp>
        ) : null}
      </div>

      {incomingCall && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, width: 320,
          animation: "slideDown 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          <style>{`
            @keyframes slideDown { from { opacity:0; transform:translateX(-50%) translateY(-24px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
            @keyframes ringPulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.4)} 50%{box-shadow:0 0 0 8px rgba(220,38,38,0)} }
          `}</style>
          <ScaleIn>
          <div style={{
            background: "#111118", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, overflow: "hidden",
            boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(220,38,38,0.15)",
            padding: "14px 16px", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", background: "#1a1a24",
              border: "2px solid rgba(220,38,38,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, flexShrink: 0,
              animation: "ringPulse 1.4s ease-in-out infinite",
            }}>
              {({ abdi:"👑", dame:"💻", prime:"📈", rex:"🛡️", atlas:"🔗", ayub:"⚙️", ahmed:"📊", sygma:"✅" } as Record<string,string>)[incomingCall.agentId] ?? "📞"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: "0.08em", textTransform: "uppercase" }}>Incoming Call</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{incomingCall.agentName}</div>
              <div style={{ fontSize: 11, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{incomingCall.message}</div>
            </div>
            <button
              onClick={() => { ringtoneRef.current?.stop(); setIncomingCall(null); openRoute("/messages"); }}
              style={{
                flexShrink: 0, background: "#22c55e", border: "none", borderRadius: 10,
                padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff",
                cursor: "pointer", transition: "opacity .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >Answer</button>
          </div>
          </ScaleIn>
        </div>
      )}
    </div>
  );
}
