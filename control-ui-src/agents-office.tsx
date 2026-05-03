import React, { useEffect, useMemo, useState } from "react";
import { AGENT_BG_COLORS as _BG_COLORS, AGENT_COLORS as _COLORS } from "./agent-constants";
import { AGENT_SVG } from "./agent-constants";

const VIRT_W = 1340;
const VIRT_H = 1560;
const SPEED = 220;
const ARRIVE = 10;
const FPS_MS = 28;

type TaskCategory = "command" | "build" | "research" | "communications" | "utility";
type StationId = "command-center" | "build-coding" | "research-analysis" | "communications-outreach" | "misc-utility";
type AgentStatus = "online" | "active" | "idle" | "standby" | "offline" | "blocked" | "warning" | "degraded";
type Facing = "left" | "right";

type Pt = { x: number; y: number };

type AgentTransitionState = {
  from: StationId;
  to: StationId;
  startedAt: string;
};

type AgentRecord = {
  id: string;
  name: string;
  role: string;
  specialty: string;
  status: AgentStatus;
  latestTask: string;
  currentProject?: { name: string; client: string; why: string };
  currentModel: string;
  backupModel: string;
  healthScore: number;
  uptime: string;
  toolAccess: string[];
  currentTaskCategory: TaskCategory;
  currentStation: StationId;
  stationReason: string;
  statusText: string;
  lastUpdated: string;
  transitionState?: AgentTransitionState;
  pos: Pt;
  target: Pt;
  isWalking: boolean;
  facing: Facing;
  interactionUntil?: number;
};

type SurfaceKind = "monitor" | "panel" | "desk" | "queue" | "feed";

type StationScene = {
  id: StationId;
  shortTitle: string;
  categoryLabel: string;
  purpose: string;
  icon: string;
  accent: string;
  glow: string;
  pos: Pt;
  size: { w: number; h: number };
  summaryCols: 2 | 3;
  surfaces: Array<{ x: number; y: number; w: number; h: number; kind: SurfaceKind }>;
  slots: Pt[];
};

const COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(_COLORS).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]),
);
const BODY_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(_BG_COLORS).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]),
);
const STATIONS: StationScene[] = [
  {
    id: "build-coding",
    shortTitle: "Build / Coding",
    categoryLabel: "Build",
    purpose: "Engineering execution, debugging, deployments, and integrations.",
    icon: "⌘",
    accent: "#e03535",
    glow: "rgba(224,53,53,.18)",
    pos: { x: 36, y: 40 },
    size: { w: 560, h: 390 },
    summaryCols: 1,
    surfaces: [
      { x: 34, y: 224, w: 178, h: 92, kind: "monitor" },
      { x: 236, y: 224, w: 178, h: 92, kind: "monitor" },
      { x: 34, y: 338, w: 380, h: 34, kind: "desk" },
    ],
    slots: [
      { x: 152, y: 348 },
      { x: 316, y: 348 },
      { x: 480, y: 348 },
      { x: 152, y: 414 },
      { x: 316, y: 414 },
      { x: 480, y: 414 },
    ],
  },
  {
    id: "research-analysis",
    shortTitle: "Research / Analysis",
    categoryLabel: "Research",
    purpose: "Investigation, diagnosis, documentation review, and intelligence gathering.",
    icon: "◌",
    accent: "#8bd7ff",
    glow: "rgba(139,215,255,.16)",
    pos: { x: 36, y: 490 },
    size: { w: 560, h: 350 },
    summaryCols: 1,
    surfaces: [
      { x: 34, y: 212, w: 178, h: 84, kind: "panel" },
      { x: 236, y: 212, w: 178, h: 84, kind: "monitor" },
      { x: 34, y: 314, w: 380, h: 30, kind: "desk" },
    ],
    slots: [
      { x: 152, y: 760 },
      { x: 316, y: 760 },
      { x: 480, y: 760 },
      { x: 152, y: 824 },
    ],
  },
  {
    id: "communications-outreach",
    shortTitle: "Communications / Outreach",
    categoryLabel: "Outreach",
    purpose: "Publishing, campaigns, client-facing messaging, and social operations.",
    icon: "✦",
    accent: "#f59e0b",
    glow: "rgba(245,158,11,.15)",
    pos: { x: 36, y: 900 },
    size: { w: 560, h: 350 },
    summaryCols: 1,
    surfaces: [
      { x: 34, y: 212, w: 178, h: 84, kind: "feed" },
      { x: 236, y: 212, w: 178, h: 84, kind: "feed" },
      { x: 34, y: 314, w: 380, h: 30, kind: "desk" },
    ],
    slots: [
      { x: 152, y: 1170 },
      { x: 316, y: 1170 },
      { x: 480, y: 1170 },
      { x: 152, y: 1234 },
    ],
  },
  {
    id: "command-center",
    shortTitle: "Command Center",
    categoryLabel: "Command",
    purpose: "Orchestration, prioritization, delegation, monitoring, and strategic control.",
    icon: "◈",
    accent: "#74d697",
    glow: "rgba(116,214,151,.18)",
    pos: { x: 644, y: 40 },
    size: { w: 660, h: 560 },
    summaryCols: 2,
    surfaces: [
      { x: 34, y: 242, w: 176, h: 106, kind: "monitor" },
      { x: 242, y: 242, w: 176, h: 106, kind: "monitor" },
      { x: 450, y: 242, w: 176, h: 106, kind: "monitor" },
      { x: 58, y: 380, w: 512, h: 38, kind: "desk" },
    ],
    slots: [
      { x: 786, y: 500 },
      { x: 974, y: 500 },
      { x: 1162, y: 500 },
      { x: 786, y: 576 },
      { x: 974, y: 576 },
      { x: 1162, y: 576 },
      { x: 786, y: 652 },
    ],
  },
  {
    id: "misc-utility",
    shortTitle: "Misc / Utility",
    categoryLabel: "Utility",
    purpose: "Admin, support, maintenance, transitional states, and general operations.",
    icon: "⋄",
    accent: "#9ca3af",
    glow: "rgba(156,163,175,.12)",
    pos: { x: 644, y: 680 },
    size: { w: 660, h: 570 },
    summaryCols: 1,
    surfaces: [
      { x: 34, y: 224, w: 178, h: 96, kind: "queue" },
      { x: 242, y: 224, w: 178, h: 96, kind: "panel" },
      { x: 450, y: 224, w: 176, h: 96, kind: "queue" },
      { x: 58, y: 348, w: 512, h: 36, kind: "desk" },
    ],
    slots: [
      { x: 786, y: 1128 },
      { x: 974, y: 1128 },
      { x: 1162, y: 1128 },
      { x: 786, y: 1210 },
      { x: 974, y: 1210 },
      { x: 1162, y: 1210 },
    ],
  },
];

