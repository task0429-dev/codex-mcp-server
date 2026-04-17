import { useDeferredValue, useMemo, useState } from "react";
import { Btn, StatusBadge } from "./shell";
import { GroupCommandCard } from "./monitoring-cards";
import { AlertRibbon, CommandHeader, KpiStrip } from "./monitoring-header";
import { RightConsole } from "./monitoring-console";
import { HeartbeatDiagnosticsPanel, RexCopilot, generateRexResponse } from "./monitoring-rex";
import {
  ALERTS,
  GROUPS,
  HEARTBEAT_JOBS,
  INCIDENTS,
  type ActionId,
  type Alert,
  type MonitorGroup,
  type RexMessage,
} from "./data-monitoring";

type MonitorSurfaceKey = "command" | "private" | "public";

const PUBLIC_MONITOR_URL = "https://proposal-breed-consecutive-data.trycloudflare.com";

function buildLocalMonitorUrl(port: number) {
  return `http://127.0.0.1:${port}`;
}

const SURFACES: Array<{
  key: MonitorSurfaceKey;
  label: string;
  title: string;
  description: string;
  port?: number;
}> = [
  {
    key: "command",
    label: "Monitor",
    title: "Mission Control Monitor Tab",
    description: "C2-native command zone with monitor groups, incidents, heartbeat diagnostics, and Rex triage.",
  },
  {
    key: "private",
    label: "Private",
    title: "Private Monitoring Console",
    description: "Native Uptime Kuma surface for private administration and monitor management.",
    port: 3011,
  },
  {
    key: "public",
    label: "Public",
    title: "Public Monitoring Surface",
    description: "Themed monitoring view for operator display and public-facing infrastructure review.",
  },
];

function buildSurfaceMap() {
  return Object.fromEntries(
    SURFACES.map((surface) => {
      const url =
        surface.key === "private"
          ? buildLocalMonitorUrl(surface.port ?? 3011)
          : surface.key === "public"
            ? PUBLIC_MONITOR_URL
            : "";
      return [surface.key, { ...surface, url }];
    })
  ) as Record<MonitorSurfaceKey, (typeof SURFACES)[number] & { url: string }>;
}

