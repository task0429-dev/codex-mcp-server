export const SESSION_STORAGE_KEY = "task-mission-control-session";
export const PASSWORD_HASH = "7ed1848e77f6e622bcc5e89a038de5f334b974fc7464e06e46b5391617ad64a6";
export const PASSWORD_PLAIN = "abdicade312";
export const LOCK_TIMEOUT_MS = 60 * 60 * 1000;

export type SessionRecord = {
  unlockedAt: number;
  lastActiveAt: number;
};

export function cloneData<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

export async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto unavailable");
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((entry) => entry.toString(16).padStart(2, "0"))
    .join("");
}

export function readSession(): SessionRecord | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SessionRecord;
    if (!parsed?.lastActiveAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(record: SessionRecord) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(record));
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function ensureModelEntry(next: any, modelId: string, providerHint = "Operator Assigned") {
  const existing = next.models.catalog.find((model: any) => model.id === modelId);
  if (existing) {
    return existing;
  }

  const created = {
    id: modelId,
    label: modelId,
    provider: providerHint,
    family: "Assigned",
    status: "online",
    assignedAgents: [],
    fallbackAgents: [],
    specialization: "Operator assigned runtime model",
    latencyMs: 780,
    costIndex: "balanced",
    usageShare: 0,
    preferred: false,
  };
  next.models.catalog.unshift(created);
  return created;
}

export function recalculateData(next: any) {
  const onlineAgents = next.agents.filter((agent: any) => agent.status === "online").length;
  const monitoredAgents = next.agents.filter((agent: any) => ["degraded", "warning", "standby"].includes(agent.status)).length;
  const offlineAgents = next.agents.filter((agent: any) => agent.status === "offline").length;
  const activeTasks = next.tasks.tasks.filter((task: any) => task.status === "active");
  const queuedTasks = next.tasks.tasks.filter((task: any) => task.status === "queued");
  const failedTasks = next.tasks.tasks.filter((task: any) => task.status === "failed");
  const enabledTools = next.tools.tools.filter((tool: any) => tool.status === "online").length;
  const connectedIntegrations = next.integrations.integrations.filter((integration: any) => ["connected", "online", "configured"].includes(integration.state)).length;
  const averageHealth = Math.round(next.agents.reduce((sum: number, agent: any) => sum + (agent.healthScore || 0), 0) / Math.max(1, next.agents.length));
  const logAlerts = next.logs.events.filter((event: any) => event.level !== "info").length;
  const localAlerts = next.alerts?.length || 0;

  next.summary = {
    ...next.summary,
    agentsOnline: onlineAgents,
    agentsDegraded: monitoredAgents,
    agentsOffline: offlineAgents,
    totalAgents: next.agents.length,
    totalTools: next.tools.tools.length,
    enabledTools,
    totalProtocols: next.protocols.length,
    connectedIntegrations,
    activeTasks: activeTasks.length,
    queuedTasks: queuedTasks.length,
    failedTasks: failedTasks.length,
    alerts: Math.max(logAlerts, localAlerts),
    overallHealth: averageHealth,
  };

  next.tasks.activeCount = activeTasks.length;
  next.tasks.queuedCount = queuedTasks.length;
  next.tasks.failedCount = failedTasks.length;
  next.tasks.completedCount = next.tasks.tasks.filter((task: any) => task.status === "completed").length;

  next.workspace.activeTasks = activeTasks.slice(0, 3).map((task: any) => ({
    id: task.id,
    title: task.title,
    assignedAgent: task.assignedAgent,
    timestamp: task.timestamp,
    status: task.status,
  }));

  next.workspace.focusAreas = [
    { label: "Online Agents", value: `${onlineAgents}/${next.agents.length}`, tone: "online" },
    { label: "Active Tasks", value: `${activeTasks.length}`, tone: activeTasks.length > 0 ? "warning" : "online" },
    { label: "Pinned Notes", value: `${next.notes.items.filter((note: any) => note.pinned).length}`, tone: "neutral" },
    { label: "Upcoming Events", value: `${next.calendar.upcoming.length}`, tone: "neutral" },
  ];

  next.mcp.enabledToolCount = enabledTools;
  next.mcp.totalToolCount = next.tools.tools.length;
  next.mcp.activeProtocols = next.protocols.filter((protocol: any) => protocol.state !== "offline").length;
  next.mcp.groups = next.tools.groups.map((group: any) => {
    const groupTools = next.tools.tools.filter((tool: any) => tool.group === group.key);
    return {
      ...group,
      enabled: groupTools.some((tool: any) => tool.status === "online"),
      tools: group.tools,
    };
  });

  next.models.assignments = next.agents.map((agent: any) => ({
    agent: agent.name,
    primaryModel: agent.currentModel,
    backupModel: agent.backupModel,
    provider: agent.provider,
    status: agent.status,
    routingRule: agent.provider === "gateway" ? "Route through OpenClaw gateway first, then fallback" : "Route through provider primary, then role fallback",
    specialization: agent.specialty,
    confidence: Number((0.86 + ((agent.healthScore || 80) - 80) / 200).toFixed(2)),
  }));

  next.models.catalog.forEach((model: any) => {
    model.assignedAgents = next.agents.filter((agent: any) => agent.currentModel === model.id).map((agent: any) => agent.name);
    model.fallbackAgents = next.agents.filter((agent: any) => agent.backupModel === model.id).map((agent: any) => agent.name);
    model.usageShare = model.assignedAgents.length * 9 + model.fallbackAgents.length * 3;
    if (!model.status) {
      model.status = "online";
    }
  });

  next.openclaw.connectedAgents = next.agents.filter((agent: any) => agent.connectivity?.openclaw).map((agent: any) => agent.name);
  next.openclaw.activeSessions = next.agents.filter((agent: any) => agent.status === "online").length + 1;

  return next;
}

export function applyDataMutation(current: any, mutator: (draft: any) => void) {
  const next = cloneData(current);
  mutator(next);
  return recalculateData(next);
}

export function assignAgentModel(next: any, agentId: string, modelId: string, field: "currentModel" | "backupModel") {
  const agent = next.agents.find((entry: any) => entry.id === agentId);
  if (!agent || !modelId.trim()) {
    return;
  }

  agent[field] = modelId;
  ensureModelEntry(next, modelId);
}