const STATION_META = Object.fromEntries(STATIONS.map((station) => [station.id, station])) as Record<StationId, StationScene>;

function stationLabel(stationId: StationId) {
  return STATION_META[stationId]?.shortTitle || "Misc / Utility";
}

function categoryLabel(category: TaskCategory) {
  switch (category) {
    case "command":
      return "Command";
    case "build":
      return "Build";
    case "research":
      return "Research";
    case "communications":
      return "Communications";
    default:
      return "Utility";
  }
}

function compactTopic(agent: AgentRecord) {
  const raw = agent.statusText || agent.latestTask || agent.stationReason || "Standing by";
  return raw.length > 88 ? `${raw.slice(0, 85).trim()}...` : raw;
}

function projectLabel(agent: AgentRecord) {
  const project = agent.currentProject?.name?.trim();
  if (project) return project;
  const fallback = agent.statusText || agent.latestTask || "General Ops";
  return fallback.length > 42 ? `${fallback.slice(0, 39).trim()}...` : fallback;
}

function statusTone(agent: AgentRecord) {
  if (agent.status === "active") return "#22c55e";
  if (agent.status === "blocked") return "#ef4444";
  if (agent.status === "warning" || agent.status === "degraded") return "#f59e0b";
  return "#94a3b8";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function initialAgent(raw: any): AgentRecord {
  const station = STATION_META[(raw.currentStation || "misc-utility") as StationId] || STATION_META["misc-utility"];
  const slot = station.slots[0] || { x: station.pos.x + station.size.w / 2, y: station.pos.y + station.size.h - 28 };
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role || "",
    specialty: raw.specialty || "",
    status: (raw.status || "online") as AgentStatus,
    latestTask: raw.latestTask || "",
    currentProject: raw.currentProject,
    currentModel: raw.currentModel || "",
    backupModel: raw.backupModel || "",
    healthScore: raw.healthScore || 0,
    uptime: raw.uptime || "—",
    toolAccess: raw.toolAccess || [],
    currentTaskCategory: (raw.currentTaskCategory || "utility") as TaskCategory,
    currentStation: (raw.currentStation || "misc-utility") as StationId,
    stationReason: raw.stationReason || station.purpose,
    statusText: raw.statusText || raw.latestTask || station.purpose,
    lastUpdated: raw.lastUpdated || raw.currentWorkUpdatedAt || new Date().toISOString(),
    pos: slot,
    target: slot,
    isWalking: false,
    facing: "right",
  };
}

function preferredAgentOrder(agent: AgentRecord) {
  return agent.status === "active" ? 0 : agent.status === "online" ? 1 : agent.status === "warning" ? 2 : 3;
}

function fallbackSlot(station: StationScene, index: number): Pt {
  const columns = station.id === "command-center" ? 3 : 2;
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: station.pos.x + 114 + col * 102,
    y: station.pos.y + station.size.h - 86 + row * 78,
  };
}

