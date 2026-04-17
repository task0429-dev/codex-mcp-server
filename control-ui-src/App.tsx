import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AgentsPage, HomePage, MessagesPage, ModelsPage, OverviewPage } from "./pages-core";
import { VoicePage } from "./pages-voice-realtime";
import { McpPage, McpToolsPage, OpenClawPage, ProtocolsPage, ToolStorePage } from "./pages-infra";
import { MonitoringPage } from "./pages-monitoring";
import { ContentPage, DocsPage, MemoriesPage, OfficePage, TeamPage } from "./pages-knowledge";
import { ApprovalsPage, CalendarPage, IntegrationsPage, LogsPage, NotesPage, ProjectsPage, SettingsPage, TasksPage } from "./pages-ops";
import { CortexPage } from "./pages-cortex";
import { Btn, Rail, SearchOverlay, Sidebar, StatusBadge } from "./shell";
import { LOCK_TIMEOUT_MS, PASSWORD_HASH, clearSession, readSession, sha256, verifyTotp, writeSession } from "./app-state";
import { PAGE_META, buildSearchResults, cn, defaultContextForPage, pageFromPath, routeForPage, type ContextState, type PageKey, type SearchResult, type Tone } from "./types";

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
const AMBIENT_DOTS = [
  { top: "22%", left: "18%" }, { top: "18%", left: "72%" },
  { top: "44%", left: "8%"  }, { top: "38%", left: "88%" },
  { top: "68%", left: "14%" }, { top: "72%", left: "80%" },
  { top: "82%", left: "42%" }, { top: "14%", left: "48%" },
];

function LockScreen({
  onUnlock,
  error,
  setError,
  currentTime,
}: {
  onUnlock: () => void;
  error: string;
  setError: (v: string) => void;
  reason: string;
  currentTime: string;
}) {
  const [step, setStep] = useState<"password" | "totp">("password");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");

  const submitPassword = async () => {
    setError("");
    const digest = await sha256(password);
    if (digest !== PASSWORD_HASH) { setError("Incorrect password."); return; }
    setStep("totp");
  };

  const submitTotp = async () => {
    setError("");
    const valid = await verifyTotp(totpCode.trim());
    if (!valid) { setError("Invalid or expired code."); return; }
    onUnlock();
  };

  return (
    <div className="lock-screen">
      {AMBIENT_DOTS.map((pos, i) => (
        <span key={i} className="lock-dot" style={{ top: pos.top, left: pos.left }} />
      ))}

      {/* Logo */}
      <div className="lock-logo-wrap">
        <img src="/assets/logo.png" alt="Task Enterprise" className="lock-logo" />
        <div className="lock-brand-text">
          <div className="lock-brand-name">
            <span>TASK</span>
            <span>ENTERPRISE LLC</span>
          </div>
          <div className="lock-brand-tagline">Task Automated, Future Elevated</div>
        </div>
      </div>

      {/* Title */}
      <div className="lock-heading">Command Center</div>
      <div className="lock-heading-sub">Secure Operator Access</div>

      {/* Status */}
      <div className="lock-status-line">
        <span className="lock-status-dot" />
        <span>Systems Online &nbsp;·&nbsp; {currentTime}</span>
      </div>

      {/* Card */}
      <div className="lock-card">
        <div className="lock-card-label">{step === "password" ? "Operator Access" : "Two-Factor Auth"}</div>

        {step === "password" ? (
          <>
            <input
              className="lock-field"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submitPassword(); }}
            />
            {error ? <div className="lock-error">{error}</div> : null}
            <button className="lock-btn" onClick={() => void submitPassword()}>Enter</button>
          </>
        ) : (
          <>
            <input
              className="lock-field"
              type="text"
              autoFocus
              inputMode="numeric"
              placeholder="000 000"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") void submitTotp(); }}
            />
            {error ? <div className="lock-error">{error}</div> : null}
            <button className="lock-btn" onClick={() => void submitTotp()}>Verify</button>
            <button className="lock-btn-ghost" onClick={() => { setStep("password"); setError(""); setTotpCode(""); }}>Back</button>
          </>
        )}
      </div>

      <div className="lock-footer">
        <span>Auto-Lock · 1 HR</span>
        <span>v2.0</span>
      </div>
    </div>
  );
}

