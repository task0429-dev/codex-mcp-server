import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { AgentRegistry } from "../registry/agents";
import { AgentService } from "./agent-service";
import { GoogleCalendarService } from "./google-calendar-service";
import { LogService } from "./log-service";
import { MemoryService } from "./memory-service";
import { NotionOperator } from "./notion-operator";
import { buildProjectData } from "../core/command-center";

type EventLevel = "info" | "warning" | "error";

type OperatorEvent = {
  id: string;
  title: string;
  detail: string;
  level: EventLevel;
  timestamp: string;
  source: string;
  route?: string;
};

type AgentOverride = {
  status?: string;
  healthScore?: number;
  healthLabel?: string;
  currentModel?: string;
  backupModel?: string;
  lastSuccessfulAction?: string;
  lastFailure?: string | null;
  queueSize?: number;
};

type ToolOverride = {
  status?: string;
  lastActivity?: string;
  failureState?: string | null;
  metrics?: {
    successRate?: number;
    avgLatencyMs?: number;
    callsLast24h?: number;
  };
};

type StoreToolState = {
  installState?: string;
  validationState?: string;
  configuredCredentials?: Record<string, string>;
  lastValidatedAt?: string;
  lastTestedAt?: string;
  lastInstalledAt?: string;
};

type TaskOverride = {
  status?: string;
  title?: string;
  detail?: string;
  assignedAgent?: string;
  owner?: string;
  model?: string;
  timestamp?: string;
  queuePosition?: number | null;
  success?: boolean | null;
  trace?: string[];
  approvalState?: string;
};

type NoteOverride = {
  body?: string;
  preview?: string;
  pinned?: boolean;
  updatedAt?: string;
};

type ProtocolOverride = {
  state?: string;
  recentFailures?: number;
};

type IntegrationOverride = {
  state?: string;
  connected?: boolean;
  credentialState?: string;
};

type VoiceState = {
  activeAgentId?: string;
  audioInput?: string;
  audioOutput?: string;
  queue?: Array<{ id: string; name: string }>;
  metrics?: {
    timeToFirstSpeechMs?: number | null;
    lastTurnLatencyMs?: number | null;
    tokensPerSecond?: number;
    lastPlaybackState?: string;
  };
  currentSession?: {
    id?: string;
    state?: string;
    connection?: string;
    startedAt?: string;
    mode?: string;
    transcript?: Array<{
      id: string;
      speaker: string;
      tone: string;
      text: string;
      timestamp: string;
      confidence?: number;
    }>;
    responsePreview?: string;
    waveform?: number[];
  };
  sessionHistory?: Array<{
    id: string;
    agent: string;
    state: string;
    startedAt: string;
    duration: string;
    summary: string;
  }>;
};

type CalendarState = {
  syncState?: string;
  primaryCalendarId?: string;
  lastSyncedAt?: string;
  syncedEvents: Array<Record<string, any>>;
  createdEvents: Array<Record<string, any>>;
};

type MemorySearchState = {
  lastQuery?: string;
  lastResults: Array<Record<string, any>>;
};

type MissionControlState = {
  version: number;
  updatedAt: string;
  agentOverrides: Record<string, AgentOverride>;
  toolOverrides: Record<string, ToolOverride>;
  storeTools: Record<string, StoreToolState>;
  taskOverrides: Record<string, TaskOverride>;
  createdTasks: any[];
  noteOverrides: Record<string, NoteOverride>;
  createdNotes: any[];
  protocolOverrides: Record<string, ProtocolOverride>;
  integrationOverrides: Record<string, IntegrationOverride>;
  mcp: {
    transportState?: {
      http?: string;
      stdio?: string;
    };
    serverHealth?: string;
    recentToolCalls: Array<Record<string, any>>;
  };
  openclaw: {
    gatewayState?: string;
    nodeState?: string;
    serviceHealth?: number;
    commandHistory: Array<Record<string, any>>;
  };
  voice: VoiceState;
  calendar: CalendarState;
  memorySearch: MemorySearchState;
  operatorEvents: OperatorEvent[];
  recentCommands: Array<{
    id: string;
    label: string;
    timestamp: string;
    status: string;
  }>;
};

type DispatchResult = {
  event: OperatorEvent;
  result?: Record<string, any>;
};

const DATA_ROOT = path.resolve(__dirname, "../../data/mission-control");
const STATE_PATH = path.join(DATA_ROOT, "state.json");
const MAX_EVENTS = 80;
const MAX_COMMANDS = 24;
const MAX_VOICE_TRANSCRIPT = 40;
const MAX_VOICE_HISTORY = 12;

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function ensureDir() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
}

function defaultState(): MissionControlState {
  return {
    version: 1,
    updatedAt: nowIso(),
    agentOverrides: {},
    toolOverrides: {},
    storeTools: {},
    taskOverrides: {},
    createdTasks: [],
    noteOverrides: {},
    createdNotes: [],
    protocolOverrides: {},
    integrationOverrides: {},
    mcp: {
      recentToolCalls: [],
    },
    openclaw: {
      commandHistory: [],
    },
    voice: {},
    calendar: {
      syncedEvents: [],
      createdEvents: [],
    },
    memorySearch: {
      lastResults: [],
    },
    operatorEvents: [],
    recentCommands: [],
  };
}

function safeState(value: unknown): MissionControlState {
  const base = defaultState();
  if (!value || typeof value !== "object") {
    return base;
  }

  const input = value as Partial<MissionControlState>;
  return {
    ...base,
    ...input,
    agentOverrides: input.agentOverrides || {},
    toolOverrides: input.toolOverrides || {},
    storeTools: input.storeTools || {},
    taskOverrides: input.taskOverrides || {},
    createdTasks: Array.isArray(input.createdTasks) ? input.createdTasks : [],
    noteOverrides: input.noteOverrides || {},
    createdNotes: Array.isArray(input.createdNotes) ? input.createdNotes : [],
    protocolOverrides: input.protocolOverrides || {},
    integrationOverrides: input.integrationOverrides || {},
    mcp: {
      ...base.mcp,
      ...(input.mcp || {}),
      recentToolCalls: Array.isArray(input.mcp?.recentToolCalls) ? input.mcp!.recentToolCalls : [],
    },
    openclaw: {
      ...base.openclaw,
      ...(input.openclaw || {}),
      commandHistory: Array.isArray(input.openclaw?.commandHistory) ? input.openclaw!.commandHistory : [],
    },
    voice: {
      ...(input.voice || {}),
      currentSession: input.voice?.currentSession ? clone(input.voice.currentSession) : undefined,
      sessionHistory: Array.isArray(input.voice?.sessionHistory) ? clone(input.voice.sessionHistory) : [],
    },
    calendar: {
      ...(input.calendar || {}),
      syncedEvents: Array.isArray(input.calendar?.syncedEvents) ? clone(input.calendar!.syncedEvents) : [],
      createdEvents: Array.isArray(input.calendar?.createdEvents) ? clone(input.calendar!.createdEvents) : [],
    },
    memorySearch: {
      ...(input.memorySearch || {}),
      lastResults: Array.isArray(input.memorySearch?.lastResults) ? clone(input.memorySearch!.lastResults) : [],
    },
    operatorEvents: Array.isArray(input.operatorEvents) ? input.operatorEvents : [],
    recentCommands: Array.isArray(input.recentCommands) ? input.recentCommands : [],
  };
}