function computeTargets(agents: AgentRecord[]) {
  const targets = new Map<string, Pt>();
  for (const station of STATIONS) {
    const grouped = agents
      .filter((agent) => agent.currentStation === station.id)
      .sort((a, b) => preferredAgentOrder(a) - preferredAgentOrder(b) || a.name.localeCompare(b.name));
    grouped.forEach((agent, index) => {
      targets.set(agent.id, station.slots[index] || fallbackSlot(station, index));
    });
  }
  return targets;
}

function reconcileAgents(prev: AgentRecord[], incoming: any[]) {
  const prevMap = new Map(prev.map((agent) => [agent.id, agent]));
  const merged = incoming.map((raw) => {
    const prior = prevMap.get(raw.id);
    const base = prior || initialAgent(raw);
    return {
      ...base,
      name: raw.name || base.name,
      role: raw.role || base.role,
      specialty: raw.specialty || base.specialty,
      status: (raw.status || base.status) as AgentStatus,
      latestTask: raw.latestTask || base.latestTask,
      currentProject: raw.currentProject || base.currentProject,
      currentModel: raw.currentModel || base.currentModel,
      backupModel: raw.backupModel || base.backupModel,
      healthScore: raw.healthScore ?? base.healthScore,
      uptime: raw.uptime || base.uptime,
      toolAccess: raw.toolAccess || base.toolAccess,
      currentTaskCategory: (raw.currentTaskCategory || base.currentTaskCategory) as TaskCategory,
      currentStation: (raw.currentStation || base.currentStation) as StationId,
      stationReason: raw.stationReason || base.stationReason,
      statusText: raw.statusText || raw.latestTask || base.statusText,
      lastUpdated: raw.lastUpdated || raw.currentWorkUpdatedAt || base.lastUpdated,
    };
  });

  const targets = computeTargets(merged);

  return merged.map((agent) => {
    const prior = prevMap.get(agent.id);
    const target = targets.get(agent.id) || agent.target;
    if (!prior) {
      return { ...agent, pos: target, target, isWalking: false };
    }

    const stationChanged = prior.currentStation !== agent.currentStation;
    const targetChanged = Math.abs(prior.target.x - target.x) > 1 || Math.abs(prior.target.y - target.y) > 1;

    return {
      ...agent,
      pos: prior.pos,
      target,
      isWalking: stationChanged || targetChanged ? true : prior.isWalking,
      facing: target.x >= prior.pos.x ? "right" : "left",
      interactionUntil: prior.interactionUntil,
      transitionState:
        stationChanged
          ? { from: prior.currentStation, to: agent.currentStation, startedAt: new Date().toISOString() }
          : prior.transitionState,
    };
  });
}

function tickAgents(prev: AgentRecord[]) {
  return prev.map((agent) => {
    if (!agent.isWalking) {
      if (agent.interactionUntil && agent.interactionUntil < Date.now()) {
        return { ...agent, interactionUntil: undefined };
      }
      return agent;
    }

    const dx = agent.target.x - agent.pos.x;
    const dy = agent.target.y - agent.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= ARRIVE) {
      return {
        ...agent,
        pos: agent.target,
        isWalking: false,
        transitionState: undefined,
      };
    }

    const step = Math.min((SPEED * FPS_MS) / 1000, dist);
    const ratio = step / dist;

    return {
      ...agent,
      pos: { x: agent.pos.x + dx * ratio, y: agent.pos.y + dy * ratio },
      facing: dx >= 0 ? "right" : "left",
    };
  });
}

function mergeEventPatch(prev: AgentRecord[], actorName: string, patch: Partial<AgentRecord>, targetName?: string) {
  const next = prev.map((agent) => {
    if (agent.name !== actorName && agent.name !== targetName) return agent;
    const isTarget = agent.name === targetName;
    return {
      ...agent,
      ...patch,
      currentStation: isTarget ? "command-center" : ((patch.currentStation || agent.currentStation) as StationId),
      currentTaskCategory: isTarget ? "command" : ((patch.currentTaskCategory || agent.currentTaskCategory) as TaskCategory),
      stationReason: isTarget ? "Active coordination routed this agent into the command layer." : (patch.stationReason || agent.stationReason),
      statusText: patch.statusText || patch.latestTask || agent.statusText,
      lastUpdated: patch.lastUpdated || new Date().toISOString(),
      interactionUntil: Date.now() + 2600,
    };
  });

  return reconcileAgents(prev, next);
}