function MonitoringCommandTab() {
  const [groupSearch, setGroupSearch] = useState("");
  const deferredSearch = useDeferredValue(groupSearch);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>(ALERTS);
  const [liveMode, setLiveMode] = useState(true);
  const [lastSync, setLastSync] = useState(() => new Date().toISOString());
  const [actionStates, setActionStates] = useState<Record<string, "idle" | "running" | "success" | "error">>({});
  const [rexContext, setRexContext] = useState<string | null>(null);
  const [rexTyping, setRexTyping] = useState(false);
  const [rexMessages, setRexMessages] = useState<RexMessage[]>([]);

  const filteredGroups = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return GROUPS;
    return GROUPS.filter((group) => {
      const matchesGroup = `${group.displayName} ${group.name}`.toLowerCase().includes(query);
      const matchesConnection = group.connections.some((connection) =>
        `${connection.name} ${connection.endpoint} ${connection.tags.join(" ")}`.toLowerCase().includes(query)
      );
      return matchesGroup || matchesConnection;
    });
  }, [deferredSearch]);

  const visibleHeartbeatJobs = useMemo(() => {
    if (!deferredSearch.trim()) return HEARTBEAT_JOBS;
    const query = deferredSearch.trim().toLowerCase();
    return HEARTBEAT_JOBS.filter((job) => `${job.name} ${job.failureReason}`.toLowerCase().includes(query));
  }, [deferredSearch]);

  const selectedGroup =
    (selectedGroupId ? filteredGroups.find((group) => group.id === selectedGroupId) : null) ??
    (selectedGroupId ? GROUPS.find((group) => group.id === selectedGroupId) ?? null : null);

  function runAction(actionKey: string, durationMs = 900) {
    setActionStates((current) => ({ ...current, [actionKey]: "running" }));
    window.setTimeout(() => {
      setActionStates((current) => ({ ...current, [actionKey]: "success" }));
    }, durationMs);
    window.setTimeout(() => {
      setActionStates((current) => ({ ...current, [actionKey]: "idle" }));
    }, durationMs + 1200);
  }

  function openRex(context: string) {
    setRexContext(context);
  }

  function handleRexSend(prompt: string) {
    const userMessage: RexMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    setRexMessages((current) => [...current, userMessage]);
    setRexTyping(true);

    const context = rexContext ?? "Global monitoring command context";
    window.setTimeout(() => {
      const reply: RexMessage = {
        id: `rex-${Date.now()}`,
        role: "rex",
        content: generateRexResponse(context, prompt),
        timestamp: new Date().toISOString(),
      };
      setRexMessages((current) => [...current, reply]);
      setRexTyping(false);
    }, 700);
  }

  function handleGlobalAction(action: string) {
    setLastSync(new Date().toISOString());
    if (action === "reconnect") {
      openRex("Reconnect failed services across the monitoring grid.");
    }
    if (action === "health-check") {
      openRex("Run a full health scan across current monitor groups.");
    }
  }

  function handleGroupAction(groupId: string, action: ActionId) {
    const group = GROUPS.find((candidate) => candidate.id === groupId);
    if (!group) return;

    if (action === "ask-rex") {
      openRex(`${group.displayName} group diagnostics`);
      return;
    }

    const actionKey = `${groupId}-${action === "run-diagnostics" ? "diag" : action}`;
    runAction(actionKey);
    setLastSync(new Date().toISOString());

    if (action === "run-diagnostics" || action === "restart") {
      openRex(`${group.displayName} — ${action === "restart" ? "restart flow requested" : "diagnostics requested"}`);
    }
  }

  function handleConnectionAction(connectionId: string, action: ActionId) {
    const actionKey = `${connectionId}-${action}`;
    runAction(actionKey, action === "run-diagnostics" ? 1400 : 800);
    setLastSync(new Date().toISOString());

    const group = GROUPS.find((candidate) => candidate.connections.some((connection) => connection.id === connectionId));
    const connection = group?.connections.find((candidate) => candidate.id === connectionId);
    if (!connection) return;

    if (action === "ask-rex" || action === "run-diagnostics") {
      openRex(`${connection.name} — ${connection.failureReason ?? "Deep service analysis requested."}`);
    }
  }

  return (
    <div className="rzm-page">
      <CommandHeader
        groups={GROUPS}
        alerts={alerts}
        incidents={INCIDENTS}
        onAction={handleGlobalAction}
        liveMode={liveMode}
        onToggleLive={() => setLiveMode((current) => !current)}
        lastSync={lastSync}
      />

      <AlertRibbon alerts={alerts} onDismiss={(id) => setAlerts((current) => current.filter((alert) => alert.id !== id))} />
      <KpiStrip groups={GROUPS} incidents={INCIDENTS} />

      <div className="rzm-body">
        <div className="rzm-grid-area">
          <div className="rzm-grid-controls">
            <input
              className="rzm-search"
              placeholder="Search groups, services, endpoints, or tags..."
              value={groupSearch}
              onChange={(event) => setGroupSearch(event.target.value)}
            />
            <div className="monitor-embed-actions">
              <Btn
                variant="secondary"
                onClick={() => window.open(buildLocalMonitorUrl(3011), "_blank", "noopener,noreferrer")}
              >
                Open Private
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => window.open(PUBLIC_MONITOR_URL, "_blank", "noopener,noreferrer")}
              >
                Open Public
              </Btn>
            </div>
          </div>

          <div className="rzm-grid">
            {filteredGroups.map((group: MonitorGroup) => (
              <GroupCommandCard
                key={group.id}
                group={group}
                selected={selectedGroupId === group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setSelectedConnectionId(null);
                }}
                onAction={handleGroupAction}
                actionState={actionStates}
              />
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <HeartbeatDiagnosticsPanel
              jobs={visibleHeartbeatJobs}
              connections={GROUPS.flatMap((group) => group.connections)}
            />
          </div>
        </div>

        <div className="rzm-console-area">
          {rexContext ? (
            <RexCopilot
              messages={rexMessages}
              context={rexContext}
              onSend={handleRexSend}
              isTyping={rexTyping}
              quickPrompts={["Why is this failing?", "Suggest recovery", "What changed recently?"]}
              onClose={() => setRexContext(null)}
            />
          ) : (
            <RightConsole
              groups={GROUPS}
              incidents={INCIDENTS}
              alerts={alerts}
              heartbeatJobs={HEARTBEAT_JOBS}
              selectedGroupId={selectedGroup?.id ?? null}
              selectedConnectionId={selectedConnectionId}
              onSelectConnection={(id) => setSelectedConnectionId(id || null)}
              onAction={handleConnectionAction}
              actionStates={actionStates}
              onOpenRex={openRex}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function MonitoringPage() {
  const [activeSurface, setActiveSurface] = useState<MonitorSurfaceKey>("command");

  const surfaceMap = useMemo(() => buildSurfaceMap(), []);
  const active = surfaceMap[activeSurface];

  if (activeSurface === "command") {
    return (
      <div className="monitor-embed-page" style={{ padding: 0 }}>
        <div className="monitor-embed-topbar" style={{ padding: "24px 24px 0" }}>
          <div>
            <div className="monitor-embed-kicker">Infrastructure</div>
            <h2 className="monitor-embed-title">{active.title}</h2>
            <p className="monitor-embed-subtitle">{active.description}</p>
          </div>

          <div className="monitor-embed-meta">
            <StatusBadge value="c2 native tab" />
            <StatusBadge value="monitor groups live" />
          </div>
        </div>

        <div className="monitor-embed-toolbar" style={{ padding: "0 24px 20px" }}>
          <div className="segmented">
            {SURFACES.map((surface) => (
              <button
                key={surface.key}
                className={`segmented-btn ${activeSurface === surface.key ? "segmented-btn-active" : ""}`}
                onClick={() => setActiveSurface(surface.key)}
                type="button"
              >
                {surface.label}
              </button>
            ))}
          </div>

          <div className="monitor-embed-actions">
            <Btn variant="secondary" onClick={() => window.open(buildLocalMonitorUrl(3011), "_blank", "noopener,noreferrer")}>
              Open Private
            </Btn>
            <Btn variant="ghost" onClick={() => window.open(PUBLIC_MONITOR_URL, "_blank", "noopener,noreferrer")}>
              Open Public
            </Btn>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <MonitoringCommandTab />
        </div>
      </div>
    );
  }

  return (
    <div className="monitor-embed-page">
      <div className="monitor-embed-topbar">
        <div>
          <div className="monitor-embed-kicker">Infrastructure</div>
          <h2 className="monitor-embed-title">{active.title}</h2>
          <p className="monitor-embed-subtitle">{active.description}</p>
        </div>

        <div className="monitor-embed-meta">
          <StatusBadge value={activeSurface === "private" ? "private kuma" : "public c2"} />
          <StatusBadge value={activeSurface === "private" ? "127.0.0.1:3011" : "cloudflare tunnel"} />
        </div>
      </div>

      <div className="monitor-embed-toolbar">
        <div className="segmented">
          {SURFACES.map((surface) => (
            <button
              key={surface.key}
              className={`segmented-btn ${activeSurface === surface.key ? "segmented-btn-active" : ""}`}
              onClick={() => setActiveSurface(surface.key)}
              type="button"
            >
              {surface.label}
            </button>
          ))}
        </div>

        <div className="monitor-embed-actions">
          <Btn variant="secondary" onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}>
            Open {active.label}
          </Btn>
          <Btn variant="ghost" onClick={() => window.location.reload()}>
            Refresh Shell
          </Btn>
        </div>
      </div>

      <div className="monitor-embed-card">
        <iframe
          key={active.key}
          className="monitor-embed-frame"
          src={active.url}
          title={active.title}
          loading="lazy"
        />
      </div>

      <div className="monitor-embed-footer">
        <span>If the embedded surface is blocked or blank, use</span>
        <button
          className="monitor-embed-link"
          onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}
          type="button"
        >
          {active.url}
        </button>
      </div>
    </div>
  );
}