function readState(): MissionControlState {
  ensureDir();
  if (!fs.existsSync(STATE_PATH)) {
    const initial = defaultState();
    fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return safeState(JSON.parse(raw));
  } catch {
    const initial = defaultState();
    fs.writeFileSync(STATE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function writeState(state: MissionControlState) {
  ensureDir();
  state.updatedAt = nowIso();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function eventId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function maskSecret(value: string) {
  if (!value) {
    return "";
  }
  if (value.length <= 6) {
    return "stored";
  }
  return `stored ••••${value.slice(-4)}`;
}

function agentNameFromId(agentId: string) {
  const normalized = agentId.trim().toLowerCase();
  const match = AgentRegistry.list().find((entry) => entry.name.toLowerCase() === normalized);
  return match?.name || agentId;
}

function buildEvent(title: string, detail: string, level: EventLevel = "info", source = "mission-control", route?: string): OperatorEvent {
  return {
    id: eventId("evt"),
    title,
    detail,
    level,
    timestamp: nowIso(),
    source,
    route,
  };
}

function pushOperatorEvent(state: MissionControlState, event: OperatorEvent) {
  state.operatorEvents.unshift(event);
  state.operatorEvents = state.operatorEvents.slice(0, MAX_EVENTS);
  state.recentCommands.unshift({
    id: eventId("cmd"),
    label: event.title,
    timestamp: event.timestamp,
    status: event.level === "error" ? "error" : event.level === "warning" ? "warning" : "ok",
  });
  state.recentCommands = state.recentCommands.slice(0, MAX_COMMANDS);
}

function ensureVoiceSession(state: MissionControlState) {
  state.voice.currentSession = state.voice.currentSession || {
    id: "voice-session-live",
    state: "idle",
    connection: "stable",
    startedAt: nowIso(),
    mode: "direct-agent",
    transcript: [],
    responsePreview: "Voice channel ready.",
    waveform: [22, 28, 31, 38, 26, 22, 18, 24, 32, 21, 17, 20],
  };
  state.voice.currentSession.transcript = state.voice.currentSession.transcript || [];
  state.voice.sessionHistory = state.voice.sessionHistory || [];
}

function summarizePrompt(prompt: string) {
  const clean = prompt.trim().replace(/\s+/g, " ");
  return clean.length > 92 ? `${clean.slice(0, 89)}...` : clean;
}

function durationFrom(startedAt: string) {
  const diffMs = Math.max(1_000, Date.now() - new Date(startedAt).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  const seconds = Math.floor((diffMs % 60_000) / 1000);
  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function normalizeCalendarEvent(input: Record<string, any>) {
  return {
    id: String(input.id || eventId("evt")),
    externalEventId: input.externalEventId ? String(input.externalEventId) : undefined,
    source: String(input.source || "mission-control"),
    title: String(input.title || "Untitled event"),
    type: String(input.type || "operations"),
    owner: String(input.owner || "TASK"),
    linkedProject: String(input.linkedProject || "Mission Control"),
    start: new Date(String(input.start || nowIso())).toISOString(),
    end: new Date(String(input.end || input.start || nowIso())).toISOString(),
    location: String(input.location || "Mission Control"),
    status: String(input.status || "scheduled"),
    detail: String(input.detail || "Calendar event from Mission Control."),
    calendarId: input.calendarId ? String(input.calendarId) : undefined,
    htmlLink: input.htmlLink ? String(input.htmlLink) : undefined,
  };
}

function upsertCalendarEvent(events: Array<Record<string, any>>, event: Record<string, any>) {
  const index = events.findIndex((entry) => entry.id === event.id || (entry.externalEventId && entry.externalEventId === event.externalEventId));
  if (index >= 0) {
    events[index] = { ...events[index], ...event };
  } else {
    events.push(event);
  }
}

function sortCalendarEvents(events: Array<Record<string, any>>) {
  return events.sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
}

function buildMemorySearchResults(query: string, state: MissionControlState) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [] as Array<Record<string, any>>;
  }

  const matches: Array<Record<string, any>> = [];
  const pushMatch = (entry: Record<string, any>) => {
    if (!matches.some((item) => item.id === entry.id)) {
      matches.push(entry);
    }
  };

  const transcript = state.voice.currentSession?.transcript || [];
  transcript.forEach((entry) => {
    if (String(entry.text || "").toLowerCase().includes(normalizedQuery)) {
      pushMatch({
        id: `voice-${entry.id}`,
        source: "voice",
        title: `${entry.speaker} voice transcript`,
        snippet: String(entry.text || ""),
        timestamp: String(entry.timestamp || nowIso()),
        route: "/voice",
      });
    }
  });

  state.createdNotes.forEach((note) => {
    const body = String(note.body || "");
    if (body.toLowerCase().includes(normalizedQuery)) {
      pushMatch({
        id: `note-${note.id}`,
        source: "notes",
        title: String(note.title || "Quick Capture"),
        snippet: body.slice(0, 220),
        timestamp: String(note.updatedAt || note.timestamp || nowIso()),
        route: "/notes",
      });
    }
  });

  for (const agent of AgentRegistry.list()) {
    const memoryMatches = MemoryService.searchMemory(agent.name, query).slice(0, 4);
    memoryMatches.forEach((match, index) => {
      pushMatch({
        id: `memory-${agent.name}-${index}-${match.file}`,
        source: "memory",
        title: `${agent.name} memory`,
        snippet: String(match.snippet || "").slice(0, 220),
        timestamp: nowIso(),
        route: "/memories",
      });
    });
  }

  LogService.listLogFiles().forEach((file) => {
    const stream = file.replace(/\.log$/i, "");
    const lines = LogService.getRecentLogs(stream === "global" ? undefined : stream, 120)
      .split(/\r?\n/)
      .filter(Boolean);
    lines
      .filter((line) => line.toLowerCase().includes(normalizedQuery))
      .slice(-4)
      .forEach((line, index) => {
        pushMatch({
          id: `log-${stream}-${index}-${line.length}`,
          source: "logs",
          title: `${stream} log`,
          snippet: line.slice(0, 220),
          timestamp: nowIso(),
          route: "/logs",
        });
      });
  });

  return matches.slice(0, 24);
}

function recalcPayload(payload: any) {
  payload.models.assignments = payload.agents.map((agent: any) => ({
    agent: agent.name,
    primaryModel: agent.currentModel,
    backupModel: agent.backupModel,
    provider: agent.provider,
    status: agent.status,
    routingRule:
      agent.provider === "gateway"
        ? "Route through OpenClaw gateway first, then fallback"
        : "Route through provider primary, then role fallback",
    specialization: agent.specialty,
    confidence: Number((0.86 + ((agent.healthScore || 80) - 80) / 200).toFixed(2)),
  }));

  payload.models.catalog.forEach((model: any) => {
    model.assignedAgents = payload.agents.filter((agent: any) => agent.currentModel === model.id).map((agent: any) => agent.name);
    model.fallbackAgents = payload.agents.filter((agent: any) => agent.backupModel === model.id).map((agent: any) => agent.name);
    model.usageShare = model.assignedAgents.length * 9 + model.fallbackAgents.length * 3;
  });

  const onlineAgents = payload.agents.filter((agent: any) => agent.status === "online").length;
  const degradedAgents = payload.agents.filter((agent: any) => ["warning", "degraded", "standby"].includes(agent.status)).length;
  const offlineAgents = payload.agents.filter((agent: any) => agent.status === "offline").length;
  const enabledTools = payload.tools.tools.filter((tool: any) => tool.status === "online" || tool.status === "enabled").length;
  const activeTasks = payload.tasks.tasks.filter((task: any) => task.status === "active");
  const queuedTasks = payload.tasks.tasks.filter((task: any) => task.status === "queued");
  const failedTasks = payload.tasks.tasks.filter((task: any) => task.status === "failed");
  const completedTasks = payload.tasks.tasks.filter((task: any) => task.status === "completed");
  const connectedIntegrations = payload.integrations.integrations.filter((entry: any) => entry.connected || ["online", "connected", "configured"].includes(entry.state)).length;
  const overallHealth = Math.round(payload.agents.reduce((sum: number, agent: any) => sum + (agent.healthScore || 0), 0) / Math.max(1, payload.agents.length));
  const alertCount = payload.logs.events.filter((event: any) => event.level !== "info").length;

  payload.summary = {
    ...payload.summary,
    agentsOnline: onlineAgents,
    agentsDegraded: degradedAgents,
    agentsOffline: offlineAgents,
    totalAgents: payload.agents.length,
    totalTools: payload.tools.tools.length,
    enabledTools,
    totalProtocols: payload.protocols.length,
    connectedIntegrations,
    activeTasks: activeTasks.length,
    queuedTasks: queuedTasks.length,
    failedTasks: failedTasks.length,
    alerts: alertCount,
    overallHealth,
  };

  payload.tasks.activeCount = activeTasks.length;
  payload.tasks.queuedCount = queuedTasks.length;
  payload.tasks.failedCount = failedTasks.length;
  payload.tasks.completedCount = completedTasks.length;
  payload.tasks.approvals = payload.tasks.tasks.filter((task: any) =>
    ["pending", "attention", "rejected"].includes(String(task.approvalState || "none"))
  );

  payload.workspace.activeTasks = activeTasks.slice(0, 3).map((task: any) => ({
    id: task.id,
    title: task.title,
    assignedAgent: task.assignedAgent,
    timestamp: task.timestamp,
    status: task.status,
  }));

  payload.workspace.focusAreas = [
    { label: "Online Agents", value: `${onlineAgents}/${payload.agents.length}`, tone: "online" },
    { label: "Active Tasks", value: `${activeTasks.length}`, tone: activeTasks.length > 0 ? "warning" : "online" },
    { label: "Pinned Notes", value: `${payload.notes.items.filter((note: any) => note.pinned).length}`, tone: "neutral" },
    { label: "Upcoming Events", value: `${payload.calendar.upcoming.length}`, tone: "neutral" },
  ];

  payload.mcp.enabledToolCount = enabledTools;
  payload.mcp.totalToolCount = payload.tools.tools.length;
  payload.mcp.activeProtocols = payload.protocols.filter((protocol: any) => protocol.state !== "offline").length;

  return payload;
}

function installManagedTool(payload: any, tool: any, state: StoreToolState) {
  const managedToolId = `${tool.id}-managed`;
  const existingTool = payload.tools.tools.find((entry: any) => entry.id === managedToolId);
  const toolEntry = {
    id: managedToolId,
    name: tool.name,
    description: tool.description,
    group: "managed-store",
    groupLabel: "Managed Connectors",
    source: "Mission Control",
    category: tool.category,
    status: state.installState === "enabled" ? "online" : "standby",
    protocol: "Managed Connector",
    lastActivity: state.lastInstalledAt || state.lastValidatedAt || payload.generatedAt,
    permissions: "credentialed",
    owningSystem: "Mission Control",
    connectedAgents:
      tool.category === "Scheduling"
        ? ["Abdi", "Ahmed", "Sygma"]
        : tool.category === "Communications"
        ? ["Abdi", "Atlas", "Sygma"]
        : tool.category === "Observability"
        ? ["Rex", "Dame", "Ayub"]
        : ["Ayub", "Abdi"],
    failureState:
      state.installState === "enabled"
        ? null
        : state.validationState && !["verified", "ready"].includes(state.validationState)
        ? `Waiting on ${state.validationState}`
        : "Awaiting enablement",
    destructive: false,
    metrics: {
      successRate: ["verified", "ready"].includes(state.validationState || "") ? 0.98 : 0.76,
      avgLatencyMs: tool.category === "Communications" ? 180 : 260,
      callsLast24h: state.installState === "enabled" ? 9 : 0,
    },
    schema: {},
  };

  if (existingTool) {
    Object.assign(existingTool, toolEntry);
  } else {
    payload.tools.tools.unshift(toolEntry);
  }

  const existingGroup = payload.tools.groups.find((entry: any) => entry.key === "managed-store");
  if (existingGroup) {
    existingGroup.enabled = payload.tools.tools.some((entry: any) => entry.group === "managed-store" && entry.status === "online");
    existingGroup.tools = payload.tools.tools
      .filter((entry: any) => entry.group === "managed-store")
      .map((entry: any) => ({ name: entry.name, description: entry.description, destructive: false, schema: {} }));
  } else {
    payload.tools.groups.unshift({
      key: "managed-store",
      label: "Managed Connectors",
      enabled: toolEntry.status === "online",
      tools: [{ name: toolEntry.name, description: toolEntry.description, destructive: false, schema: {} }],
    });
  }

  const existingMcpGroup = payload.mcp.groups.find((entry: any) => entry.key === "managed-store");
  if (existingMcpGroup) {
    existingMcpGroup.enabled = toolEntry.status === "online";
    existingMcpGroup.tools = payload.tools.tools.filter((entry: any) => entry.group === "managed-store").map((entry: any) => entry.name);
  } else {
    payload.mcp.groups.unshift({
      key: "managed-store",
      label: "Managed Connectors",
      enabled: toolEntry.status === "online",
      tools: payload.tools.tools.filter((entry: any) => entry.group === "managed-store").map((entry: any) => entry.name),
    });
  }

  const integrationId = `${tool.id}-connector`;
  const existingIntegration = payload.integrations.integrations.find((entry: any) => entry.id === integrationId);
  const integrationEntry = {
    id: integrationId,
    name: tool.name,
    category: tool.category.toLowerCase().replace(/\s+/g, "-"),
    state: state.installState === "enabled" ? "online" : "standby",
    connected: state.installState === "enabled",
    credentialState: state.configuredCredentials && Object.keys(state.configuredCredentials).length > 0 ? "stored" : "missing",
    endpoint: "Managed through Mission Control",
    owningSystem: "Mission Control",
    dependencies: tool.compatibility,
  };

  if (existingIntegration) {
    Object.assign(existingIntegration, integrationEntry);
  } else {
    payload.integrations.integrations.unshift(integrationEntry);
  }
}

export class MissionControlStateService {
  private static readonly emitter = new EventEmitter();

  static onEvent(listener: (event: OperatorEvent) => void) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  private static mutate(mutator: (state: MissionControlState) => DispatchResult | Promise<DispatchResult>) {
    return (async () => {
      const state = readState();
      const result = await mutator(state);
      pushOperatorEvent(state, result.event);
      writeState(state);
      this.emitter.emit("event", result.event);
      return result;
    })();
  }

  static recordRealtimeVoiceState(input: {
    sessionId: string;
    activeSpeakerId: string | null;
    queue: Array<{ id: string; name: string }>;
    transcript: Array<{ id: string; speaker: string; text: string; timestamp: string }>;
    metrics: {
      timeToFirstSpeechMs: number | null;
      lastTurnLatencyMs: number | null;
      tokensPerSecond: number;
      lastPlaybackState: string;
    };
    participants: Array<{ id: string; name: string }>;
  }) {
    return this.mutate(async (state) => {
      ensureVoiceSession(state);
      state.voice.activeAgentId = input.activeSpeakerId || undefined;
      state.voice.queue = input.queue;
      state.voice.metrics = input.metrics;
      state.voice.currentSession = {
        ...state.voice.currentSession,
        id: input.sessionId,
        state: input.activeSpeakerId ? "speaking" : "waiting",
        connection: "stable",
        startedAt: state.voice.currentSession?.startedAt || nowIso(),
        mode: input.participants.length > 1 ? "multi-agent-call" : "direct-agent",
        transcript: input.transcript.map((entry) => ({
          id: entry.id,
          speaker: entry.speaker,
          tone: entry.speaker === "TASK" ? "operator" : "agent",
          text: entry.text,
          timestamp: entry.timestamp,
          confidence: 0.99,
        })),
        responsePreview: input.queue.length
          ? `Queued: ${input.queue.map((entry) => entry.name).join(", ")}`
          : input.activeSpeakerId
            ? `${agentNameFromId(input.activeSpeakerId)} is live on the voice channel.`
            : "Voice channel standing by.",
        waveform: input.activeSpeakerId
          ? [12, 28, 22, 41, 37, 16, 24, 39, 20, 31, 18, 26]
          : [8, 10, 12, 10, 9, 8, 10, 12, 10, 8, 9, 10],
      };

      return {
        event: buildEvent(
          "Realtime voice state updated",
          input.activeSpeakerId
            ? `${agentNameFromId(input.activeSpeakerId)} is currently holding the voice turn.`
            : "Realtime voice channel returned to standby.",
          "info",
          "voice",
          "/voice"
        ),
      };
    });
  }

  static dispatch(action: string, payload: any) {
    return this.mutate(async (state) => {
      switch (action) {
        case "sync-workspace": {
          state.mcp.serverHealth = "healthy";
          state.openclaw.gatewayState = "online";
          return { event: buildEvent("Workspace sync", "Mission Control state refreshed and operating surfaces re-synced.", "info", "workspace", "/") };
        }
        case "pause-operations": {
          state.openclaw.gatewayState = "standby";
          state.mcp.serverHealth = "monitored";
          return { event: buildEvent("Operations paused", "Mission Control shifted the automation layer into monitored standby.", "warning", "workspace", "/") };
        }
        case "set-agent-status": {
          const agentId = String(payload.agentId || "");
          const status = String(payload.status || "online");
          state.agentOverrides[agentId] = {
            ...(state.agentOverrides[agentId] || {}),
            status,
            healthScore: status === "online" ? 96 : status === "standby" ? 79 : status === "offline" ? 54 : 74,
            healthLabel: status === "online" ? "healthy" : status === "standby" ? "monitored" : "degraded",
            lastSuccessfulAction: status === "online" ? "just now | operator confirmed runtime" : state.agentOverrides[agentId]?.lastSuccessfulAction,
            lastFailure: status === "offline" ? "Operator set runtime offline" : null,
          };
          return { event: buildEvent("Agent status updated", `${agentNameFromId(agentId)} moved to ${status}.`, status === "offline" ? "warning" : "info", "agents", "/agents") };
        }
        case "restart-agent": {
          const agentId = String(payload.agentId || "");
          const agentName = agentNameFromId(agentId);
          const response = await AgentService.restart(agentName);
          state.agentOverrides[agentId] = {
            ...(state.agentOverrides[agentId] || {}),
            status: response.status === "ok" ? "online" : "warning",
            healthScore: response.status === "ok" ? 97 : 69,
            healthLabel: response.status === "ok" ? "healthy" : "monitored",
            lastSuccessfulAction: response.status === "ok" ? `just now | ${response.message}` : state.agentOverrides[agentId]?.lastSuccessfulAction,
            lastFailure: response.status === "ok" ? null : response.message,
            queueSize: response.status === "ok" ? 0 : undefined,
          };
          return { event: buildEvent("Agent restart", response.message, response.status === "ok" ? "info" : "warning", "agents", "/agents"), result: response };
        }
        case "assign-model": {
          const agentId = String(payload.agentId || "");
          const field = payload.field === "backupModel" ? "backupModel" : "currentModel";
          const modelId = String(payload.modelId || "").trim();
          if (modelId) {
            state.agentOverrides[agentId] = { ...(state.agentOverrides[agentId] || {}), [field]: modelId };
          }
          return {
            event: buildEvent(
              field === "currentModel" ? "Primary model updated" : "Fallback model updated",
              `${agentNameFromId(agentId)} ${field === "currentModel" ? "primary" : "fallback"} model changed to ${modelId}.`,
              "info",
              "models",
              "/models"
            ),
          };
        }
        case "connect-voice-agent": {
          const agentId = String(payload.agentId || "");
          ensureVoiceSession(state);
          state.voice.activeAgentId = agentId;
          state.voice.currentSession!.state = "listening";
          state.voice.currentSession!.connection = "stable";
          state.voice.currentSession!.responsePreview = `${agentNameFromId(agentId)} voice channel is live and ready for operator input.`;
          return { event: buildEvent("Voice channel switched", `${agentNameFromId(agentId)} is now the active voice channel.`, "info", "voice", "/voice") };
        }
        case "restart-gateway": {
          state.openclaw.gatewayState = "online";
          state.openclaw.nodeState = "connected";
          state.openclaw.serviceHealth = 97;
          state.openclaw.commandHistory.unshift({ id: eventId("ocmd"), command: "gateway.restart", status: "ok", timestamp: nowIso() });
          state.openclaw.commandHistory = state.openclaw.commandHistory.slice(0, 12);
          return { event: buildEvent("OpenClaw gateway restarted", "Gateway services were restarted and routing returned online.", "info", "openclaw", "/openclaw") };
        }
        case "reconnect-openclaw": {
          state.openclaw.gatewayState = "online";
          state.openclaw.nodeState = "connected";
          return { event: buildEvent("OpenClaw reconnect", "Connected workspaces and agent runtime links were refreshed.", "info", "openclaw", "/openclaw") };
        }
        case "run-mcp-health-check": {
          state.mcp.serverHealth = "healthy";
          state.mcp.transportState = { ...(state.mcp.transportState || {}), http: "online", stdio: "online" };
          return { event: buildEvent("MCP health check", "MCP transports and exposed tool groups were revalidated.", "info", "mcp", "/mcp") };
        }
        case "set-mcp-transport-state": {
          const transport = payload.transport === "stdio" ? "stdio" : "http";
          const stateValue = String(payload.state || "online");
          state.mcp.transportState = { ...(state.mcp.transportState || {}), [transport]: stateValue };
          return { event: buildEvent("Transport state updated", `MCP ${transport.toUpperCase()} transport moved to ${stateValue}.`, "info", "mcp", "/mcp") };
        }
        case "set-protocol-state": {
          const protocolId = String(payload.protocolId || "");
          const stateValue = String(payload.state || "online");
          state.protocolOverrides[protocolId] = { ...(state.protocolOverrides[protocolId] || {}), state: stateValue };
          return { event: buildEvent("Protocol updated", `${protocolId} moved to ${stateValue}.`, "info", "protocols", "/protocols") };
        }
        case "execute-quick-action": {
          const actionId = String(payload.actionId || "command");
          const label = String(payload.label || actionId);
          return {
            event: buildEvent("Quick command executed", `${label} was executed from Mission Control.`, "info", "workspace", "/overview"),
            result: { actionId, status: "ok" },
          };
        }
        case "run-system-diagnostic": {
          state.mcp.serverHealth = "healthy";
          state.mcp.transportState = { ...(state.mcp.transportState || {}), http: "online", stdio: "online" };
          state.openclaw.gatewayState = "online";
          state.openclaw.nodeState = "connected";
          state.openclaw.serviceHealth = Math.max(state.openclaw.serviceHealth || 82, 94);
          state.openclaw.commandHistory.unshift({
            id: eventId("diag"),
            command: "system.diagnostic",
            status: "ok",
            timestamp: nowIso(),
          });
          state.openclaw.commandHistory = state.openclaw.commandHistory.slice(0, 12);
          return {
            event: buildEvent(
              "System diagnostic complete",
              "OpenClaw gateway, MCP transports, and runtime telemetry passed the latest diagnostic cycle.",
              "info",
              "system",
              "/logs"
            ),
            result: {
              mcp: state.mcp.serverHealth,
              openclaw: state.openclaw.gatewayState,
              serviceHealth: state.openclaw.serviceHealth,
            },
          };
        }
        case "calendar-sync-google": {
          const calendarId = String(payload.calendarId || state.calendar.primaryCalendarId || "primary");
          state.calendar.primaryCalendarId = calendarId;
          if (!GoogleCalendarService.hasCredentials()) {
            state.calendar.syncState = "credentials-required";
            state.integrationOverrides["google-calendar"] = {
              ...(state.integrationOverrides["google-calendar"] || {}),
              state: "standby",
              connected: false,
              credentialState: "missing",
            };
            return {
              event: buildEvent(
                "Calendar credentials required",
                "Google Calendar credentials are missing. Add OAuth credentials in integrations or your secure doc source.",
                "warning",
                "calendar",
                "/calendar"
              ),
              result: { synced: 0, state: "credentials-required" },
            };
          }

          const syncedEvents = await GoogleCalendarService.listUpcomingEvents(calendarId, 24);
          state.calendar.syncedEvents = syncedEvents.map((entry) => normalizeCalendarEvent(entry));
          state.calendar.syncState = "google-calendar-synced";
          state.calendar.lastSyncedAt = nowIso();
          state.integrationOverrides["google-calendar"] = {
            ...(state.integrationOverrides["google-calendar"] || {}),
            state: "online",
            connected: true,
            credentialState: "configured",
          };
          return {
            event: buildEvent("Google Calendar synced", `Imported ${syncedEvents.length} upcoming events from ${calendarId}.`, "info", "calendar", "/calendar"),
            result: { synced: syncedEvents.length, calendarId },
          };
        }
        case "calendar-create-event": {
          const calendarId = String(payload.calendarId || state.calendar.primaryCalendarId || "primary");
          const title = String(payload.title || "").trim() || "New Mission Event";
          const start = String(payload.start || nowIso());
          const end = String(payload.end || start);
          const owner = String(payload.owner || "TASK");
          const linkedProject = String(payload.linkedProject || "Mission Control");
          const location = String(payload.location || "Mission Control");
          const detail = String(payload.detail || "Scheduled from Mission Control.");

          state.calendar.primaryCalendarId = calendarId;
          if (GoogleCalendarService.hasCredentials()) {
            try {
              const created = await GoogleCalendarService.createEvent({
                calendarId,
                title,
                start,
                end,
                owner,
                linkedProject,
                location,
                detail,
              });
              upsertCalendarEvent(state.calendar.createdEvents, normalizeCalendarEvent(created));
              state.calendar.syncState = "google-calendar-synced";
              state.calendar.lastSyncedAt = nowIso();
              return {
                event: buildEvent("Calendar event created", `${title} was added to Google Calendar (${calendarId}).`, "info", "calendar", "/calendar"),
                result: { event: created },
              };
            } catch (error) {
              state.calendar.syncState = "google-calendar-error";
              const fallbackEvent = normalizeCalendarEvent({
                id: eventId("evt"),
                source: "mission-control",
                title,
                start,
                end,
                owner,
                linkedProject,
                location,
                detail,
                status: "scheduled",
                calendarId,
              });
              upsertCalendarEvent(state.calendar.createdEvents, fallbackEvent);
              return {
                event: buildEvent(
                  "Calendar fallback event created",
                  `Google Calendar create failed. Mission Control stored a local calendar event for ${title}.`,
                  "warning",
                  "calendar",
                  "/calendar"
                ),
                result: { event: fallbackEvent, error: error instanceof Error ? error.message : String(error) },
              };
            }
          }

          const localEvent = normalizeCalendarEvent({
            id: eventId("evt"),
            source: "mission-control",
            title,
            start,
            end,
            owner,
            linkedProject,
            location,
            detail,
            status: "scheduled",
            calendarId,
          });
          upsertCalendarEvent(state.calendar.createdEvents, localEvent);
          state.calendar.syncState = "local-only";
          return {
            event: buildEvent("Local calendar event created", `${title} was added to the local Mission Control calendar queue.`, "warning", "calendar", "/calendar"),
            result: { event: localEvent },
          };
        }
        case "calendar-update-event": {
          const eventIdInput = String(payload.eventId || "");
          const calendarId = String(payload.calendarId || state.calendar.primaryCalendarId || "primary");
          const existing =
            state.calendar.createdEvents.find((entry) => entry.id === eventIdInput || entry.externalEventId === eventIdInput) ||
            state.calendar.syncedEvents.find((entry) => entry.id === eventIdInput || entry.externalEventId === eventIdInput);
          if (!existing) {
            return {
              event: buildEvent("Calendar update skipped", `No calendar event matched ${eventIdInput}.`, "warning", "calendar", "/calendar"),
              result: { updated: false },
            };
          }

          const merged = normalizeCalendarEvent({
            ...existing,
            title: payload.title ?? existing.title,
            owner: payload.owner ?? existing.owner,
            linkedProject: payload.linkedProject ?? existing.linkedProject,
            start: payload.start ?? existing.start,
            end: payload.end ?? existing.end,
            location: payload.location ?? existing.location,
            detail: payload.detail ?? existing.detail,
            calendarId,
          });

          if (GoogleCalendarService.hasCredentials() && existing.externalEventId) {
            try {
              const updated = await GoogleCalendarService.updateEvent({
                calendarId,
                eventId: String(existing.externalEventId),
                title: String(merged.title),
                owner: String(merged.owner),
                linkedProject: String(merged.linkedProject),
                start: String(merged.start),
                end: String(merged.end),
                location: String(merged.location),
                detail: String(merged.detail),
              });
              upsertCalendarEvent(state.calendar.createdEvents, normalizeCalendarEvent(updated));
              state.calendar.lastSyncedAt = nowIso();
              state.calendar.syncState = "google-calendar-synced";
              return {
                event: buildEvent("Calendar event updated", `${merged.title} was updated in Google Calendar.`, "info", "calendar", "/calendar"),
                result: { event: updated },
              };
            } catch (error) {
              upsertCalendarEvent(state.calendar.createdEvents, merged);
              state.calendar.syncState = "google-calendar-error";
              return {
                event: buildEvent(
                  "Calendar update fallback",
                  `${merged.title} was updated locally after a Google Calendar update failure.`,
                  "warning",
                  "calendar",
                  "/calendar"
                ),
                result: { event: merged, error: error instanceof Error ? error.message : String(error) },
              };
            }
          }

          upsertCalendarEvent(state.calendar.createdEvents, merged);
          return {
            event: buildEvent("Calendar event updated", `${merged.title} was updated in Mission Control.`, "info", "calendar", "/calendar"),
            result: { event: merged },
          };
        }
        case "toggle-tool": {
          const toolId = String(payload.toolId || "");
          const current = state.toolOverrides[toolId];
          const nextStatus = current?.status === "online" ? "disabled" : "online";
          state.toolOverrides[toolId] = { ...(current || {}), status: nextStatus, lastActivity: nowIso(), failureState: nextStatus === "online" ? null : "Disabled by operator" };
          return { event: buildEvent("Tool state changed", `${toolId} availability was updated.`, nextStatus === "disabled" ? "warning" : "info", "mcp-tools", "/mcp-tools") };
        }
        case "test-tool": {
          const toolId = String(payload.toolId || "");
          state.toolOverrides[toolId] = {
            ...(state.toolOverrides[toolId] || {}),
            status: "online",
            lastActivity: nowIso(),
            failureState: null,
            metrics: {
              ...(state.toolOverrides[toolId]?.metrics || {}),
              callsLast24h: (state.toolOverrides[toolId]?.metrics?.callsLast24h || 0) + 1,
              successRate: Math.min(0.999, (state.toolOverrides[toolId]?.metrics?.successRate || 0.96) + 0.01),
            },
          };
          state.mcp.recentToolCalls.unshift({ id: eventId("call"), tool: toolId, group: "Mission Control", protocol: "HTTP", status: "ok", durationMs: 184, timestamp: nowIso() });
          state.mcp.recentToolCalls = state.mcp.recentToolCalls.slice(0, 24);
          return { event: buildEvent("Tool connection test", `${toolId} completed a live validation run.`, "info", "mcp-tools", "/mcp-tools") };
        }
        case "configure-store-tool":
        case "validate-store-tool":
        case "test-store-tool":
        case "install-store-tool": {
          const toolId = String(payload.toolId || "");
          const credentials = typeof payload.credentials === "object" && payload.credentials ? payload.credentials : {};
          const required = Array.isArray(payload.requiredFields) ? payload.requiredFields.map((entry: any) => String(entry)) : [];
          const stateEntry = state.storeTools[toolId] || {};
          stateEntry.configuredCredentials = { ...(stateEntry.configuredCredentials || {}) };
          Object.entries(credentials).forEach(([key, value]) => {
            const stringValue = String(value || "");
            if (stringValue.trim()) {
              stateEntry.configuredCredentials![key] = stringValue;
            }
          });
          state.storeTools[toolId] = stateEntry;

          if (action === "configure-store-tool") {
            return { event: buildEvent("Tool credentials stored", `${toolId} credentials were saved securely in Mission Control.`, "info", "tool-store", "/tool-store") };
          }

          const hasAllCredentials = required.every((field: string) => String(stateEntry.configuredCredentials?.[field] || "").trim());

          if (action === "validate-store-tool") {
            stateEntry.validationState = hasAllCredentials ? "verified" : "credentials-required";
            stateEntry.lastValidatedAt = nowIso();
            return {
              event: buildEvent(
                "Marketplace validation",
                hasAllCredentials ? `${toolId} credentials were validated.` : `${toolId} is still missing required credentials.`,
                hasAllCredentials ? "info" : "warning",
                "tool-store",
                "/tool-store"
              ),
            };
          }

          if (action === "test-store-tool") {
            stateEntry.validationState = hasAllCredentials ? "verified" : "credentials-required";
            stateEntry.lastTestedAt = nowIso();
            state.mcp.recentToolCalls.unshift({
              id: eventId("call"),
              tool: toolId,
              group: "Marketplace",
              protocol: "Managed Connector",
              status: hasAllCredentials ? "ok" : "warning",
              durationMs: hasAllCredentials ? 248 : 91,
              timestamp: nowIso(),
            });
            state.mcp.recentToolCalls = state.mcp.recentToolCalls.slice(0, 24);
            return {
              event: buildEvent(
                "Marketplace connection test",
                hasAllCredentials ? `${toolId} completed a setup connection test.` : `${toolId} could not be tested because credentials are incomplete.`,
                hasAllCredentials ? "info" : "warning",
                "tool-store",
                "/tool-store"
              ),
            };
          }

          stateEntry.validationState = hasAllCredentials ? "verified" : "credentials-required";
          stateEntry.installState = hasAllCredentials ? "enabled" : "pending";
          stateEntry.lastInstalledAt = nowIso();
          return {
            event: buildEvent(
              "Marketplace install",
              hasAllCredentials ? `${toolId} was enabled in Mission Control.` : `${toolId} is waiting on credentials before enablement.`,
              hasAllCredentials ? "info" : "warning",
              "tool-store",
              "/tool-store"
            ),
          };
        }
        case "test-integration": {
          const integrationId = String(payload.integrationId || "");
          state.integrationOverrides[integrationId] = {
            ...(state.integrationOverrides[integrationId] || {}),
            state: "online",
            connected: true,
            credentialState: state.integrationOverrides[integrationId]?.credentialState || "configured",
          };
          return { event: buildEvent("Integration test", `${integrationId} connection was verified.`, "info", "integrations", "/integrations") };
        }
        case "set-task-approval": {
          const taskId = String(payload.taskId || "");
          const decision = String(payload.decision || "approved");
          const reason = String(payload.reason || "").trim();
          const normalizedDecision = decision === "rejected" ? "rejected" : decision === "changes-requested" ? "changes-requested" : "approved";
          state.taskOverrides[taskId] = {
            ...(state.taskOverrides[taskId] || {}),
            status: normalizedDecision === "approved" ? "completed" : normalizedDecision === "rejected" ? "failed" : "active",
            success: normalizedDecision === "approved" ? true : normalizedDecision === "rejected" ? false : null,
            approvalState: normalizedDecision === "approved" ? "approved" : normalizedDecision === "rejected" ? "rejected" : "pending",
            trace: [
              ...(state.taskOverrides[taskId]?.trace || []),
              `Approval decision: ${normalizedDecision}${reason ? ` (${reason})` : ""}`,
            ].slice(-8),
            timestamp: nowIso(),
          };
          return {
            event: buildEvent(
              normalizedDecision === "approved" ? "Task approved" : normalizedDecision === "rejected" ? "Task rejected" : "Task changes requested",
              reason || `Approval state for ${taskId} changed to ${normalizedDecision}.`,
              normalizedDecision === "rejected" ? "warning" : "info",
              "approvals",
              "/tasks"
            ),
          };
        }
        case "search-memory": {
          const query = String(payload.query || "").trim();
          if (!query) {
            state.memorySearch.lastQuery = "";
            state.memorySearch.lastResults = [];
            return {
              event: buildEvent("Memory search cleared", "Memory keyword search was reset.", "info", "memory", "/memories"),
              result: { query: "", matches: [] },
            };
          }

          const matches = buildMemorySearchResults(query, state);
          state.memorySearch.lastQuery = query;
          state.memorySearch.lastResults = matches;
          return {
            event: buildEvent("Memory search", `Found ${matches.length} recall matches for "${query}".`, matches.length ? "info" : "warning", "memory", "/memories"),
            result: { query, matches },
          };
        }
        case "open-project-surface": {
          const projectName = String(payload.projectName || "Project");
          const target = String(payload.target || "workspace");
          return {
            event: buildEvent("Project surface opened", `${projectName} opened in ${target}.`, "info", "projects", "/projects"),
            result: { projectName, target },
          };
        }
        case "open-doc-surface": {
          const docTitle = String(payload.docTitle || "Document");
          const actionLabel = String(payload.docAction || "open");
          return {
            event: buildEvent("Document action", `${actionLabel} executed for ${docTitle}.`, "info", "docs", "/docs"),
            result: { docTitle, action: actionLabel },
          };
        }
        case "send-voice-prompt": {
          const agentId = String(payload.agentId || "");
          const prompt = String(payload.prompt || "").trim();
          const agentName = agentNameFromId(agentId);
          ensureVoiceSession(state);
          state.voice.activeAgentId = agentId;
          state.voice.currentSession!.state = "processing";
          state.voice.currentSession!.connection = "stable";
          state.voice.currentSession!.transcript!.push({
            id: eventId("tr"),
            speaker: "TASK",
            tone: "operator",
            text: prompt,
            timestamp: nowIso(),
            confidence: 0.99,
          });
          const response = await AgentService.ask(agentName, prompt);
          state.voice.currentSession!.state = response.status === "ok" ? "listening" : "warning";
          state.voice.currentSession!.responsePreview = response.message;
          state.voice.currentSession!.waveform = response.status === "ok" ? [18, 34, 22, 41, 28, 19, 33, 46, 27, 18, 29, 36] : [14, 16, 18, 16, 15, 17, 16, 15, 14, 16, 17, 15];
          state.voice.currentSession!.transcript!.push({
            id: eventId("tr"),
            speaker: agentName,
            tone: response.status === "ok" ? "agent" : "warning",
            text: response.message,
            timestamp: response.timestamp,
            confidence: response.status === "ok" ? 0.97 : 0.74,
          });
          state.voice.currentSession!.transcript = state.voice.currentSession!.transcript!.slice(-MAX_VOICE_TRANSCRIPT);
          state.voice.sessionHistory!.unshift({
            id: eventId("vh"),
            agent: agentName,
            state: response.status === "ok" ? "completed" : "warning",
            startedAt: state.voice.currentSession!.startedAt || nowIso(),
            duration: durationFrom(state.voice.currentSession!.startedAt || nowIso()),
            summary: summarizePrompt(prompt),
          });
          state.voice.sessionHistory = state.voice.sessionHistory!.slice(0, MAX_VOICE_HISTORY);
          return { event: buildEvent("Voice command sent", `${agentName} received a new operator prompt.`, response.status === "ok" ? "info" : "warning", "voice", "/voice"), result: response };
        }
        case "create-task": {
          const title = String(payload.title || "").trim() || "Untitled task";
          const detail = String(payload.detail || "").trim() || "Task created from Mission Control.";
          const assignedAgentId = String(payload.assignedAgentId || "abdi").toLowerCase();
          const assignedAgent = agentNameFromId(assignedAgentId);
          const project = String(payload.project || "Mission Control");
          const task = {
            id: eventId("task"),
            title,
            status: "queued",
            owner: assignedAgent,
            assignedAgent,
            toolsUsed: ["mission_control"],
            executionTimeMs: 0,
            timestamp: nowIso(),
            success: null,
            trace: ["Task created in Mission Control", `Queued for ${assignedAgent}`, `Project context: ${project}`],
            detail,
            model: state.agentOverrides[assignedAgentId]?.currentModel || "routing pending",
            queuePosition: 1,
            project,
            approvalState: "none",
          };
          state.createdTasks.unshift(task);
          state.createdTasks = state.createdTasks.slice(0, 60);
          return { event: buildEvent("Task created", `${assignedAgent} received a new board task: ${title}.`, "info", "tasks", "/") };
        }
        case "save-note": {
          const noteId = String(payload.noteId || "");
          const body = String(payload.body || "");
          state.noteOverrides[noteId] = { ...(state.noteOverrides[noteId] || {}), body, preview: body.slice(0, 140), updatedAt: nowIso() };
          return { event: buildEvent("Note saved", `${noteId} was updated from the editor workspace.`, "info", "notes", "/notes") };
        }
        case "pin-note": {
          const noteId = String(payload.noteId || "");
          const nextPinned = Boolean(payload.pinned);
          state.noteOverrides[noteId] = { ...(state.noteOverrides[noteId] || {}), pinned: nextPinned, updatedAt: nowIso() };
          return { event: buildEvent(nextPinned ? "Note pinned" : "Note unpinned", `${noteId} pin state was updated.`, "info", "notes", "/notes") };
        }
        case "create-note": {
          const body = String(payload.body || "").trim();
          const title = String(payload.title || "Quick Capture").trim() || "Quick Capture";
          const folder = String(payload.folder || "Daily Operations");
          const project = String(payload.project || "Mission Control");
          const note = {
            id: eventId("note"),
            title,
            category: "operator",
            folder,
            updatedAt: nowIso(),
            project,
            pinned: false,
            tags: ["operator", "quick-capture"],
            preview: body.slice(0, 140),
            body,
          };
          state.createdNotes.unshift(note);
          state.createdNotes = state.createdNotes.slice(0, 30);
          return { event: buildEvent("Quick note captured", body, "info", "notes", "/notes") };
        }
        case "notion-operator-sync": {
          const projectData = buildProjectData();
          const projectId = String(payload.projectId || projectData.activeProjectId || projectData.items[0]?.id || "");
          if (!projectId) {
            return { event: buildEvent("Notion Sync Failed", "No active project is available for Notion sync.", "error", "notion-operator") };
          }
          try {
            const project = projectData.items.find((p: any) => p.id === projectId) as any;
            if (!project?.thirtyDayPlan) {
              return { event: buildEvent("Notion Sync Failed", `Project "${projectId}" not found or has no 30-day plan.`, "error", "notion-operator") };
            }
            const result = await NotionOperator.syncPlan(project.thirtyDayPlan as any);
            const msg = result.created
              ? `30-Day Plan page created in Notion: ${result.url}`
              : `30-Day Plan page updated in Notion: ${result.url}`;
            return { event: buildEvent("Notion Sync Complete", msg, "info", "notion-operator"), data: result };
          } catch (err: any) {
            return { event: buildEvent("Notion Sync Error", err?.message || "Unknown error", "error", "notion-operator") };
          }
        }
        default:
          return { event: buildEvent("Unknown action", `Mission Control received an unsupported action: ${action}.`, "warning", "mission-control") };
      }
    });
  }

  static getEvents() {
    return readState().operatorEvents;
  }

  static applyToPayload(basePayload: any) {
    const payload = clone(basePayload);
    const state = readState();

    payload.agents.forEach((agent: any) => {
      const override = state.agentOverrides[agent.id];
      if (override) {
        Object.assign(agent, override);
      }
    });

    payload.voice.agents = payload.voice.agents.map((agent: any) => {
      const fullAgent = payload.agents.find((entry: any) => entry.id === agent.id);
      return fullAgent
        ? {
            ...agent,
            currentModel: fullAgent.currentModel,
            fallbackModel: fullAgent.backupModel,
            status: state.voice.activeAgentId === agent.id ? "live" : fullAgent.status,
          }
        : agent;
    });

    if (state.voice.activeAgentId) {
      payload.voice.activeAgentId = state.voice.activeAgentId;
    }
    if (state.voice.audioInput) {
      payload.voice.audioInput = state.voice.audioInput;
    }
    if (state.voice.audioOutput) {
      payload.voice.audioOutput = state.voice.audioOutput;
    }
    if (state.voice.currentSession) {
      payload.voice.currentSession = {
        ...payload.voice.currentSession,
        ...state.voice.currentSession,
        transcript: state.voice.currentSession.transcript || payload.voice.currentSession.transcript,
      };
    }
    if (state.voice.sessionHistory?.length) {
      payload.voice.sessionHistory = state.voice.sessionHistory;
    }

    payload.tasks.tasks = payload.tasks.tasks.map((task: any) => {
      const override = state.taskOverrides[task.id];
      const merged = override ? { ...task, ...override } : task;
      if (!merged.approvalState) {
        merged.approvalState = merged.status === "failed" ? "attention" : "none";
      }
      return merged;
    });
    if (state.createdTasks.length) {
      payload.tasks.tasks = [...state.createdTasks, ...payload.tasks.tasks.filter((task: any) => !state.createdTasks.some((created) => created.id === task.id))];
    }
    payload.tasks.tasks = payload.tasks.tasks.map((task: any) =>
      task.approvalState
        ? task
        : {
            ...task,
            approvalState: task.status === "failed" ? "attention" : "none",
          }
    );
    payload.tasks.approvals = payload.tasks.tasks.filter((task: any) =>
      ["pending", "attention", "rejected"].includes(String(task.approvalState || "none"))
    );

    payload.notes.items = payload.notes.items.map((note: any) => {
      const override = state.noteOverrides[note.id];
      return override ? { ...note, ...override } : note;
    });
    if (state.createdNotes.length) {
      payload.notes.items = [...state.createdNotes, ...payload.notes.items.filter((note: any) => !state.createdNotes.some((created) => created.id === note.id))];
    }
    payload.notes.pinnedIds = payload.notes.items.filter((note: any) => note.pinned).map((note: any) => note.id);
    const folderEntries = Array.from(
      payload.notes.items.reduce((map: Map<string, { id: string; label: string; count: number }>, note: any) => {
        const key = note.folder.toLowerCase().replace(/\s+/g, "-");
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { id: key, label: note.folder, count: 1 });
        }
        return map;
      }, new Map<string, { id: string; label: string; count: number }>())
    ) as Array<[string, { id: string; label: string; count: number }]>;
    payload.notes.folders = folderEntries.map((entry) => entry[1]);

    const calendarEvents = [
      ...(Array.isArray(payload.calendar.events) ? payload.calendar.events : []),
      ...state.calendar.syncedEvents,
      ...state.calendar.createdEvents,
    ]
      .map((entry: any) => normalizeCalendarEvent(entry))
      .reduce((accumulator: Array<Record<string, any>>, event) => {
        upsertCalendarEvent(accumulator, event);
        return accumulator;
      }, []);
    const sortedCalendarEvents = sortCalendarEvents(calendarEvents);
    payload.calendar.events = sortedCalendarEvents;
    payload.calendar.upcoming = sortedCalendarEvents
      .filter((entry) => new Date(entry.end || entry.start).getTime() >= Date.now() - 60_000)
      .slice(0, 8);
    payload.calendar.primaryCalendarId = state.calendar.primaryCalendarId || payload.calendar.primaryCalendarId || "primary";
    payload.calendar.syncState = state.calendar.syncState || payload.calendar.syncState;
    payload.calendar.lastSyncedAt = state.calendar.lastSyncedAt || payload.calendar.lastSyncedAt || null;

    payload.memory.search = {
      lastQuery: state.memorySearch.lastQuery || "",
      results: state.memorySearch.lastResults || [],
    };

    payload.protocols = payload.protocols.map((protocol: any) => {
      const override = state.protocolOverrides[protocol.id];
      return override ? { ...protocol, ...override } : protocol;
    });

    payload.integrations.integrations = payload.integrations.integrations.map((integration: any) => {
      const override = state.integrationOverrides[integration.id];
      return override ? { ...integration, ...override } : integration;
    });

    if (state.mcp.transportState) {
      payload.mcp.transportState = { ...payload.mcp.transportState, ...state.mcp.transportState };
    }
    if (state.mcp.serverHealth) {
      payload.mcp.serverHealth = state.mcp.serverHealth;
    }
    if (state.mcp.recentToolCalls.length) {
      payload.mcp.recentToolCalls = [...state.mcp.recentToolCalls, ...payload.mcp.recentToolCalls].slice(0, 18);
    }

    if (state.openclaw.gatewayState) {
      payload.openclaw.gatewayState = state.openclaw.gatewayState;
    }
    if (state.openclaw.nodeState) {
      payload.openclaw.nodeState = state.openclaw.nodeState;
    }
    if (state.openclaw.serviceHealth) {
      payload.openclaw.serviceHealth = state.openclaw.serviceHealth;
    }
    if (state.openclaw.commandHistory.length) {
      payload.openclaw.commandHistory = [...state.openclaw.commandHistory, ...payload.openclaw.commandHistory].slice(0, 12);
    }

    payload.tools.tools = payload.tools.tools.map((tool: any) => {
      const override = state.toolOverrides[tool.id];
      return override ? { ...tool, ...override, metrics: { ...tool.metrics, ...(override.metrics || {}) } } : tool;
    });

    payload.toolStore.inventory = payload.toolStore.inventory.map((tool: any) => {
      const storeState = state.storeTools[tool.id];
      const next = storeState
        ? {
            ...tool,
            installState: storeState.installState || tool.installState,
            validationState: storeState.validationState || tool.validationState,
            configuredCredentialHints: Object.fromEntries(
              Object.entries(storeState.configuredCredentials || {}).map(([key, value]) => [key, maskSecret(String(value))])
            ),
          }
        : tool;

      if (storeState?.installState === "enabled" || storeState?.installState === "pending") {
        installManagedTool(payload, next, storeState);
      }

      return next;
    });
    payload.toolStore.featured = payload.toolStore.inventory.slice(0, 3);
    payload.toolStore.installQueue = payload.toolStore.inventory
      .filter((tool: any) => tool.installState !== "enabled")
      .slice(0, 4)
      .map((tool: any, index: number) => ({
        id: `queue-${tool.id}`,
        tool: tool.name,
        state: tool.validationState === "credentials-required" ? "pending-credentials" : tool.installState,
        owner: ["Ahmed", "Atlas", "Ayub", "Sygma"][index % 4],
      }));

    const operatorLogEvents = state.operatorEvents.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      stream: event.source,
      level: event.level,
      summary: event.title,
      detail: event.detail,
    }));
    payload.logs.events = [...operatorLogEvents, ...payload.logs.events]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 80);
    payload.logs.counts = {
      info: payload.logs.events.filter((event: any) => event.level === "info").length,
      warning: payload.logs.events.filter((event: any) => event.level === "warning").length,
      error: payload.logs.events.filter((event: any) => event.level === "error").length,
    };

    if (state.recentCommands.length) {
      payload.recentCommands = [...state.recentCommands, ...payload.recentCommands].slice(0, 12);
    }

    payload.alerts = [
      ...payload.logs.events
        .filter((event: any) => event.level !== "info")
        .slice(0, 6)
        .map((event: any, index: number) => ({
          id: `alert-live-${index}`,
          level: event.level,
          title: `${event.stream} event`,
          message: event.summary,
          timestamp: event.timestamp,
        })),
      ...payload.alerts,
    ].slice(0, 8);

    return recalcPayload(payload);
  }
}