/* ─── Page Router ─── */
function renderPage(page: PageKey, props: any) {
  switch (page) {
    case "home": return <HomePage {...props} />;
    case "overview": return <OverviewPage {...props} />;
    case "agents": return <AgentsPage {...props} />;
    case "messages": return <MessagesPage {...props} />;
    case "content": return <ContentPage {...props} />;
    case "approvals": return <ApprovalsPage {...props} />;
    case "voice": return <VoicePage {...props} />;
    case "models": return <ModelsPage {...props} />;
    case "openclaw": return <OpenClawPage {...props} />;
    case "mcp": return <McpPage {...props} />;
    case "mcp-tools": return <McpToolsPage {...props} />;
    case "tool-store": return <ToolStorePage {...props} />;
    case "protocols": return <ProtocolsPage {...props} />;
    case "monitoring": return <MonitoringPage {...props} />;
    case "projects": return <ProjectsPage {...props} />;
    case "memories": return <MemoriesPage {...props} />;
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
  "agents", "mcp-tools", "tool-store", "tasks", "projects", "integrations",
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
  const [authReady, setAuthReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [lockReason, setLockReason] = useState("Enter your credentials to access Command Center.");

  const deferredSearch = useDeferredValue(search);
  const lastActiveRef = useRef(Date.now());
  const sessionUnlockedAtRef = useRef(Date.now());

  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
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
    clearSession();
    setUnlocked(false);
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

  // SSE stream
  useEffect(() => {
    if (!unlocked) return;
    const stream = new EventSource("/api/mission-control/events/stream");
    stream.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.type === "connected") return;
        appendTraceEvent(parsed);
        void refreshPayload().catch(() => undefined);
      } catch { /* ignore */ }
    };
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [unlocked]);

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

  if (!unlocked) {
    return (
      <LockScreen
        error={authError}
        setError={setAuthError}
        reason={lockReason}
        currentTime={currentTime}
        onUnlock={() => {
          const now = Date.now();
          sessionUnlockedAtRef.current = now;
          lastActiveRef.current = now;
          writeSession({ unlockedAt: now, lastActiveAt: now });
          setUnlocked(true);
          setLockReason("");
        }}
      />
    );
  }

  const showRail = RAIL_PAGES.has(page);
  // Pages that own their full layout — no workspace header, body fills remaining height
  const isFullBleed = page === "monitoring" || page === "logs";
  const meta = PAGE_META[page];

  return (
    <div className={cn("app-shell", showRail && "has-rail")}>
      <Sidebar currentPage={page} openPage={(p) => openRoute(routeForPage(p))} />

      <div className={cn("workspace", isFullBleed && "workspace-fullbleed")}>
        {!isFullBleed && (
          <div className="workspace-header">
            <div className="workspace-header-row">
              <div>
                <h1 className="workspace-title">{meta.title}</h1>
                <div className="workspace-subtitle">{meta.description}</div>
              </div>
              <div className="workspace-actions">
                <div style={{ position: "relative" }}>
                  <input
                    className="field field-sm"
                    style={{ width: 220 }}
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <SearchOverlay results={searchResults} openResult={openResult} />
                </div>
                <StatusBadge value={`${data.summary.overallHealth}% health`} />
                <span className="text-xs text-3">{currentTime}</span>
              </div>
            </div>
          </div>
        )}

        <div className={cn("workspace-body", isFullBleed && "workspace-body-fullbleed")}>
          {renderPage(page, { data, context, focus, openRoute, actions })}
        </div>
      </div>

      {showRail ? (
        <Rail context={context} openRoute={openRoute} traceFeed={traceFeed} data={data} />
      ) : null}
    </div>
  );
}