function useStationEngine(initial: any[]) {
  const [agents, setAgents] = useState<AgentRecord[]>(() => reconcileAgents([], initial));

  useEffect(() => {
    const loop = setInterval(() => {
      setAgents((prev) => tickAgents(prev));
    }, FPS_MS);
    return () => clearInterval(loop);
  }, []);

  useEffect(() => {
    setAgents((prev) => reconcileAgents(prev, initial));
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/agents/live");
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!cancelled) {
          setAgents((prev) => reconcileAgents(prev, payload.agents || []));
        }
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/mission-control/events/stream");
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "connected") return;

        if (payload.type === "agent_status" || payload.type === "agent_task_complete") {
          setAgents((prev) =>
            mergeEventPatch(prev, payload.actor, {
              status: (payload.status || "online") as AgentStatus,
              latestTask: payload.latestTask,
              currentProject: payload.currentProject,
              currentTaskCategory: payload.currentTaskCategory,
              currentStation: payload.currentStation,
              stationReason: payload.stationReason,
              statusText: payload.statusText,
              lastUpdated: payload.lastUpdated,
            }),
          );
        }

        if (payload.type === "agent_interact") {
          setAgents((prev) =>
            mergeEventPatch(
              prev,
              payload.actor,
              {
                status: "active",
                latestTask: payload.detail || payload.title || "",
                currentTaskCategory: "command",
                currentStation: "command-center",
                stationReason: payload.stationReason || "Active coordination routed this agent into the command layer.",
                statusText: payload.statusText || payload.detail || payload.title || "",
                lastUpdated: payload.lastUpdated,
              },
              payload.targetActor,
            ),
          );
        }
      } catch {
        // ignore malformed events
      }
    };
    return () => es.close();
  }, []);

  return { agents };
}

function toPercentX(value: number) {
  return `${(value / VIRT_W) * 100}%`;
}

function toPercentY(value: number) {
  return `${(value / VIRT_H) * 100}%`;
}

function StationZone({
  station,
  occupancy,
}: {
  station: StationScene;
  occupancy: AgentRecord[];
}) {
  const localX = (value: number) => `${(value / station.size.w) * 100}%`;
  const localY = (value: number) => `${(value / station.size.h) * 100}%`;
  const topicAgents = occupancy
    .slice()
    .sort((a, b) => preferredAgentOrder(a) - preferredAgentOrder(b) || a.name.localeCompare(b.name))
    .slice(0, 1);

  return (
    <div
      style={{
        position: "absolute",
        left: toPercentX(station.pos.x),
        top: toPercentY(station.pos.y),
        width: toPercentX(station.size.w),
        height: toPercentY(station.size.h),
        borderRadius: 22,
        border: `1px solid ${station.glow.replace(".18", ".34").replace(".16", ".28").replace(".15", ".28").replace(".12", ".22")}`,
        background: "linear-gradient(180deg, rgba(11,13,19,.98) 0%, rgba(13,16,23,.94) 54%, rgba(11,13,19,.92) 100%)",
        boxShadow: `0 0 0 1px rgba(255,255,255,.02) inset, 0 18px 40px rgba(0,0,0,.34), 0 0 0 1px ${station.glow}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          top: 18,
          minHeight: station.id === "command-center" ? 126 : 114,
          borderRadius: 18,
          padding: "18px 20px 16px",
          background: "linear-gradient(180deg, rgba(7,10,15,.98) 0%, rgba(9,12,18,.92) 100%)",
          border: "1px solid rgba(255,255,255,.07)",
          boxShadow: "0 12px 28px rgba(0,0,0,.34)",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 11.5,
                lineHeight: 1.2,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: station.accent,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              {station.categoryLabel}
            </div>
            <div
              style={{
                fontSize: station.id === "command-center" ? 22 : 18,
                lineHeight: 1.18,
                fontWeight: 800,
                color: "rgba(250,250,250,.96)",
                marginBottom: 10,
              }}
            >
              {station.shortTitle}
            </div>
            <div
              style={{
                maxWidth: station.id === "command-center" ? 330 : 280,
                fontSize: 14,
                lineHeight: 1.5,
                color: "rgba(225,229,236,.82)",
              }}
            >
              {station.purpose}
            </div>
          </div>

          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
              color: station.accent,
              fontSize: 18,
              border: `1px solid ${station.glow.replace(".18", ".36").replace(".16", ".32").replace(".15", ".28").replace(".12", ".24")}`,
              background: `linear-gradient(180deg, rgba(255,255,255,.04), ${station.glow})`,
              boxShadow: `0 0 24px ${station.glow}`,
            }}
          >
            {station.icon}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          top: station.id === "command-center" ? 176 : 168,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 14,
          zIndex: 2,
        }}
      >
        {topicAgents.map((agent) => (
          <div
            key={`${station.id}-${agent.id}-summary`}
            style={{
              minHeight: station.id === "command-center" ? 84 : 78,
              borderRadius: 16,
              padding: "12px 14px",
              background: "rgba(12,15,22,.92)",
              border: "1px solid rgba(255,255,255,.06)",
              boxShadow: "0 10px 18px rgba(0,0,0,.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  fontSize: 12.5,
                  lineHeight: 1.2,
                  fontWeight: 700,
                  color: "rgba(247,249,252,.94)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {projectLabel(agent)}
              </div>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: statusTone(agent),
                  boxShadow: `0 0 10px ${statusTone(agent)}`,
                  flex: "0 0 auto",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.45,
                color: "rgba(203,210,221,.82)",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {compactTopic(agent)}
            </div>
          </div>
        ))}
      </div>

      {station.surfaces.map((surface, index) => (
        <div
          key={`${station.id}-surface-${index}`}
          style={{
            position: "absolute",
            left: localX(surface.x),
            top: localY(surface.y),
            width: localX(surface.w),
            height: localY(surface.h),
            borderRadius: surface.kind === "desk" ? 12 : 16,
            border: "1px solid rgba(255,255,255,.06)",
            background:
              surface.kind === "desk"
                ? "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))"
                : "linear-gradient(180deg, rgba(5,8,12,.94), rgba(7,10,15,.84))",
            boxShadow:
              surface.kind === "desk"
                ? "0 8px 18px rgba(0,0,0,.18) inset"
                : `0 0 0 1px rgba(255,255,255,.02) inset, 0 0 22px ${station.glow}`,
            zIndex: 1,
            overflow: "hidden",
          }}
        >
          {surface.kind !== "desk" &&
            [0, 1, 2, 3].map((line) => (
              <div
                key={line}
                style={{
                  position: "absolute",
                  left: 14,
                  top: 18 + line * 12,
                  width: `${62 - line * 9}%`,
                  height: 4,
                  borderRadius: 999,
                  background: station.accent,
                  opacity: 0.52 - line * 0.08,
                }}
              />
            ))}
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          right: 18,
          bottom: 16,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 999,
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(237,242,247,.9)",
          background: "rgba(10,13,20,.9)",
          border: "1px solid rgba(255,255,255,.08)",
          zIndex: 3,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: occupancy.length ? station.accent : "rgba(148,163,184,.75)",
            boxShadow: occupancy.length ? `0 0 12px ${station.glow}` : "none",
          }}
        />
        {occupancy.length} active
      </div>
    </div>
  );
}

function HoverCard({
  agent,
  x,
  y,
}: {
  agent: AgentRecord;
  x: number;
  y: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        minWidth: 256,
        maxWidth: 304,
        transform: "translate(-50%, -100%)",
        padding: "14px 16px",
        borderRadius: 16,
        background: "rgba(7,10,15,.97)",
        border: "1px solid rgba(255,255,255,.09)",
        boxShadow: "0 18px 32px rgba(0,0,0,.36)",
        zIndex: 9,
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 12.5, letterSpacing: "0.18em", textTransform: "uppercase", color: COLOR[agent.name] || "var(--accent)", marginBottom: 8, fontWeight: 700 }}>
        {agent.name}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.25, color: "rgba(200,207,217,.72)", marginBottom: 10 }}>
        {stationLabel(agent.currentStation)} • {categoryLabel(agent.currentTaskCategory)}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.25, color: "rgba(248,250,252,.95)", fontWeight: 700, marginBottom: 8 }}>
        {projectLabel(agent)}
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "rgba(222,228,236,.84)" }}>
        {compactTopic(agent)}
      </div>
    </div>
  );
}

function AgentAvatar({
  agent,
  selected,
  hovered,
  onClick,
  onHover,
}: {
  agent: AgentRecord;
  selected: boolean;
  hovered: boolean;
  onClick: () => void;
  onHover: (next: boolean) => void;
}) {
  const accent = COLOR[agent.name] || "#ffffff";
  const body = BODY_COLOR[agent.name] || accent;
  const svg = AGENT_SVG[agent.name.toLowerCase()];

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        position: "absolute",
        left: toPercentX(agent.pos.x),
        top: toPercentY(agent.pos.y),
        transform: "translate(-50%, -50%)",
        background: "transparent",
        border: 0,
        padding: 0,
        cursor: "pointer",
        zIndex: selected || hovered ? 8 : 6,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 50,
          transform: "translateX(-50%)",
          minWidth: 110,
          maxWidth: 164,
          padding: "7px 12px",
          borderRadius: 999,
          background: "rgba(7,10,15,.97)",
          border: selected ? `1px solid ${accent}` : "1px solid rgba(255,255,255,.08)",
          boxShadow: selected ? `0 0 24px ${accent}33` : "0 8px 16px rgba(0,0,0,.24)",
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.2,
            fontWeight: 700,
            color: "rgba(246,248,251,.95)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {projectLabel(agent)}
        </div>
      </div>

      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 11,
          display: "grid",
          placeItems: "center",
          background: body,
          color: "#0b0e14",
          fontSize: 15,
          fontWeight: 800,
          border: selected ? `1px solid ${accent}` : "1px solid rgba(255,255,255,.12)",
          boxShadow: selected ? `0 0 0 2px ${accent}44, 0 0 28px ${accent}33` : `0 8px 18px ${accent}20`,
        }}
      >
        {svg ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {svg}
          </svg>
        ) : (
          agent.name.slice(0, 1).toUpperCase()
        )}
      </div>

      <div
        style={{
          width: 16,
          height: 13,
          margin: "6px auto 0",
          borderRadius: 4,
          background: `${body}55`,
          border: "1px solid rgba(255,255,255,.06)",
        }}
      />

      <div
        style={{
          width: 8,
          height: 8,
          margin: "6px auto 0",
          borderRadius: 999,
          background: statusTone(agent),
          boxShadow: `0 0 10px ${statusTone(agent)}`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 66,
          transform: "translateX(-50%)",
          minWidth: 74,
          padding: "5px 10px",
          borderRadius: 999,
          background: "rgba(7,10,15,.97)",
          border: "1px solid rgba(255,255,255,.08)",
          boxShadow: "0 8px 16px rgba(0,0,0,.2)",
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            lineHeight: 1.2,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: accent,
            whiteSpace: "nowrap",
          }}
        >
          {agent.name}
        </div>
      </div>
    </button>
  );
}

function OverviewRail({
  agents,
  onSelect,
}: {
  agents: AgentRecord[];
  onSelect: (agent: AgentRecord) => void;
}) {
  const grouped = STATIONS.map((station) => ({
    station,
    agents: agents
      .filter((agent) => agent.currentStation === station.id)
      .sort((a, b) => preferredAgentOrder(a) - preferredAgentOrder(b) || a.name.localeCompare(b.name)),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          borderRadius: 20,
          padding: 20,
          background: "linear-gradient(180deg, rgba(8,10,15,.98), rgba(11,14,20,.94))",
          border: "1px solid rgba(255,255,255,.07)",
        }}
      >
        <div style={{ fontSize: 11.5, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,68,68,.86)", marginBottom: 10, fontWeight: 700 }}>
          Intelligence Rail
        </div>
        <div style={{ fontSize: 24, lineHeight: 1.15, color: "rgba(248,250,252,.97)", fontWeight: 800, marginBottom: 10 }}>
          Agent World Overview
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(205,213,224,.82)" }}>
          Select any agent to inspect the current project, live task, station reasoning, and recent operational state.
        </div>
      </div>

      {grouped.map(({ station, agents: stationAgents }) => (
        <div
          key={station.id}
          style={{
            borderRadius: 18,
            padding: 16,
            background: "rgba(10,13,19,.92)",
            border: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: station.accent, fontWeight: 700, marginBottom: 6 }}>
                {station.categoryLabel}
              </div>
              <div style={{ fontSize: 17, lineHeight: 1.2, color: "rgba(247,249,252,.96)", fontWeight: 700 }}>
                {station.shortTitle}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(200,207,217,.74)" }}>{stationAgents.length} active</div>
          </div>

          {stationAgents.length ? (
            stationAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelect(agent)}
                style={{
                  textAlign: "left",
                  borderRadius: 14,
                  padding: "12px 14px",
                  background: "rgba(14,18,26,.94)",
                  border: "1px solid rgba(255,255,255,.06)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 14.5, color: COLOR[agent.name] || "rgba(247,249,252,.96)", fontWeight: 700 }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(200,207,217,.7)" }}>{projectLabel(agent)}</div>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(219,225,234,.82)" }}>{compactTopic(agent)}</div>
              </button>
            ))
          ) : (
            <div style={{ borderRadius: 14, padding: "12px 14px", background: "rgba(14,18,26,.78)", border: "1px solid rgba(255,255,255,.05)", fontSize: 12.5, color: "rgba(148,163,184,.76)" }}>
              No agents in this station right now.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AgentDetailBody({
  agent,
  openRoute,
}: {
  agent: AgentRecord;
  openRoute: (route: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const infoRow = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10.5, lineHeight: 1.2, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(148,163,184,.76)", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "rgba(234,238,244,.9)" }}>{value || "—"}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          borderRadius: 20,
          padding: 20,
          background: "linear-gradient(180deg, rgba(8,10,15,.98), rgba(11,14,20,.94))",
          border: "1px solid rgba(255,255,255,.07)",
        }}
      >
        <div style={{ fontSize: 11.5, letterSpacing: "0.2em", textTransform: "uppercase", color: COLOR[agent.name] || "rgba(239,68,68,.86)", marginBottom: 10, fontWeight: 700 }}>
          Selected Agent
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 28, lineHeight: 1.1, color: "rgba(248,250,252,.97)", fontWeight: 800, marginBottom: 6 }}>{agent.name}</div>
            <div style={{ fontSize: 14, lineHeight: 1.4, color: "rgba(200,207,217,.78)" }}>{agent.role || agent.specialty || "Operational agent"}</div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "8px 12px", background: "rgba(14,18,26,.92)", border: "1px solid rgba(255,255,255,.07)", fontSize: 12, color: "rgba(226,232,240,.86)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: statusTone(agent), boxShadow: `0 0 10px ${statusTone(agent)}` }} />
            {agent.status}
          </div>
        </div>
        <div style={{ fontSize: 10.5, lineHeight: 1.2, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(148,163,184,.76)", fontWeight: 700, marginBottom: 8 }}>
          Current Project
        </div>
        <div style={{ fontSize: 18, lineHeight: 1.3, color: "rgba(247,249,252,.96)", fontWeight: 700, marginBottom: 8 }}>{projectLabel(agent)}</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(215,222,231,.84)" }}>{agent.currentProject?.why || compactTopic(agent)}</div>
      </div>

      <div style={{ borderRadius: 18, padding: 18, background: "rgba(10,13,19,.94)", border: "1px solid rgba(255,255,255,.06)", display: "grid", gap: 16 }}>
        {infoRow("Live Task", agent.statusText || agent.latestTask || "Standing by")}
        {infoRow("Station", stationLabel(agent.currentStation))}
        {infoRow("Task Category", categoryLabel(agent.currentTaskCategory))}
        {infoRow("Why Here", agent.stationReason || "Mapped from live operational state.")}
      </div>

      <div style={{ borderRadius: 18, padding: 18, background: "rgba(10,13,19,.94)", border: "1px solid rgba(255,255,255,.06)", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        {infoRow("Primary Model", agent.currentModel || "—")}
        {infoRow("Backup Model", agent.backupModel || "—")}
        {infoRow("Health", `${agent.healthScore || 0}%`)}
        {infoRow("Uptime", agent.uptime || "—")}
        {infoRow("Last Updated", formatTime(agent.lastUpdated))}
        {infoRow("Tools", agent.toolAccess?.length ? agent.toolAccess.join(", ") : "Standard access")}
      </div>

      <div style={{ borderRadius: 18, padding: 18, background: "rgba(10,13,19,.94)", border: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(148,163,184,.76)", fontWeight: 700, marginBottom: 10 }}>
          Ask Agent
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Send ${agent.name} to Messages for detailed direction...`}
          style={{
            width: "100%",
            minHeight: 92,
            resize: "vertical",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,.08)",
            background: "rgba(7,10,15,.95)",
            color: "rgba(244,247,250,.94)",
            padding: "14px 15px",
            fontSize: 13.5,
            lineHeight: 1.5,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => openRoute("/messages")}
            style={{
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(239,68,68,.12)",
              color: "rgba(250,250,250,.94)",
              padding: "10px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Open in Messages
          </button>
          <button
            type="button"
            onClick={() => openRoute("/voice")}
            style={{
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(255,255,255,.03)",
              color: "rgba(235,239,244,.88)",
              padding: "10px 14px",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Open Voice
          </button>
          {draft.trim() ? (
            <div style={{ fontSize: 12.5, color: "rgba(200,207,217,.72)", alignSelf: "center" }}>
              Draft ready for message routing.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DispatchBar({
  selected,
  agents,
  openRoute,
}: {
  selected?: AgentRecord;
  agents: AgentRecord[];
  openRoute: (route: string) => void;
}) {
  const online = agents.filter((agent) => agent.status !== "offline").length;
  const activeCommand = agents.filter((agent) => agent.currentStation === "command-center").length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "16px 18px",
        borderTop: "1px solid rgba(255,255,255,.06)",
        background: "rgba(6,8,12,.92)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "rgba(232,237,243,.88)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#22c55e", boxShadow: "0 0 10px rgba(34,197,94,.4)" }} />
          Operational
        </div>
        <div style={{ fontSize: 12.5, color: "rgba(200,207,217,.72)" }}>{online} online</div>
        <div style={{ fontSize: 12.5, color: "rgba(200,207,217,.72)" }}>{activeCommand} in command flow</div>
        <div style={{ fontSize: 12.5, color: "rgba(200,207,217,.72)" }}>
          {selected ? `Focused: ${selected.name} • ${projectLabel(selected)}` : "Select an agent to inspect live work."}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(148,163,184,.7)", fontWeight: 700 }}>
          Dispatch
        </div>
        <button
          type="button"
          onClick={() => openRoute("/messages")}
          style={{
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,.08)",
            background: "rgba(255,255,255,.03)",
            color: "rgba(240,244,248,.9)",
            padding: "9px 14px",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Status Check All
        </button>
        {selected ? (
          <>
            <button
              type="button"
              onClick={() => openRoute("/messages")}
              style={{
                borderRadius: 999,
                border: `1px solid ${(COLOR[selected.name] || "#ef4444")}66`,
                background: `${COLOR[selected.name] || "#ef4444"}18`,
                color: "rgba(248,250,252,.96)",
                padding: "9px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {selected.name}: Open Thread
            </button>
            <button
              type="button"
              onClick={() => openRoute("/voice")}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.08)",
                background: "rgba(255,255,255,.03)",
                color: "rgba(240,244,248,.9)",
                padding: "9px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {selected.name}: Voice
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AgentsOfficePage({
  data,
  openRoute,
}: {
  data: any;
  openRoute: (route: string) => void;
  actions: any;
}) {
  const initialAgents = data?.agentsLive?.agents || data?.agents || [];
  const { agents } = useStationEngine(initialAgents);
  const [selectedId, setSelectedId] = useState<string>("");
  const [hoveredId, setHoveredId] = useState<string>("");
  const [isPhone, setIsPhone] = useState<boolean>(() => (typeof window !== "undefined" ? window.innerWidth < 1280 : false));

  useEffect(() => {
    const sync = () => setIsPhone(window.innerWidth < 1280);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (!selectedId && agents[0]) setSelectedId(agents[0].id);
    if (selectedId && !agents.some((agent) => agent.id === selectedId)) {
      setSelectedId(agents[0]?.id || "");
    }
  }, [agents, selectedId]);

  const selected = useMemo(() => agents.find((agent) => agent.id === selectedId), [agents, selectedId]);
  const hovered = useMemo(() => agents.find((agent) => agent.id === hoveredId), [agents, hoveredId]);
  const grouped = useMemo(
    () =>
      Object.fromEntries(
        STATIONS.map((station) => [station.id, agents.filter((agent) => agent.currentStation === station.id)]),
      ) as Record<StationId, AgentRecord[]>,
    [agents],
  );
  const online = agents.filter((agent) => agent.status !== "offline").length;
  const activeCommand = agents.filter((agent) => agent.currentStation === "command-center").length;

  return (
    <div
      style={{
        height: "auto",
        minHeight: 720,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(239,68,68,.82)", fontWeight: 700 }}>
            Agents Tab
          </div>
          <div style={{ fontSize: 36, lineHeight: 1.04, color: "rgba(248,250,252,.97)", fontWeight: 800 }}>Agent World</div>
          <div style={{ maxWidth: 780, fontSize: 16, lineHeight: 1.65, color: "rgba(206,214,223,.8)" }}>
            Watch each agent move between real work stations as live tasks change. The world layer shows where the work is happening. The intelligence rail carries the full operational detail.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,.07)", background: "rgba(10,13,19,.9)", fontSize: 12.5, color: "rgba(234,239,244,.88)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "#22c55e", boxShadow: "0 0 10px rgba(34,197,94,.4)" }} />
            {online} online
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,.07)", background: "rgba(10,13,19,.9)", fontSize: 12.5, color: "rgba(234,239,244,.88)" }}>
            {activeCommand} in command flow
          </div>
        </div>
      </div>

      <div
        style={{
          minHeight: 0,
          display: "flex",
          gap: 0,
          alignItems: "flex-start",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            width: "100%",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,.06)",
            background: "linear-gradient(180deg, rgba(8,10,15,.98), rgba(10,13,18,.94))",
            boxShadow: "0 18px 46px rgba(0,0,0,.28)",
            overflow: "auto",
          }}
        >
          <div style={{ minHeight: `${VIRT_H}px`, minWidth: `${VIRT_W}px`, padding: 22, boxSizing: "border-box" }}>
            <div
              style={{
                position: "relative",
                width: `${VIRT_W}px`,
                height: `${VIRT_H}px`,
                borderRadius: 24,
                overflow: "hidden",
                background:
                  "radial-gradient(circle at top right, rgba(116,214,151,.08), transparent 26%), radial-gradient(circle at top left, rgba(224,53,53,.07), transparent 22%), linear-gradient(180deg, rgba(6,8,12,.96), rgba(10,13,18,.96))",
                border: "1px solid rgba(255,255,255,.04)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)",
                  backgroundSize: "54px 54px",
                  opacity: 0.55,
                  pointerEvents: "none",
                }}
              />

              {STATIONS.map((station) => (
                <StationZone key={station.id} station={station} occupancy={grouped[station.id] || []} />
              ))}

              {agents.map((agent) => (
                <AgentAvatar
                  key={agent.id}
                  agent={agent}
                  selected={selected?.id === agent.id}
                  hovered={hoveredId === agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  onHover={(next) => setHoveredId(next ? agent.id : "")}
                />
              ))}

              {hovered ? <HoverCard agent={hovered} x={hovered.pos.x} y={hovered.pos.y - 54} /> : null}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          width: "100%",
          borderRadius: 20,
          padding: 20,
          background: "rgba(8,10,15,.94)",
          border: "1px solid rgba(255,255,255,.06)",
        }}
      >
        {selected ? <AgentDetailBody agent={selected} openRoute={openRoute} /> : <OverviewRail agents={agents} onSelect={(agent) => setSelectedId(agent.id)} />}
      </div>

      <div
        style={{
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.06)",
          background: "rgba(7,9,13,.94)",
        }}
      >
        <DispatchBar selected={selected} agents={agents} openRoute={openRoute} />
      </div>
    </div>
  );
}
