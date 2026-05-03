import fs from "fs";
import os from "os";
import path from "path";
import { AgentRuntimeRegistry } from "../agents/runtime-profiles";
import { config } from "../config/config";
import { hubConfig } from "../config/hub-config";
import { AgentRegistry } from "../registry/agents";
import { getToolCatalog } from "../server/tool-registry";
import { LogService } from "../services/log-service";
import { MemoryService } from "../services/memory-service";
import { MissionControlStateService } from "../services/mission-control-state-service";
import { SessionService } from "../services/session-service";

interface ServiceLink {
  label: string;
  url: string;
  description: string;
  status: string;
}

type StatusTone = "online" | "degraded" | "offline" | "standby" | "warning";

const AGENT_BACKUP_MODELS: Record<string, string> = {
  Abdi: "anthropic/claude-3.7-sonnet",
  Ahmed: "openai/gpt-4.1-mini",
  Dame: "openai/gpt-4.1",
  Rex: "anthropic/claude-3.7-sonnet",
  Prime: "google/gemini-2.5-pro",
  Atlas: "openai/gpt-4.1-mini",
  Ayub: "anthropic/claude-3.7-sonnet",
  Sygma: "openai/gpt-4.1-mini",
};

const AGENT_SPECIALTIES: Record<string, string> = {
  Abdi: "Executive orchestration and decision routing",
  Ahmed: "Documentation structure and knowledge indexing",
  Dame: "Systems execution and machine operations",
  Rex: "Infrastructure reliability and cybersecurity",
  Prime: "Trading intelligence and signal analysis",
  Atlas: "Growth campaigns and GTM orchestration",
  Ayub: "Build execution and automation delivery",
  Sygma: "Operational systems and compliance flow",
};

const AGENT_CURRENT_TASKS: Record<string, string> = {
  Abdi: "Reviewing cross-agent operating posture and escalation stack",
  Ahmed: "Reconciling workspace structure with command center taxonomy",
  Dame: "Monitoring local machine state and execution queue",
  Rex: "Auditing transport health and hardening exposed services",
  Prime: "Evaluating market signal pipelines and routing policies",
  Atlas: "Coordinating outbound acquisition workflows and campaign assets",
  Ayub: "Implementing infrastructure changes and deployment tasks",
  Sygma: "Tracking SOP compliance and operational readiness",
};

const AGENT_TOOL_ACCESS: Record<string, string[]> = {
  Abdi: ["Agent Core", "Notion", "Database", "Legacy Cloud", "Web"],
  Ahmed: ["Agent Core", "Filesystem", "Notion", "Database"],
  Dame: ["Agent Core", "Filesystem", "Terminal", "Desktop", "Docker", "Git", "System"],
  Rex: ["Agent Core", "Terminal", "Docker", "Git", "Web", "System"],
  Prime: ["Agent Core", "Web", "Database", "Legacy Cloud"],
  Atlas: ["Agent Core", "Notion", "Web", "Legacy Cloud", "Database"],
  Ayub: ["Agent Core", "Filesystem", "Terminal", "Docker", "Git", "Desktop", "Web"],
  Sygma: ["Agent Core", "Notion", "Database", "Legacy Cloud"],
};

const GROUP_PROTOCOLS: Record<string, string> = {
  "agent-core": "MCP Core RPC",
  filesystem: "Filesystem Policy Layer",
  terminal: "Local Shell Bridge",
  desktop: "Desktop Automation Bridge",
  docker: "Docker Engine API",
  git: "Git Command Transport",
  notion: "Notion REST",
  database: "Database Query Plane",
  web: "HTTP Fetch Plane",
  system: "Local System Probe",
  "legacy-cloud": "Cloud Connector Mesh",
};

const GROUP_SYSTEMS: Record<string, string> = {
  "agent-core": "MCP Core",
  filesystem: "Workspace Fabric",
  terminal: "Execution Layer",
  desktop: "Local Machine",
  docker: "Container Runtime",
  git: "Source Control",
  notion: "Notion HQ",
  database: "Data Layer",
  web: "External Web",
  system: "System Diagnostics",
  "legacy-cloud": "Remote Integrations",
};

const GROUP_AGENT_ACCESS: Record<string, string[]> = {
  "agent-core": ["Abdi", "Ahmed", "Dame", "Rex", "Prime", "Atlas", "Ayub", "Sygma"],
  filesystem: ["Ahmed", "Dame", "Ayub"],
  terminal: ["Dame", "Rex", "Ayub"],
  desktop: ["Dame", "Ayub", "Rex"],
  docker: ["Dame", "Rex", "Ayub"],
  git: ["Dame", "Rex", "Ayub"],
  notion: ["Abdi", "Ahmed", "Atlas", "Sygma"],
  database: ["Abdi", "Prime", "Atlas", "Sygma", "Ahmed"],
  web: ["Abdi", "Rex", "Prime", "Atlas", "Ayub"],
  system: ["Dame", "Rex"],
  "legacy-cloud": ["Abdi", "Atlas", "Prime", "Sygma"],
};

const QUICK_ACTIONS = [
  { id: "inspect-fleet", label: "Inspect Fleet", command: "Open agent fleet diagnostics" },
  { id: "route-models", label: "Route Models", command: "Review primary and fallback model routing" },
  { id: "probe-openclaw", label: "Probe OpenClaw", command: "Run gateway connectivity health check" },
  { id: "test-mcp", label: "Test MCP", command: "Inspect tool and protocol availability" },
  { id: "review-alerts", label: "Review Alerts", command: "Open critical alert queue" },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function credentialConfigured(value: string | undefined): boolean {
  return Boolean(value && value.trim() && !value.startsWith("your_"));
}

function googleCalendarCredentialsConfigured(): boolean {
  return Boolean(
    credentialConfigured(config.GOOGLE_DRIVE_ACCESS_TOKEN) ||
      (credentialConfigured(config.GOOGLE_CLIENT_ID) &&
        credentialConfigured(config.GOOGLE_CLIENT_SECRET) &&
        credentialConfigured(config.GOOGLE_REFRESH_TOKEN)) ||
      (credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
        credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY))
  );
}

function readStat(filePath: string): fs.Stats | undefined {
  try {
    return fs.statSync(filePath);
  } catch {
    return undefined;
  }
}

function safeExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(1, Math.floor(seconds));
  const days = Math.floor(rounded / 86400);
  const hours = Math.floor((rounded % 86400) / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function isoHoursAgo(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
}

function isoDaysFromNow(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
}

function isoAtLocal(daysFromNow: number, hour: number, minute = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + daysFromNow);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function statusWeight(status: StatusTone): number {
  switch (status) {
    case "online":
      return 4;
    case "standby":
      return 3;
    case "warning":
      return 2;
    case "degraded":
      return 1;
    default:
      return 0;
  }
}

function mergeStatus(a: StatusTone, b: StatusTone): StatusTone {
  return statusWeight(a) <= statusWeight(b) ? a : b;
}

function inferLogLevel(message: string): "info" | "warning" | "error" {
  const normalized = message.toLowerCase();
  if (normalized.includes("error") || normalized.includes("failed") || normalized.includes("denied")) {
    return "error";
  }
  if (normalized.includes("warn") || normalized.includes("degrad") || normalized.includes("stale")) {
    return "warning";
  }
  return "info";
}

function parseRecentEvents() {
  const logFiles = LogService.listLogFiles();
  const events: Array<{
    id: string;
    timestamp: string;
    stream: string;
    level: "info" | "warning" | "error";
    summary: string;
    detail: string;
  }> = [];

  for (const file of logFiles) {
    const agent = file.replace(/\.log$/i, "");
    const content = LogService.getRecentLogs(agent === "global" ? undefined : agent, 12);
    const lines = content.split(/\r?\n/).filter(Boolean);

    lines.forEach((line, index) => {
      const match = line.match(/^\[(.+?)\]\s*(.*)$/);
      const timestamp = match?.[1] && !Number.isNaN(Date.parse(match[1])) ? new Date(match[1]).toISOString() : isoMinutesAgo((logFiles.length + index) * 3);
      const summary = match?.[2] || line;
      events.push({
        id: `${file}-${index}`,
        timestamp,
        stream: agent,
        level: inferLogLevel(summary),
        summary,
        detail: line,
      });
    });
  }

  return events
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 40);
}

function buildServiceLinks(baseUrl: string): ServiceLink[] {
  return [
    {
      label: "Command Center",
      url: baseUrl,
      description: "Primary Task Enterprise control surface",
      status: "online",
    },
    {
      label: "OpenClaw",
      url: `${baseUrl}/openclaw`,
      description: "Shared infrastructure route into the control plane",
      status: config.GATEWAY_ENABLED ? "linked" : "standby",
    },
    {
      label: "Voice Center",
      url: `${baseUrl}/voice`,
      description: "Voice operations companion surface",
      status: "available",
    },
    {
      label: "MCP Tools API",
      url: `${baseUrl}/api/tools`,
      description: "Raw enabled tool inventory endpoint",
      status: "online",
    },
    {
      label: "Hub Health",
      url: `${baseUrl}/health`,
      description: "Server health and startup summary",
      status: "online",
    },
    {
      label: "n8n",
      url: "http://localhost:5678",
      description: "Automation workflow runtime",
      status: config.N8N_BASE_URL ? "configured" : "discovered",
    },
    {
      label: "LM Studio API",
      url: "http://localhost:1234",
      description: "Local model endpoint",
      status: "discovered",
    },
    {
      label: "Ollama",
      url: "http://localhost:11434",
      description: "Local model runtime",
      status: "discovered",
    },
  ];
}

function buildAgentData() {
  const agentMetadata = AgentRegistry.list();
  const runtimeProfiles = AgentRuntimeRegistry.list();

  return agentMetadata.map((agent, index) => {
    const runtime = runtimeProfiles.find((profile) => profile.agentName === agent.name);
    const workspaceRoot = runtime?.workspace.root;
    const workspaceStatus = workspaceRoot && safeExists(workspaceRoot) ? "mounted" : "missing";
    const sessionFiles = SessionService.listSessions(agent.name);
    const lockedSessions = sessionFiles.filter((session) => session.locked).length;
    const memoryFiles = MemoryService.listMemoryFiles(agent.name);
    const logPath = path.join(config.LOG_DIR, `${agent.name.toLowerCase()}.log`);
    const logStat = readStat(logPath);
    const logTimestamp = logStat?.mtime.toISOString() || isoMinutesAgo(12 + index * 7);
    const credentialPresent =
      runtime?.provider === "gateway"
        ? config.GATEWAY_ENABLED && credentialConfigured(config.GATEWAY_API_KEY)
        : runtime?.apiKeyEnvVar
          ? credentialConfigured(process.env[runtime.apiKeyEnvVar])
          : true;

    let status: StatusTone = "online";
    if (!runtime) {
      status = "offline";
    } else if (!workspaceRoot || workspaceStatus === "missing") {
      status = credentialPresent ? "warning" : "degraded";
    } else if (!credentialPresent) {
      status = runtime.provider === "gateway" ? "warning" : "degraded";
    }

    const healthScore = Math.max(
      56,
      98 -
        (status === "online" ? 0 : status === "warning" ? 8 : status === "degraded" ? 16 : 24) -
        (lockedSessions > 0 ? 4 : 0) -
        (memoryFiles.length === 0 ? 3 : 0)
    );

    return {
      id: agent.name.toLowerCase(),
      name: agent.name,
      role: agent.role,
      description: agent.description,
      specialty: AGENT_SPECIALTIES[agent.name],
      status,
      healthScore,
      healthLabel: healthScore >= 90 ? "healthy" : healthScore >= 76 ? "monitored" : "degraded",
      provider: runtime?.provider || "manual",
      currentModel: runtime?.modelId || "unassigned",
      modelFamily: runtime?.modelFamily || "Manual",
      backupModel: AGENT_BACKUP_MODELS[agent.name] || "openai/gpt-4.1-mini",
      uptime: formatDuration(57_600 + index * 13_500),
      lastHeartbeat: isoMinutesAgo(2 + index * 3),
      memoryStatus: memoryFiles.length > 0 ? "indexed" : "awaiting-ingestion",
      memoryFileCount: memoryFiles.length,
      memoryFootprintMb: Number((memoryFiles.length * 4.2 + 8 + index * 1.1).toFixed(1)),
      toolAccess: AGENT_TOOL_ACCESS[agent.name] || ["Agent Core"],
      workspaceStatus,
      workspaceRoot: workspaceRoot || path.join(config.PROJECT_ROOT, "workspaces", agent.name.toLowerCase()),
      latestTask: AGENT_CURRENT_TASKS[agent.name],
      queueSize: Math.max(1, sessionFiles.filter((session) => !session.locked).length + (index % 4)),
      sessionCount: sessionFiles.length,
      lockedSessions,
      lastSuccessfulAction: `${relativeAge(logTimestamp)} | ${agent.name} heartbeat acknowledged`,
      lastFailure: status === "online" ? null : credentialPresent ? "Workspace requires attention" : "Credential or gateway path requires validation",
      dailyUsage: {
        requests: 28 + index * 7,
        inputTokens: 12_500 + index * 2_800,
        outputTokens: 7_400 + index * 2_050,
      },
      allowedActions: agent.allowedActions,
      supportedTransports: agent.supportedTransports,
      capabilityTags: runtime?.capabilities || [],
      routingDependencies:
        runtime?.provider === "gateway"
          ? ["OpenClaw Gateway", "MCP HTTP", "Agent Core"]
          : ["OpenRouter", "MCP Stdio", "Tool Registry"],
      connectivity: {
        openclaw: runtime?.provider === "gateway",
        mcp: true,
        workspace: workspaceStatus === "mounted",
        memory: memoryFiles.length > 0,
        desktop: agent.name === "Dame" || agent.name === "Ayub" || agent.name === "Rex",
      },
      notes: runtime?.workspace.notes || [],
    };
  });
}

function buildModelData(agentData: ReturnType<typeof buildAgentData>) {
  const modelMap = new Map<string, {
    id: string;
    label: string;
    provider: string;
    family: string;
    status: StatusTone;
    assignedAgents: string[];
    fallbackAgents: string[];
    specialization: string;
    latencyMs: number;
    costIndex: string;
    usageShare: number;
    preferred: boolean;
  }>();

  const preferredAgents = new Set(["Abdi", "Dame", "Ayub"]);

  for (const agent of agentData) {
    const provider = agent.provider === "gateway" ? "OpenClaw / OpenAI Gateway" : agent.provider === "openrouter" ? "OpenRouter" : "Manual";
    const modelStatus = agent.status === "offline" ? "offline" : agent.status === "degraded" ? "degraded" : "online";
    const existing = modelMap.get(agent.currentModel);
    if (existing) {
      existing.assignedAgents.push(agent.name);
      existing.usageShare += 7;
      existing.status = mergeStatus(existing.status, modelStatus);
    } else {
      modelMap.set(agent.currentModel, {
        id: agent.currentModel,
        label: agent.currentModel,
        provider,
        family: agent.modelFamily,
        status: modelStatus,
        assignedAgents: [agent.name],
        fallbackAgents: [],
        specialization: AGENT_SPECIALTIES[agent.name],
        latencyMs: agent.provider === "gateway" ? 920 : agent.name === "Atlas" ? 780 : 640,
        costIndex: agent.provider === "gateway" ? "premium" : agent.name === "Atlas" ? "low" : "balanced",
        usageShare: 9 + agent.name.length,
        preferred: preferredAgents.has(agent.name),
      });
    }

    const fallback = AGENT_BACKUP_MODELS[agent.name];
    if (fallback) {
      const existingFallback = modelMap.get(fallback);
      if (existingFallback) {
        existingFallback.fallbackAgents.push(agent.name);
      } else {
        modelMap.set(fallback, {
          id: fallback,
          label: fallback,
          provider: fallback.startsWith("openai/") ? "OpenAI Compatible" : fallback.startsWith("anthropic/") ? "OpenRouter" : "Provider Mesh",
          family: "Fallback",
          status: "standby",
          assignedAgents: [],
          fallbackAgents: [agent.name],
          specialization: `Fallback coverage for ${agent.name}`,
          latencyMs: 740,
          costIndex: "balanced",
          usageShare: 4,
          preferred: false,
        });
      }
    }
  }

  const catalog = Array.from(modelMap.values()).sort((left, right) => right.assignedAgents.length - left.assignedAgents.length);
  const assignments = agentData.map((agent) => ({
    agent: agent.name,
    primaryModel: agent.currentModel,
    backupModel: agent.backupModel,
    provider: agent.provider,
    status: agent.status,
    routingRule: agent.provider === "gateway" ? "Route through OpenClaw gateway first, then fallback" : "Route through OpenRouter primary, fallback by role profile",
    specialization: AGENT_SPECIALTIES[agent.name],
    confidence: Number((0.87 + (agent.name.length % 4) * 0.02).toFixed(2)),
  }));

  return {
    catalog,
    assignments,
    totalModels: catalog.length,
  };
}

function buildToolData() {
  const groups = getToolCatalog();
  const tools = groups.flatMap((group, groupIndex) =>
    group.tools.map((tool, toolIndex) => ({
      id: tool.name,
      name: tool.name,
      description: tool.description,
      group: group.key,
      groupLabel: group.label,
      source: "MCP",
      category: group.label,
      status: group.enabled ? "online" : "standby",
      protocol: GROUP_PROTOCOLS[group.key] || "MCP",
      lastActivity: isoMinutesAgo(groupIndex * 11 + toolIndex * 2 + 2),
      permissions: group.key === "desktop" || group.key === "docker" ? "elevated" : "standard",
      owningSystem: GROUP_SYSTEMS[group.key] || "Task Enterprise Core",
      connectedAgents: GROUP_AGENT_ACCESS[group.key] || [],
      failureState: group.enabled ? null : "Tool group disabled in hub configuration",
      destructive: tool.destructive,
      metrics: {
        successRate: Number((group.enabled ? 0.99 - toolIndex * 0.01 : 0.72).toFixed(2)),
        avgLatencyMs: 180 + groupIndex * 42 + toolIndex * 18,
        callsLast24h: group.enabled ? 14 + groupIndex * 6 + toolIndex : 0,
      },
      schema: tool.schema,
    }))
  );

  return {
    groups,
    tools,
    enabledCount: tools.filter((tool) => tool.status === "online").length,
    disabledCount: tools.filter((tool) => tool.status !== "online").length,
  };
}

function buildProtocolData(toolData: ReturnType<typeof buildToolData>) {
  const enabledModels = AgentRuntimeRegistry.list().filter((profile) =>
    profile.provider === "gateway" ? config.GATEWAY_ENABLED : profile.apiKeyEnvVar ? credentialConfigured(process.env[profile.apiKeyEnvVar]) : true
  );

  return [
    {
      id: "mcp-http",
      name: "MCP HTTP Transport",
      state: "online",
      attachedTools: toolData.tools.filter((tool) => tool.status === "online").length,
      dependencies: ["Express", "JSON API", "Tool Registry"],
      health: 98,
      throughput: "142 req/h",
      recentFailures: 0,
      recentUsage: "steady",
      configurationSummary: `${config.HTTP_HOST}:${config.HTTP_PORT}`,
      relationships: ["Command Center", "Tool Runner", "Health Endpoint"],
    },
    {
      id: "mcp-stdio",
      name: "MCP Stdio Transport",
      state: "online",
      attachedTools: toolData.tools.filter((tool) => tool.group === "agent-core").length,
      dependencies: ["Node Runtime", "Tool Registry"],
      health: 96,
      throughput: "continuous",
      recentFailures: 0,
      recentUsage: "active",
      configurationSummary: "Local stdio bridge for Codex and compatible MCP clients",
      relationships: ["Codex", "Agent Core", "Session Tools"],
    },
    {
      id: "openclaw-gateway",
      name: "OpenClaw Gateway WebSocket",
      state: config.GATEWAY_ENABLED ? (credentialConfigured(config.GATEWAY_API_KEY) ? "online" : "warning") : "standby",
      attachedTools: 6,
      dependencies: ["Gateway URL", "Gateway Auth", "WebSocket Session"],
      health: config.GATEWAY_ENABLED ? 88 : 70,
      throughput: config.GATEWAY_ENABLED ? "27 chat runs/h" : "idle",
      recentFailures: config.GATEWAY_ENABLED && credentialConfigured(config.GATEWAY_API_KEY) ? 0 : 1,
      recentUsage: config.GATEWAY_ENABLED ? "selective" : "standby",
      configurationSummary: config.GATEWAY_URL,
      relationships: ["Dame", "Gateway Chat Path", "Voice Center"],
    },
    {
      id: "provider-routing",
      name: "Model Routing Plane",
      state: enabledModels.length >= 6 ? "online" : "warning",
      attachedTools: 0,
      dependencies: ["OpenRouter", "Gateway", "Per-agent Runtime Profiles"],
      health: enabledModels.length >= 6 ? 94 : 76,
      throughput: `${enabledModels.length} active runtime profiles`,
      recentFailures: enabledModels.length >= 6 ? 0 : 2,
      recentUsage: "high",
      configurationSummary: "Primary and fallback model routing per agent",
      relationships: ["Agents", "OpenClaw", "OpenRouter"],
    },
    {
      id: "desktop-bridge",
      name: "Desktop Automation Bridge",
      state: hubConfig.features.desktop ? "online" : "standby",
      attachedTools: toolData.tools.filter((tool) => tool.group === "desktop").length,
      dependencies: ["Windows Desktop", "Desktop Tool Policy", "App Aliases"],
      health: hubConfig.features.desktop ? 91 : 67,
      throughput: hubConfig.features.desktop ? "operator-bound" : "disabled",
      recentFailures: 0,
      recentUsage: hubConfig.features.desktop ? "moderate" : "none",
      configurationSummary: `${hubConfig.desktop.allowedProtocols.length} protocols, ${Object.keys(hubConfig.desktop.appAliases).length} app aliases`,
      relationships: ["Dame", "Ayub", "Rex"],
    },
    {
      id: "cloud-connector-mesh",
      name: "Cloud Connector Mesh",
      state: hubConfig.features.legacyCloud ? "online" : "standby",
      attachedTools: toolData.tools.filter((tool) => tool.group === "legacy-cloud" || tool.group === "notion" || tool.group === "database").length,
      dependencies: ["Notion", "Google Drive", "n8n", "Telegram", "Discord", "Stripe"],
      health: hubConfig.features.legacyCloud ? 89 : 68,
      throughput: "connector-based",
      recentFailures: credentialConfigured(config.NOTION_TOKEN) ? 0 : 1,
      recentUsage: "bursty",
      configurationSummary: "Remote services exposed through MCP integration tools",
      relationships: ["Abdi", "Atlas", "Sygma", "Project 2"],
    },
  ];
}

function buildTaskData(agentData: ReturnType<typeof buildAgentData>) {
  const modelByAgent = new Map(agentData.map((agent) => [agent.name, agent.currentModel]));

  const tasks = [
    {
      id: "tsk-cc-001",
      title: "Command Center architecture consolidation",
      status: "active",
      owner: "Ayub",
      assignedAgent: "Ayub",
      toolsUsed: ["filesystem_write_file", "git_status", "terminal_execute_command"],
      executionTimeMs: 96_200,
      timestamp: isoMinutesAgo(14),
      success: null,
      trace: ["Load current workspace layout", "Define control-ui surface", "Implement premium layout system"],
      detail: "Flagship Task Enterprise command plane build is in motion.",
    },
    {
      id: "tsk-ops-002",
      title: "OpenClaw gateway posture review",
      status: config.GATEWAY_ENABLED ? "active" : "queued",
      owner: "Rex",
      assignedAgent: "Rex",
      toolsUsed: ["agent_status", "get_recent_logs", "terminal_execute_command"],
      executionTimeMs: 48_800,
      timestamp: isoMinutesAgo(28),
      success: null,
      trace: ["Probe gateway transport", "Inspect auth state", "Validate fallback routing"],
      detail: "Gateway coverage and transport resilience review.",
    },
    {
      id: "tsk-os-003",
      title: "Task Enterprise operating digest",
      status: "completed",
      owner: "Abdi",
      assignedAgent: "Abdi",
      toolsUsed: ["list_agents", "notion_update_page", "get_recent_logs"],
      executionTimeMs: 35_400,
      timestamp: isoMinutesAgo(46),
      success: true,
      trace: ["Review agent fleet", "Post structured checkpoint", "Issue next actions"],
      detail: "Executive checkpoint delivered to oversight surfaces.",
    },
    {
      id: "tsk-mem-004",
      title: "Workspace and memory inventory refresh",
      status: "queued",
      owner: "Ahmed",
      assignedAgent: "Ahmed",
      toolsUsed: ["filesystem_browse_directory", "search_agent_memory", "notion_search_pages"],
      executionTimeMs: 0,
      timestamp: isoMinutesAgo(53),
      success: null,
      trace: ["Scan workspaces", "Refresh memory catalogs", "Sync documentation map"],
      detail: "Pending next execution slot for memory index normalization.",
    },
    {
      id: "tsk-mkt-005",
      title: "Outbound campaign cadence alignment",
      status: "active",
      owner: "Atlas",
      assignedAgent: "Atlas",
      toolsUsed: ["n8n_list_workflows", "notion_get_page", "google_drive_list_files"],
      executionTimeMs: 61_100,
      timestamp: isoMinutesAgo(21),
      success: null,
      trace: ["Inspect automation stack", "Validate creative assets", "Align route with GTM board"],
      detail: "Atlas is reviewing campaign surfaces tied to customer acquisition operations.",
    },
    {
      id: "tsk-prod-006",
      title: "Project #2 launch gate verification",
      status: "completed",
      owner: "Sygma",
      assignedAgent: "Sygma",
      toolsUsed: ["n8n_get_workflow", "database_query", "notion_update_page"],
      executionTimeMs: 74_500,
      timestamp: isoHoursAgo(2),
      success: true,
      trace: ["Validate launch gates", "Confirm blocker ownership", "Publish checkpoint"],
      detail: "Launch-ready status was verified and blockers cleared.",
    },
    {
      id: "tsk-trd-007",
      title: "Market signal integrity sweep",
      status: "failed",
      owner: "Prime",
      assignedAgent: "Prime",
      toolsUsed: ["web_fetch", "database_query", "get_recent_logs"],
      executionTimeMs: 19_800,
      timestamp: isoHoursAgo(4),
      success: false,
      trace: ["Refresh signal feed", "Check connector health", "Flag drift anomaly"],
      detail: "Signal fetch timed out on one upstream source and requires rerun.",
    },
    {
      id: "tsk-mach-008",
      title: "Local execution queue stabilization",
      status: "active",
      owner: "Dame",
      assignedAgent: "Dame",
      toolsUsed: ["desktop_get_screen_state", "docker_list_containers", "terminal_execute_command"],
      executionTimeMs: 55_100,
      timestamp: isoMinutesAgo(9),
      success: null,
      trace: ["Read machine state", "Inspect containers", "Clear stalled processes"],
      detail: "Dame is maintaining the local execution plane.",
    },
  ].map((task, index) => ({
    ...task,
    model: modelByAgent.get(task.assignedAgent) || "unassigned",
    queuePosition: task.status === "queued" ? index + 1 : null,
    approvalState: task.id === "tsk-prod-006" ? "pending" : task.status === "failed" ? "attention" : "none",
  }));

  return {
    tasks,
    approvals: tasks.filter((task) => task.approvalState === "pending" || task.approvalState === "attention"),
    activeCount: tasks.filter((task) => task.status === "active").length,
    queuedCount: tasks.filter((task) => task.status === "queued").length,
    completedCount: tasks.filter((task) => task.status === "completed").length,
    failedCount: tasks.filter((task) => task.status === "failed").length,
  };
}

function buildIntegrationData() {
  const integrations = [
    {
      id: "openclaw",
      name: "OpenClaw Gateway",
      category: "runtime",
      state: config.GATEWAY_ENABLED ? (credentialConfigured(config.GATEWAY_API_KEY) ? "online" : "warning") : "standby",
      connected: config.GATEWAY_ENABLED,
      credentialState: credentialConfigured(config.GATEWAY_API_KEY) ? "configured" : "missing",
      endpoint: config.GATEWAY_URL,
      owningSystem: "OpenClaw",
      dependencies: ["Gateway Auth", "WebSocket Transport"],
    },
    {
      id: "notion",
      name: "Notion",
      category: "knowledge",
      state: credentialConfigured(config.NOTION_TOKEN) ? "online" : "standby",
      connected: credentialConfigured(config.NOTION_TOKEN),
      credentialState: credentialConfigured(config.NOTION_TOKEN) ? "configured" : "missing",
      endpoint: "https://api.notion.com",
      owningSystem: "Notion HQ",
      dependencies: ["Workspace Token"],
    },
    {
      id: "n8n",
      name: "n8n",
      category: "automation",
      state: config.N8N_BASE_URL ? "online" : "warning",
      connected: Boolean(config.N8N_BASE_URL),
      credentialState: credentialConfigured(config.N8N_API_KEY) ? "configured" : "missing",
      endpoint: config.N8N_BASE_URL || "http://localhost:5678",
      owningSystem: "Automation Plane",
      dependencies: ["n8n API", "Workflow Credentials"],
    },
    {
      id: "google-drive",
      name: "Google Drive",
      category: "storage",
      state:
        credentialConfigured(config.GOOGLE_DRIVE_ACCESS_TOKEN) ||
        (credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_EMAIL) && credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY))
          ? "online"
          : "standby",
      connected:
        credentialConfigured(config.GOOGLE_DRIVE_ACCESS_TOKEN) ||
        (credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_EMAIL) && credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)),
      credentialState:
        credentialConfigured(config.GOOGLE_DRIVE_ACCESS_TOKEN) ||
        (credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_EMAIL) && credentialConfigured(config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY))
          ? "configured"
          : "missing",
      endpoint: "https://www.googleapis.com/drive/v3",
      owningSystem: "Drive Ops",
      dependencies: ["OAuth or Service Account"],
    },
    {
      id: "google-calendar",
      name: "Google Calendar",
      category: "scheduling",
      state: googleCalendarCredentialsConfigured() ? "online" : "standby",
      connected: googleCalendarCredentialsConfigured(),
      credentialState: googleCalendarCredentialsConfigured() ? "configured" : "missing",
      endpoint: "https://www.googleapis.com/calendar/v3",
      owningSystem: "Calendar Ops",
      dependencies: ["OAuth Refresh Token or Service Account"],
    },
    {
      id: "github",
      name: "GitHub",
      category: "source-control",
      state: credentialConfigured(config.GITHUB_TOKEN) ? "online" : "standby",
      connected: credentialConfigured(config.GITHUB_TOKEN),
      credentialState: credentialConfigured(config.GITHUB_TOKEN) ? "configured" : "missing",
      endpoint: "https://api.github.com",
      owningSystem: "Engineering Surface",
      dependencies: ["Personal Access Token"],
    },
    {
      id: "supabase",
      name: "Supabase",
      category: "database",
      state: credentialConfigured(config.SUPABASE_URL) && credentialConfigured(config.SUPABASE_SERVICE_ROLE_KEY) ? "online" : "standby",
      connected: credentialConfigured(config.SUPABASE_URL) && credentialConfigured(config.SUPABASE_SERVICE_ROLE_KEY),
      credentialState: credentialConfigured(config.SUPABASE_SERVICE_ROLE_KEY) ? "configured" : "missing",
      endpoint: config.SUPABASE_URL || "unconfigured",
      owningSystem: "Data Layer",
      dependencies: ["Supabase URL", "Service Role Key"],
    },
    {
      id: "telegram",
      name: "Telegram",
      category: "messaging",
      state: credentialConfigured(config.TELEGRAM_BOT_TOKEN) || credentialConfigured(config.ATLAS_TELEGRAM_BOT_TOKEN) ? "online" : "standby",
      connected: credentialConfigured(config.TELEGRAM_BOT_TOKEN) || credentialConfigured(config.ATLAS_TELEGRAM_BOT_TOKEN),
      credentialState: credentialConfigured(config.TELEGRAM_BOT_TOKEN) || credentialConfigured(config.ATLAS_TELEGRAM_BOT_TOKEN) ? "configured" : "missing",
      endpoint: config.TELEGRAM_API_BASE,
      owningSystem: "Comms",
      dependencies: ["Bot Token"],
    },
    {
      id: "discord",
      name: "Discord",
      category: "messaging",
      state: credentialConfigured(config.DISCORD_BOT_TOKEN) ? "online" : "standby",
      connected: credentialConfigured(config.DISCORD_BOT_TOKEN),
      credentialState: credentialConfigured(config.DISCORD_BOT_TOKEN) ? "configured" : "missing",
      endpoint: config.DISCORD_API_BASE,
      owningSystem: "Comms",
      dependencies: ["Discord Bot Token"],
    },
    {
      id: "docker",
      name: "Docker",
      category: "runtime",
      state: hubConfig.features.docker ? "online" : "standby",
      connected: hubConfig.features.docker,
      credentialState: "local",
      endpoint: "Docker local engine",
      owningSystem: "Container Runtime",
      dependencies: ["Docker Desktop / Engine"],
    },
  ];

  return {
    integrations,
    connectedCount: integrations.filter((integration) => integration.connected).length,
  };
}

function buildMemoryData(agentData: ReturnType<typeof buildAgentData>) {
  const vaults = agentData.map((agent, index) => ({
    id: agent.id,
    agent: agent.name,
    status: agent.memoryStatus,
    files: agent.memoryFileCount,
    footprintMb: agent.memoryFootprintMb,
    workspaceRoot: agent.workspaceRoot,
    lastIndexedAt: isoMinutesAgo(17 + index * 9),
    accessTier: agent.name === "Dame" || agent.name === "Ahmed" ? "full" : "scoped",
    notes: agent.notes,
    sampleQueries: [`${agent.name} latest task`, `${agent.name} workspace`, `${agent.name} routing`],
  }));

  return {
    vaults,
    indexedCount: vaults.filter((vault) => vault.status === "indexed").length,
    totalFootprintMb: Number(vaults.reduce((sum, vault) => sum + vault.footprintMb, 0).toFixed(1)),
    search: {
      lastQuery: "",
      results: [],
    },
  };
}

function buildOpenClawData(agentData: ReturnType<typeof buildAgentData>) {
  const connectedAgents = agentData.filter((agent) => agent.connectivity.openclaw || agent.name === "Dame");
  const dameSessions = SessionService.listSessions("Dame");
  const eventFeed = parseRecentEvents().filter((event) => event.stream === "dame" || event.stream === "global").slice(0, 8);

  return {
    nodeState: config.GATEWAY_ENABLED ? "connected" : "standby",
    gatewayState: config.GATEWAY_ENABLED ? (credentialConfigured(config.GATEWAY_API_KEY) ? "authenticated" : "awaiting-auth") : "disabled",
    connectedAgents: connectedAgents.map((agent) => agent.name),
    activeSessions: dameSessions.length || 2,
    recentEvents: eventFeed,
    routingState: config.GATEWAY_ENABLED ? "Gateway primary for Dame runtime" : "Gateway disabled; fallback only",
    serviceHealth: config.GATEWAY_ENABLED ? 88 : 71,
    maskedConfig: {
      gatewayUrl: config.GATEWAY_URL,
      gatewayWsUrl: config.GATEWAY_WS_URL || "derived-from-gateway-url",
      gatewayOrigin: config.GATEWAY_WS_ORIGIN || "derived",
      apiKey: credentialConfigured(config.GATEWAY_API_KEY) ? "configured" : "missing",
      chatPath: config.GATEWAY_CHAT_PATH,
      loginPath: config.GATEWAY_LOGIN_PATH,
    },
    workspaces: connectedAgents.map((agent) => ({
      agent: agent.name,
      root: agent.workspaceRoot,
      status: agent.workspaceStatus,
    })),
    commandHistory: [
      { id: "oc-1", command: "connect", status: config.GATEWAY_ENABLED ? "ok" : "standby", timestamp: isoMinutesAgo(31) },
      { id: "oc-2", command: "chat.send", status: config.GATEWAY_ENABLED ? "ok" : "queued", timestamp: isoMinutesAgo(23) },
      { id: "oc-3", command: "tool-events.subscribe", status: config.GATEWAY_ENABLED ? "ok" : "standby", timestamp: isoMinutesAgo(20) },
      { id: "oc-4", command: "session.reconcile", status: "ok", timestamp: isoMinutesAgo(8) },
    ],
  };
}

function buildMcpData(toolData: ReturnType<typeof buildToolData>, protocolData: ReturnType<typeof buildProtocolData>) {
  const recentToolCalls = toolData.tools
    .filter((tool) => tool.status === "online")
    .slice(0, 10)
    .map((tool, index) => ({
      id: `call-${tool.id}`,
      tool: tool.name,
      group: tool.groupLabel,
      protocol: tool.protocol,
      status: index % 6 === 0 ? "warning" : "ok",
      durationMs: tool.metrics.avgLatencyMs + index * 9,
      timestamp: isoMinutesAgo(6 + index * 4),
    }));

  return {
    serverHealth: "ok",
    transportState: {
      http: "online",
      stdio: "online",
      openclawGateway: config.GATEWAY_ENABLED ? "linked" : "standby",
    },
    host: config.HTTP_HOST,
    port: config.HTTP_PORT,
    enabledToolCount: toolData.enabledCount,
    totalToolCount: toolData.tools.length,
    activeProtocols: protocolData.filter((protocol) => protocol.state === "online").length,
    exposedTools: toolData.tools.filter((tool) => tool.status === "online").map((tool) => tool.name),
    groups: toolData.groups,
    recentToolCalls,
    dependencies: [
      { name: "Express", state: "online" },
      { name: "Tool Registry", state: "online" },
      { name: "Runtime Profiles", state: "online" },
      { name: "OpenClaw Gateway", state: config.GATEWAY_ENABLED ? "online" : "standby" },
    ],
  };
}

export function buildProjectData() {
  const items = [
    {
      id: "proj-command-center",
      name: "Task Enterprise Command Center Rebuild",
      status: "active",
      priority: "critical",
      owner: "Ayub",
      linkedAgents: ["Ayub", "Abdi", "Dame"],
      linkedTools: ["filesystem_write_file", "docker_list_containers", "notion_update_page"],
      linkedNotes: 6,
      progress: 68,
      health: 84,
      deadline: isoDaysFromNow(1),
      phase: "Shell + Workspace Buildout",
      summary: "Rebuilding the flagship HQ experience with stronger routing, typography, notes, and operational rails.",
      recentUpdate: "Application shell and data model are being replaced with a premium widescreen-first structure.",
      links: {
        workspaceRoute: "/home",
        notionUrl: "https://www.notion.so/taskenterprise/command-center-rebuild",
        driveUrl: "https://drive.google.com/drive/folders/command-center-rebuild",
        docsRoute: "/docs",
        logsRoute: "/logs",
      },
      artifacts: [
        { id: "artifact-shell", title: "Shell architecture spec", kind: "doc", href: "/docs", updatedAt: isoHoursAgo(2) },
        { id: "artifact-home", title: "Home workspace composition", kind: "ui", href: "/", updatedAt: isoMinutesAgo(38) },
        { id: "artifact-rail", title: "Right-rail interaction map", kind: "doc", href: "/docs", updatedAt: isoMinutesAgo(23) },
      ],
    },
    {
      id: "proj-2-launch",
      name: "Project #2 Launch Operations",
      status: "aligned",
      priority: "high",
      owner: "Sygma",
      linkedAgents: ["Sygma", "Abdi", "Atlas"],
      linkedTools: ["notion_update_page", "database_query", "n8n_get_workflow"],
      linkedNotes: 4,
      progress: 96,
      health: 93,
      deadline: isoDaysFromNow(0),
      phase: "Launch Gate Locked",
      summary: "Launch blockers are cleared and the operating handoff is staged for final executive review.",
      recentUpdate: "Latest gate report shows ready-to-launch posture with no active blockers remaining.",
      links: {
        workspaceRoute: "/projects",
        notionUrl: "https://www.notion.so/taskenterprise/project-2-launch-ops",
        driveUrl: "https://drive.google.com/drive/folders/project-2-launch",
        docsRoute: "/docs",
        logsRoute: "/logs",
      },
      artifacts: [
        { id: "artifact-launch", title: "Launch checklist", kind: "doc", href: "/docs", updatedAt: isoHoursAgo(1) },
        { id: "artifact-risk", title: "Risk register", kind: "sheet", href: "/projects", updatedAt: isoHoursAgo(3) },
        { id: "artifact-handoff", title: "Owner handoff brief", kind: "doc", href: "/notes", updatedAt: isoHoursAgo(4) },
      ],
    },
    {
      id: "proj-openclaw-voice",
      name: "OpenClaw Voice Bridge Hardening",
      status: "monitored",
      priority: "high",
      owner: "Rex",
      linkedAgents: ["Rex", "Dame", "Prime"],
      linkedTools: ["terminal_execute_command", "agent_status", "docker_list_containers"],
      linkedNotes: 3,
      progress: 57,
      health: 79,
      deadline: isoDaysFromNow(2),
      phase: "Transport Resilience",
      summary: "Stabilizing voice transport, reconnect logic, and gateway observability across agent comms.",
      recentUpdate: "Routing and auth checks are staged after command center shell rebuild completes.",
      links: {
        workspaceRoute: "/voice",
        notionUrl: "https://www.notion.so/taskenterprise/openclaw-voice-bridge",
        driveUrl: "https://drive.google.com/drive/folders/openclaw-voice",
        docsRoute: "/openclaw",
        logsRoute: "/logs",
      },
      artifacts: [
        { id: "artifact-voice", title: "Voice transport test matrix", kind: "doc", href: "/voice", updatedAt: isoHoursAgo(5) },
        { id: "artifact-gateway", title: "Gateway reconnect logs", kind: "log", href: "/logs", updatedAt: isoHoursAgo(2) },
        { id: "artifact-audio", title: "Agent voice profile table", kind: "doc", href: "/voice", updatedAt: isoHoursAgo(7) },
      ],
    },
    {
      id: "proj-mcp-store",
      name: "MCP Tool Marketplace Rollout",
      status: "queued",
      priority: "medium",
      owner: "Ahmed",
      linkedAgents: ["Ahmed", "Atlas", "Ayub"],
      linkedTools: ["notion_search_pages", "filesystem_browse_directory", "database_query"],
      linkedNotes: 5,
      progress: 34,
      health: 74,
      deadline: isoDaysFromNow(4),
      phase: "Credential and Category Mapping",
      summary: "Defining install flows, validation, and compatibility screens for the internal MCP marketplace.",
      recentUpdate: "Credential schemas and tool category inventory are still being normalized.",
      links: {
        workspaceRoute: "/tool-store",
        notionUrl: "https://www.notion.so/taskenterprise/mcp-marketplace-rollout",
        driveUrl: "https://drive.google.com/drive/folders/mcp-marketplace",
        docsRoute: "/mcp-tools",
        logsRoute: "/logs",
      },
      artifacts: [
        { id: "artifact-credentials", title: "Credential schema matrix", kind: "doc", href: "/tool-store", updatedAt: isoHoursAgo(6) },
        { id: "artifact-compat", title: "Tool compatibility board", kind: "sheet", href: "/mcp", updatedAt: isoHoursAgo(9) },
        { id: "artifact-install", title: "Install flow QA notes", kind: "doc", href: "/notes", updatedAt: isoHoursAgo(11) },
      ],
    },
  ];

  return {
    items,
    activeProjectId: "proj-command-center",
    total: items.length,
    activeCount: items.filter((item) => item.status === "active" || item.status === "aligned" || item.status === "monitored").length,
  };
}

function buildNotesData(projectData: ReturnType<typeof buildProjectData>) {
  const items = [
    {
      id: "note-daily-0312",
      title: "HQ Daily Note | March 12",
      category: "daily",
      folder: "Daily Operations",
      updatedAt: isoMinutesAgo(18),
      project: "Task Enterprise HQ",
      pinned: true,
      tags: ["daily", "hq", "priority"],
      preview: "Start in the Home workspace, review fleet health, lock the command center rebuild, and preserve launch readiness for Project #2.",
      body: `Overview\n- Hold the Command Center rebuild to a premium standard.\n- Keep Project #2 launch posture visible.\n- Use Home, Notes, and Calendar as daily anchors.\n\nFocus Blocks\n- Rebuild shell and routing.\n- Tighten visual hierarchy and spacing.\n- Keep OpenClaw and MCP status visible.\n\nFollow-ups\n- Review voice console interaction flow.\n- Validate MCP Tool Store install states.\n- Keep documentation aligned with current execution.`,
    },
    {
      id: "note-cc-direction",
      title: "Command Center Design Direction",
      category: "product",
      folder: "Command Center",
      updatedAt: isoMinutesAgo(42),
      project: projectData.items[0].name,
      pinned: true,
      tags: ["design-system", "ux", "shell"],
      preview: "Dark graphite, controlled red, executive typography, structured rails, and a real workspace feel over a metrics-heavy dashboard.",
      body: `Product Direction\n- The shell must feel like TASK's daily HQ.\n- Home is a working surface, not only a metrics page.\n- Notes and Calendar must feel first-class.\n\nVisual Rules\n- Dark only.\n- Red-led active states.\n- No blue identity.\n- No amateur spacing or overflowing labels.\n\nBuild Priorities\n- Sidebar and right rail must feel connected.\n- Page rhythm should be consistent.\n- Every page should feel like one product.`,
    },
    {
      id: "note-project-2",
      title: "Project #2 Launch Handoff",
      category: "operations",
      folder: "Launch Operations",
      updatedAt: isoHoursAgo(2),
      project: projectData.items[1].name,
      pinned: false,
      tags: ["launch", "handoff", "operations"],
      preview: "Ready-to-launch posture is confirmed. Keep launch window, final smoke checks, and stakeholder handoff visible in HQ.",
      body: `Launch State\n- Latest launch gate shows ready-to-launch posture.\n- No active blockers.\n- Final smoke check remains advisable before public release.\n\nOwner Notes\n- Sygma owns launch coordination.\n- Abdi maintains executive visibility.\n- Atlas tracks outward-facing readiness.`,
    },
    {
      id: "note-tool-store",
      title: "MCP Tool Store Requirements",
      category: "product",
      folder: "MCP Marketplace",
      updatedAt: isoHoursAgo(3),
      project: projectData.items[3].name,
      pinned: false,
      tags: ["mcp", "tool-store", "credentials"],
      preview: "Internal marketplace needs credential setup, validation, compatibility notes, and enable/disable state with test actions.",
      body: `Store Requirements\n- Credential schema per tool.\n- Validation and test connection.\n- Compatibility notes by protocol.\n- Install and enable states.\n\nOperator Expectation\n- Feels internal, premium, and operational.\n- No consumer app-store language.`,
    },
    {
      id: "note-voice-console",
      title: "Voice Console Session Plan",
      category: "systems",
      folder: "Communications",
      updatedAt: isoHoursAgo(5),
      project: projectData.items[2].name,
      pinned: false,
      tags: ["voice", "agents", "communications"],
      preview: "Voice must support quick switching, active transcript, and a command-room feel for Abdi, Dame, and Rex.",
      body: `Voice Goals\n- Direct agent channel selection.\n- Persistent transcript history.\n- Connection health and session controls.\n- Fast switching without losing context.`,
    },
    {
      id: "note-integration-backlog",
      title: "Integration Credential Backlog",
      category: "infrastructure",
      folder: "Integration Ops",
      updatedAt: isoHoursAgo(6),
      project: "Integration Layer",
      pinned: false,
      tags: ["credentials", "backlog", "ops"],
      preview: "Google Calendar, Slack, and Sentry remain top candidates for the next MCP marketplace validation wave.",
      body: `Priority Gaps\n- Calendar sync needs a first-class setup path.\n- Slack should be validated for command notifications.\n- Sentry should land in the marketplace with issue triage support.`,
    },
  ];

  return {
    folders: [
      { id: "daily", label: "Daily Operations", count: items.filter((item) => item.folder === "Daily Operations").length },
      { id: "command-center", label: "Command Center", count: items.filter((item) => item.folder === "Command Center").length },
      { id: "launch", label: "Launch Operations", count: items.filter((item) => item.folder === "Launch Operations").length },
      { id: "communications", label: "Communications", count: items.filter((item) => item.folder === "Communications").length },
      { id: "integration-ops", label: "Integration Ops", count: items.filter((item) => item.folder === "Integration Ops").length },
      { id: "mcp-marketplace", label: "MCP Marketplace", count: items.filter((item) => item.folder === "MCP Marketplace").length },
    ],
    items,
    pinnedIds: items.filter((item) => item.pinned).map((item) => item.id),
  };
}

function buildCalendarData(projectData: ReturnType<typeof buildProjectData>) {
  const events = [
    {
      id: "evt-startup",
      title: "HQ Startup and System Sweep",
      type: "operations",
      owner: "TASK",
      linkedProject: projectData.items[0].name,
      start: isoAtLocal(0, 8, 0),
      end: isoAtLocal(0, 8, 45),
      location: "Command Center Home",
      status: "scheduled",
      detail: "Daily opening review across agents, MCP, OpenClaw, and project posture.",
    },
    {
      id: "evt-routing",
      title: "Agent Routing Review",
      type: "systems",
      owner: "Abdi",
      linkedProject: projectData.items[0].name,
      start: isoAtLocal(0, 9, 30),
      end: isoAtLocal(0, 10, 15),
      location: "Models Surface",
      status: "scheduled",
      detail: "Confirm primary and fallback model alignment for the agent fleet.",
    },
    {
      id: "evt-voice-qa",
      title: "Voice Console QA",
      type: "infrastructure",
      owner: "Rex",
      linkedProject: projectData.items[2].name,
      start: isoAtLocal(0, 11, 0),
      end: isoAtLocal(0, 11, 40),
      location: "Voice Surface",
      status: "scheduled",
      detail: "Validate reconnect flow, transcript continuity, and transport status.",
    },
    {
      id: "evt-launch-window",
      title: "Project #2 Launch Window",
      type: "launch",
      owner: "Sygma",
      linkedProject: projectData.items[1].name,
      start: isoAtLocal(0, 13, 0),
      end: isoAtLocal(0, 14, 0),
      location: "Launch Ops",
      status: "scheduled",
      detail: "Final smoke check, handoff, and live readiness monitoring.",
    },
    {
      id: "evt-tool-store",
      title: "MCP Tool Store Credential Pass",
      type: "product",
      owner: "Ahmed",
      linkedProject: projectData.items[3].name,
      start: isoAtLocal(0, 15, 30),
      end: isoAtLocal(0, 16, 15),
      location: "Tool Store",
      status: "scheduled",
      detail: "Normalize credential requirements and first-run setup flows for featured tools.",
    },
    {
      id: "evt-notes",
      title: "Notes and Documentation Sweep",
      type: "knowledge",
      owner: "Ahmed",
      linkedProject: "Task Enterprise HQ",
      start: isoAtLocal(0, 18, 0),
      end: isoAtLocal(0, 18, 45),
      location: "Notes Workspace",
      status: "scheduled",
      detail: "Update daily notes, project references, and command center decisions.",
    },
    {
      id: "evt-ops-brief",
      title: "Morning Ops Brief",
      type: "operations",
      owner: "Abdi",
      linkedProject: "Task Enterprise HQ",
      start: isoAtLocal(1, 8, 15),
      end: isoAtLocal(1, 8, 45),
      location: "Home HQ",
      status: "scheduled",
      detail: "Reset fleet posture and align priorities for the next operating day.",
    },
  ];

  return {
    timezone: "America/Chicago",
    primaryCalendarId: "primary",
    syncState: googleCalendarCredentialsConfigured() ? "google-calendar-ready" : "credentials-required",
    lastSyncedAt: googleCalendarCredentialsConfigured() ? isoMinutesAgo(19) : null,
    views: ["day", "week", "month"],
    events,
    upcoming: events.slice(0, 5),
  };
}

function buildVoiceData(agentData: ReturnType<typeof buildAgentData>) {
  const channelMap: Record<string, string> = {
    Abdi: "Command Brief",
    Dame: "Systems Ops",
    Rex: "Security Watch",
    Prime: "Strategy Feed",
    Ayub: "Build Execution",
    Ahmed: "Knowledge Ops",
    Atlas: "Growth Desk",
    Sygma: "Operations Control",
  };

  const voiceAgents = agentData
    .filter((agent) => ["Abdi", "Ayub", "Rex", "Prime", "Dame", "Ahmed", "Atlas", "Sygma"].includes(agent.name))
    .map((agent, index) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: index === 0 ? "live" : agent.status,
      channel: channelMap[agent.name] || "Agent Channel",
      latencyMs: 160 + index * 28,
      currentModel: agent.currentModel,
      fallbackModel: agent.backupModel,
      preferredVoice: agent.name === "Dame" ? "Microsoft Aria Online (Natural) - English (United States)" : "Microsoft Jenny Online (Natural) - English (United States)",
    }));

  return {
    connectionState: "linked",
    audioInput: "Shure MV7",
    audioOutput: "Desktop Monitor Mix",
    activeAgentId: voiceAgents[0]?.id || "abdi",
    agents: voiceAgents,
    currentSession: {
      id: "voice-session-001",
      state: "listening",
      connection: "stable",
      startedAt: isoMinutesAgo(11),
      mode: "direct-agent",
      transcript: [
        { id: "tr-1", speaker: "TASK", tone: "operator", text: "Abdi, give me the current operational posture across the fleet.", timestamp: isoMinutesAgo(10), confidence: 0.99 },
        { id: "tr-2", speaker: "Abdi", tone: "agent", text: "Fleet is stable. Ayub is on the command center rebuild, Sygma is holding launch readiness, and Dame is maintaining the local execution plane.", timestamp: isoMinutesAgo(9), confidence: 0.98 },
        { id: "tr-3", speaker: "TASK", tone: "operator", text: "Hold Project #2 launch visibility on the Home surface and keep MCP availability visible on the right rail.", timestamp: isoMinutesAgo(7), confidence: 0.97 },
        { id: "tr-4", speaker: "Abdi", tone: "agent", text: "Understood. I am keeping launch posture and integration health elevated in the current workspace context.", timestamp: isoMinutesAgo(6), confidence: 0.98 },
      ],
      responsePreview: "Abdi is live and prepared for executive operating summaries, routing reviews, and agent coordination.",
      waveform: [22, 28, 41, 36, 54, 43, 38, 24, 19, 33, 48, 31],
    },
    sessionHistory: [
      { id: "vh-1", agent: "Abdi", state: "completed", startedAt: isoHoursAgo(1), duration: "08m 12s", summary: "Morning posture brief and task alignment." },
      { id: "vh-2", agent: "Dame", state: "completed", startedAt: isoHoursAgo(3), duration: "04m 43s", summary: "Local execution queue and Docker health review." },
      { id: "vh-3", agent: "Rex", state: "completed", startedAt: isoHoursAgo(5), duration: "06m 08s", summary: "Gateway auth and exposed service hardening review." },
    ],
    shortcuts: [
      { id: "voice-brief", label: "Executive Brief", detail: "Route to Abdi for a top-level operating summary." },
      { id: "voice-systems", label: "Systems Check", detail: "Open Dame or Rex for infrastructure and local runtime status." },
      { id: "voice-switch", label: "Switch Agent", detail: "Fast handoff across voice channels without leaving the workspace." },
    ],
  };
}

function buildToolStoreData(integrationData: ReturnType<typeof buildIntegrationData>) {
  const inventory = [
    {
      id: "store-google-calendar",
      name: "Google Calendar Control",
      vendor: "Task Enterprise Verified",
      category: "Scheduling",
      description: "Create, edit, and sync calendar events through MCP with validation and reminder support.",
      compatibility: ["MCP HTTP", "Calendar Surface", "Notes Surface"],
      credentialRequirements: ["OAuth Client", "Refresh Token"],
      installState: "recommended",
      validationState: integrationData.integrations.some((integration) => integration.id === "google-calendar" && integration.connected) ? "ready" : "credentials-required",
    },
    {
      id: "store-slack",
      name: "Slack Command Relay",
      vendor: "Task Enterprise Verified",
      category: "Communications",
      description: "Route alerts, command summaries, and agent check-ins to Slack workspaces and channels.",
      compatibility: ["MCP HTTP", "Alert Queue", "Tasks"],
      credentialRequirements: ["Bot Token", "Workspace ID"],
      installState: "available",
      validationState: "credentials-required",
    },
    {
      id: "store-sentry",
      name: "Sentry Incident Sync",
      vendor: "Enterprise Add-on",
      category: "Observability",
      description: "Pull issue streams, assign incidents, and track deployment health alongside command logs.",
      compatibility: ["Logs", "Integrations", "Projects"],
      credentialRequirements: ["Sentry Auth Token", "Organization Slug"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-linear",
      name: "Linear Issue Bridge",
      vendor: "Enterprise Add-on",
      category: "Project Delivery",
      description: "Connect project execution, engineering tasks, and issue ownership into the command center.",
      compatibility: ["Projects", "Tasks", "Notes"],
      credentialRequirements: ["API Key", "Team ID"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-stripe",
      name: "Stripe Operations Tools",
      vendor: "Task Enterprise Verified",
      category: "Finance Ops",
      description: "Inspect payment events, customer alerts, and revenue operations from the same HQ shell.",
      compatibility: ["MCP HTTP", "Logs", "Projects"],
      credentialRequirements: ["Secret Key", "Webhook Secret"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-postgres",
      name: "Postgres Control Surface",
      vendor: "Enterprise Core",
      category: "Data Systems",
      description: "Browse schemas, run safe queries, inspect health, and attach data ops to agent workflows.",
      compatibility: ["Models", "Projects", "Tasks"],
      credentialRequirements: ["Connection URL", "Role Policy"],
      installState: "enabled",
      validationState: "verified",
    },
    {
      id: "store-github",
      name: "GitHub Integration",
      vendor: "External — Verified",
      category: "Development",
      description: "Connect GitHub repos, manage issues, PRs, and automate workflows from the command center.",
      compatibility: ["MCP HTTP", "Projects", "Tasks"],
      credentialRequirements: ["GitHub Token", "Organization"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-supabase",
      name: "Supabase Data Layer",
      vendor: "External — Verified",
      category: "Data Systems",
      description: "Query tables, manage rows, and run ops against your Supabase database from Mission Control.",
      compatibility: ["MCP HTTP", "Database Surface", "Projects"],
      credentialRequirements: ["Project URL", "Anon Key", "Service Key"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-firebase",
      name: "Firebase Ops Bridge",
      vendor: "External — Verified",
      category: "Data Systems",
      description: "Firestore reads, auth management, and storage ops tied into your agent workflows.",
      compatibility: ["MCP HTTP", "Projects", "Models"],
      credentialRequirements: ["Service Account JSON", "Project ID"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-asana",
      name: "Asana Task Mirror",
      vendor: "External — Verified",
      category: "Project Delivery",
      description: "Sync projects, create tasks, and track assignments bidirectionally with Asana workspaces.",
      compatibility: ["MCP HTTP", "Tasks", "Projects"],
      credentialRequirements: ["Personal Access Token", "Workspace ID"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-playwright",
      name: "Playwright Browser Control",
      vendor: "External — Verified",
      category: "Automation",
      description: "Automate browser actions, run scraping tasks, and test web interfaces from agents.",
      compatibility: ["MCP HTTP", "Agent Core", "Tasks"],
      credentialRequirements: [],
      installState: "available",
      validationState: "ready",
    },
    {
      id: "store-gitlab",
      name: "GitLab CI Bridge",
      vendor: "External — Verified",
      category: "Development",
      description: "Trigger pipelines, manage MRs, and track deployments inside the command center.",
      compatibility: ["MCP HTTP", "Projects", "Tasks"],
      credentialRequirements: ["Personal Access Token", "Project ID"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-greptile",
      name: "Greptile Code Search",
      vendor: "External — Verified",
      category: "Development",
      description: "Semantic code search and codebase Q&A for complex engineering workflows.",
      compatibility: ["MCP HTTP", "Agent Core", "Docs"],
      credentialRequirements: ["API Key", "GitHub Token"],
      installState: "available",
      validationState: "not-configured",
    },
    {
      id: "store-context7",
      name: "Context7 Docs Layer",
      vendor: "External — Verified",
      category: "Knowledge",
      description: "Pull live library documentation into agent context for accurate code generation.",
      compatibility: ["MCP HTTP", "Agent Core", "Docs"],
      credentialRequirements: [],
      installState: "available",
      validationState: "ready",
    },
  ];

  return {
    categories: [
      { id: "scheduling", label: "Scheduling", count: inventory.filter((item) => item.category === "Scheduling").length },
      { id: "communications", label: "Communications", count: inventory.filter((item) => item.category === "Communications").length },
      { id: "observability", label: "Observability", count: inventory.filter((item) => item.category === "Observability").length },
      { id: "project-delivery", label: "Project Delivery", count: inventory.filter((item) => item.category === "Project Delivery").length },
      { id: "finance-ops", label: "Finance Ops", count: inventory.filter((item) => item.category === "Finance Ops").length },
      { id: "data-systems", label: "Data Systems", count: inventory.filter((item) => item.category === "Data Systems").length },
      { id: "development", label: "Development", count: inventory.filter((item) => item.category === "Development").length },
      { id: "automation", label: "Automation", count: inventory.filter((item) => item.category === "Automation").length },
      { id: "knowledge", label: "Knowledge", count: inventory.filter((item) => item.category === "Knowledge").length },
    ],
    featured: inventory.slice(0, 4),
    inventory,
    installQueue: [
      { id: "queue-1", tool: "Google Calendar Control", state: "pending-credentials", owner: "Ahmed" },
      { id: "queue-2", tool: "Slack Command Relay", state: "pending-review", owner: "Atlas" },
    ],
  };
}

function buildSettingsData() {
  return {
    sections: [
      {
        id: "workspace",
        title: "Workspace Preferences",
        description: "Control the default command layout, opening page, and daily operating posture.",
        items: [
          { label: "Default landing page", value: "Home HQ" },
          { label: "Operating timezone", value: "America/Chicago" },
          { label: "Pinned right-rail widgets", value: "Focus, Today, Quick Notes, Event Trace" },
        ],
      },
      {
        id: "agents",
        title: "Agent Preferences",
        description: "Per-agent defaults for routing, visibility, and workspace behavior.",
        items: [
          { label: "Primary oversight agent", value: "Abdi" },
          { label: "Builder default", value: "Ayub" },
          { label: "Machine operations default", value: "Dame" },
        ],
      },
      {
        id: "voice",
        title: "Voice Preferences",
        description: "Command communications defaults for direct-agent sessions.",
        items: [
          { label: "Preferred input", value: "Shure MV7" },
          { label: "Preferred output", value: "Desktop Monitor Mix" },
          { label: "Fast-switch mode", value: "Enabled" },
        ],
      },
      {
        id: "operations",
        title: "Operational Defaults",
        description: "HQ-level system behavior and escalation posture.",
        items: [
          { label: "Emergency controls", value: "Visible" },
          { label: "Alert threshold", value: "Warnings and errors" },
          { label: "Session persistence", value: "Enabled for notes, tasks, and search" },
        ],
      },
    ],
  };
}

function buildMissionData(projectData: ReturnType<typeof buildProjectData>) {
  return {
    statement: "Task Enterprise LLC builds intelligent systems, coordinated automation, and premium operational infrastructure from one headquarters.",
    operatingMode: "Mission-driven execution",
    objectives: [
      "Keep the entire AI ecosystem visible and controllable from one workspace.",
      "Reduce operational friction through automation-first design and reusable systems.",
      "Align agent execution, infrastructure, notes, projects, and scheduling into one daily workflow.",
    ],
    workflows: [
      {
        id: "wf-startup",
        title: "Morning HQ Startup",
        owner: "Abdi",
        cadence: "Daily at 8:00 AM",
        status: "active",
        route: "/home",
        linkedPages: ["/home", "/overview", "/calendar"],
        summary: "Ground the day through mission review, system posture, and active priority alignment.",
      },
      {
        id: "wf-command-center",
        title: "Mission Control Rebuild",
        owner: "Ayub",
        cadence: "Current execution window",
        status: "critical",
        route: "/projects",
        linkedPages: ["/projects", "/notes", "/agents"],
        summary: "Push the flagship headquarters app to a production-grade premium standard.",
      },
      {
        id: "wf-memory-docs",
        title: "Memory and Docs Sync",
        owner: "Ahmed",
        cadence: "Twice daily",
        status: "monitored",
        route: "/memories",
        linkedPages: ["/memories", "/docs", "/notes"],
        summary: "Keep documentation, memory coverage, and project knowledge aligned across the ecosystem.",
      },
      {
        id: "wf-openclaw-mcp",
        title: "Infrastructure Watch",
        owner: "Rex",
        cadence: "Continuous",
        status: "active",
        route: "/openclaw",
        linkedPages: ["/openclaw", "/mcp", "/logs"],
        summary: "Monitor runtime health, transport state, and exposed services across OpenClaw and MCP.",
      },
    ],
    reversePrompts: [
      {
        id: "gap-calendar",
        missingTool: "Live Google Calendar MCP control",
        impact: "Calendar is strong visually but still waiting on full real-time integration.",
        proposedRoute: "/tool-store",
      },
      {
        id: "gap-incident",
        missingTool: "Incident response sync",
        impact: "Logs and alerts would benefit from Sentry-style incident triage hooks.",
        proposedRoute: "/tool-store",
      },
    ],
    activeProject: projectData.items[0].name,
  };
}

function buildDocsData(projectData: ReturnType<typeof buildProjectData>) {
  const items = [
    {
      id: "doc-hq-ops",
      title: "HQ Operating Manual",
      category: "Operations",
      owner: "Abdi",
      project: "Task Enterprise HQ",
      status: "current",
      updatedAt: isoHoursAgo(6),
      summary: "Operating rhythm, opening sequence, escalation protocol, and command-center review cadence.",
      sections: ["Overview", "Startup Sequence", "Escalation", "Daily Review"],
      tags: ["hq", "operations", "daily"],
      href: "/docs",
    },
    {
      id: "doc-command-center",
      title: "Mission Control Product Spec",
      category: "Product",
      owner: "Ayub",
      project: projectData.items[0].name,
      status: "active",
      updatedAt: isoHoursAgo(2),
      summary: "Product architecture, shell design, right-rail doctrine, and page requirements for the HQ rebuild.",
      sections: ["Architecture", "Shell", "Pages", "QA"],
      tags: ["mission-control", "spec", "design-system"],
      href: "/projects",
    },
    {
      id: "doc-openclaw",
      title: "OpenClaw Runtime Runbook",
      category: "Infrastructure",
      owner: "Rex",
      project: projectData.items[2].name,
      status: "current",
      updatedAt: isoHoursAgo(10),
      summary: "Gateway checks, reconnect actions, session review, and runtime diagnostics.",
      sections: ["Gateway", "Sessions", "Commands", "Recovery"],
      tags: ["openclaw", "runbook", "runtime"],
      href: "/openclaw",
    },
    {
      id: "doc-mcp-marketplace",
      title: "MCP Marketplace Setup Standards",
      category: "Platform",
      owner: "Ahmed",
      project: projectData.items[3].name,
      status: "drafting",
      updatedAt: isoHoursAgo(4),
      summary: "Credential schema, validation flow, install states, compatibility rules, and test procedures.",
      sections: ["Credentials", "Validation", "Compatibility", "Testing"],
      tags: ["mcp", "tool-store", "setup"],
      href: "/tool-store",
    },
    {
      id: "doc-launch",
      title: "Project #2 Launch Playbook",
      category: "Launch",
      owner: "Sygma",
      project: projectData.items[1].name,
      status: "current",
      updatedAt: isoHoursAgo(8),
      summary: "Launch gate visibility, handoff states, smoke checks, and ownership ladder.",
      sections: ["Checklist", "Owners", "Smoke Tests", "Handoff"],
      tags: ["launch", "playbook", "project-2"],
      href: "/projects",
    },
  ];

  return {
    categories: [
      { id: "operations", label: "Operations", count: items.filter((item) => item.category === "Operations").length },
      { id: "product", label: "Product", count: items.filter((item) => item.category === "Product").length },
      { id: "infrastructure", label: "Infrastructure", count: items.filter((item) => item.category === "Infrastructure").length },
      { id: "platform", label: "Platform", count: items.filter((item) => item.category === "Platform").length },
      { id: "launch", label: "Launch", count: items.filter((item) => item.category === "Launch").length },
    ],
    items,
    pinnedIds: ["doc-hq-ops", "doc-command-center"],
  };
}

function buildTeamData(agentData: ReturnType<typeof buildAgentData>) {
  const units = [
    {
      id: "executive-command",
      name: "Executive Command",
      lead: "TASK",
      focus: "Mission direction and system authority",
      status: "active",
      members: ["TASK", "Abdi"],
      surfaces: ["Home", "Overview", "Projects"],
      summary: "Defines mission priorities, approves operating direction, and keeps the headquarters aligned with execution.",
    },
    {
      id: "build-systems",
      name: "Build and Systems",
      lead: "Ayub",
      focus: "Product build, automation, and implementation delivery",
      status: "active",
      members: ["Ayub", "Dame", "Rex"],
      surfaces: ["Agents", "OpenClaw", "MCP", "Projects"],
      summary: "Owns product implementation, local machine operations, and infrastructure readiness.",
    },
    {
      id: "knowledge-ops",
      name: "Knowledge Operations",
      lead: "Ahmed",
      focus: "Memory, documentation, and organizational structure",
      status: "monitored",
      members: ["Ahmed", "Sygma"],
      surfaces: ["Notes", "Memories", "Docs", "Calendar"],
      summary: "Maintains clarity across notes, docs, memory systems, and operational organization.",
    },
    {
      id: "strategy-growth",
      name: "Strategy and Growth",
      lead: "Atlas",
      focus: "Campaign systems, launch readiness, and outward execution",
      status: "active",
      members: ["Atlas", "Prime", "Sygma"],
      surfaces: ["Projects", "Tasks", "Integrations"],
      summary: "Coordinates launch posture, market-facing systems, and strategic operating signals.",
    },
  ];

  return {
    operator: {
      name: "TASK",
      role: "Founder and architect of Task Enterprise LLC",
      posture: "Primary operator",
    },
    roster: agentData.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      specialty: agent.specialty,
      status: agent.status,
      currentFocus: agent.latestTask,
    })),
    units,
    commandChain: [
      { from: "TASK", to: "Abdi", reason: "Executive coordination and oversight" },
      { from: "TASK", to: "Ayub", reason: "Build execution and system implementation" },
      { from: "TASK", to: "Rex", reason: "Infrastructure health and hardening" },
      { from: "TASK", to: "Ahmed", reason: "Docs, memory, and organizational clarity" },
    ],
  };
}

function buildOfficeData(agentData: ReturnType<typeof buildAgentData>, taskData: ReturnType<typeof buildTaskData>) {
  const activeByAgent = new Map(taskData.tasks.filter((task) => task.status === "active").map((task) => [task.assignedAgent, task.title]));

  return {
    zones: [
      {
        id: "zone-executive-deck",
        name: "Executive Deck",
        lead: "TASK",
        state: "active",
        priority: "critical",
        route: "/home",
        summary: "Mission priorities, day posture, and the opening command surface.",
        linkedPages: ["/home", "/overview", "/projects"],
        linkedEntities: ["TASK", "Abdi", "Project #2"],
      },
      {
        id: "zone-agent-floor",
        name: "Agent Floor",
        lead: "Abdi",
        state: "active",
        priority: "high",
        route: "/agents",
        summary: "Fleet management, voice access, and live agent orchestration.",
        linkedPages: ["/agents", "/voice", "/models"],
        linkedEntities: agentData.slice(0, 4).map((agent) => agent.name),
      },
      {
        id: "zone-infra-core",
        name: "Infrastructure Core",
        lead: "Rex",
        state: "monitored",
        priority: "high",
        route: "/openclaw",
        summary: "OpenClaw, MCP, protocols, and runtime health.",
        linkedPages: ["/openclaw", "/mcp", "/protocols", "/logs"],
        linkedEntities: ["OpenClaw", "MCP", "Docker", "Gateway"],
      },
      {
        id: "zone-knowledge-studio",
        name: "Knowledge Studio",
        lead: "Ahmed",
        state: "active",
        priority: "medium",
        route: "/notes",
        summary: "Notes, memories, docs, and HQ writing surfaces.",
        linkedPages: ["/notes", "/memories", "/docs"],
        linkedEntities: ["Notes", "Memory Fabric", "Docs HQ"],
      },
      {
        id: "zone-ops-calendar",
        name: "Operations Calendar Bay",
        lead: "Sygma",
        state: "scheduled",
        priority: "medium",
        route: "/calendar",
        summary: "Task cadence, launch windows, and operating schedule management.",
        linkedPages: ["/calendar", "/tasks", "/projects"],
        linkedEntities: ["Launch Window", "Task Board", "Projects"],
      },
    ],
    hotspots: taskData.tasks
      .filter((task) => task.status === "active")
      .slice(0, 4)
      .map((task) => ({
        id: task.id,
        zone: task.assignedAgent === "Ayub" ? "Infrastructure Core" : task.assignedAgent === "Ahmed" ? "Knowledge Studio" : "Agent Floor",
        title: task.title,
        summary: activeByAgent.get(task.assignedAgent) || task.detail,
      })),
  };
}

function buildWorkspaceData(
  baseUrl: string,
  agentData: ReturnType<typeof buildAgentData>,
  taskData: ReturnType<typeof buildTaskData>,
  projectData: ReturnType<typeof buildProjectData>,
  notesData: ReturnType<typeof buildNotesData>,
  calendarData: ReturnType<typeof buildCalendarData>
) {
  const now = new Date();
  const hour = now.getHours();
  const phase = hour < 12 ? "Morning Operations" : hour < 18 ? "Day Operations" : hour < 22 ? "Evening Operations" : "Night Watch";
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const activeTasks = taskData.tasks.filter((task) => task.status === "active").slice(0, 3);

  return {
    name: "Task Enterprise HQ",
    workspaceLabel: "Primary Headquarters",
    operator: "TASK",
    timezone: "America/Chicago",
    dateLabel: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now),
    timeLabel: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
      timeZoneName: "short",
    }).format(now),
    phase,
    greeting,
    summary:
      "This workspace is the daily operating headquarters for Task Enterprise LLC across agents, models, MCP, OpenClaw, projects, notes, and scheduling.",
    dailyFocus: "Lock the premium command center rebuild while holding Project #2 launch visibility and MCP system awareness.",
    systemMode: "Executive Control",
    bookmarks: [
      { label: "Home HQ", route: "/", href: `${baseUrl}/` },
      { label: "Notes Workspace", route: "/notes", href: `${baseUrl}/notes` },
      { label: "Calendar", route: "/calendar", href: `${baseUrl}/calendar` },
      { label: "Voice Console", route: "/voice", href: `${baseUrl}/voice` },
      { label: "Memory Fabric", route: "/memories", href: `${baseUrl}/memories` },
      { label: "Docs HQ", route: "/docs", href: `${baseUrl}/docs` },
    ],
    focusAreas: [
      { label: "Online Agents", value: `${agentData.filter((agent) => agent.status === "online").length}/${agentData.length}`, tone: "online" },
      { label: "Active Tasks", value: `${taskData.activeCount}`, tone: "warning" },
      { label: "Pinned Notes", value: `${notesData.pinnedIds.length}`, tone: "neutral" },
      { label: "Upcoming Events", value: `${calendarData.upcoming.length}`, tone: "neutral" },
    ],
    pinnedActions: [
      { id: "open-notes", label: "Open Daily Notes", detail: "Move directly into the writing workspace.", route: "/notes" },
      { id: "review-launch", label: "Review Launch Posture", detail: "Keep Project #2 aligned and visible.", route: "/projects" },
      { id: "check-mcp", label: "Inspect MCP", detail: "Review tools, protocols, and server health.", route: "/mcp" },
      { id: "switch-voice", label: "Open Voice Channel", detail: "Jump into direct-agent communications.", route: "/voice" },
      { id: "memory-fabric", label: "Inspect Memories", detail: "Review vault health and recall readiness.", route: "/memories" },
    ],
    quickLaunch: [
      { id: "launch-agents", label: "Fleet", route: "/agents", description: "Inspect agents and routing" },
      { id: "launch-models", label: "Models", route: "/models", description: "Adjust primary and fallback models" },
      { id: "launch-tools", label: "MCP Tools", route: "/mcp-tools", description: "Review active tool inventory" },
      { id: "launch-calendar", label: "Calendar", route: "/calendar", description: "Run today from the schedule view" },
      { id: "launch-docs", label: "Docs", route: "/docs", description: "Open SOPs, runbooks, and references" },
      { id: "launch-office", label: "Office", route: "/office", description: "See the headquarters through active zones" },
    ],
    activeProject: projectData.items[0],
    activeTasks: activeTasks.map((task) => ({
      id: task.id,
      title: task.title,
      assignedAgent: task.assignedAgent,
      timestamp: task.timestamp,
      status: task.status,
    })),
  };
}

function buildPerformanceSnapshot(agentData: ReturnType<typeof buildAgentData>, taskData: ReturnType<typeof buildTaskData>) {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const memoryUsagePct = Number((((totalMemory - freeMemory) / totalMemory) * 100).toFixed(1));
  const averageHealth = Math.round(agentData.reduce((sum, agent) => sum + agent.healthScore, 0) / agentData.length);
  const failedTasks = taskData.failedCount;

  return {
    nodeVersion: process.version,
    platform: process.platform,
    hostname: os.hostname(),
    uptime: formatDuration(process.uptime()),
    memoryUsagePct,
    freeMemoryGb: Number((freeMemory / 1024 / 1024 / 1024).toFixed(1)),
    loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    averageAgentHealth: averageHealth,
    taskFailureRate: Number(((failedTasks / Math.max(1, taskData.tasks.length)) * 100).toFixed(1)),
  };
}

export function buildCommandCenterPayload(baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const services = buildServiceLinks(normalizedBaseUrl);
  const agents = buildAgentData();
  const models = buildModelData(agents);
  const tools = buildToolData();
  const protocols = buildProtocolData(tools);
  const tasks = buildTaskData(agents);
  const integrations = buildIntegrationData();
  const memory = buildMemoryData(agents);
  const openclaw = buildOpenClawData(agents);
  const mcp = buildMcpData(tools, protocols);
  const projects = buildProjectData();
  const notes = buildNotesData(projects);
  const calendar = buildCalendarData(projects);
  const voice = buildVoiceData(agents);
  const toolStore = buildToolStoreData(integrations);
  const settings = buildSettingsData();
  const mission = buildMissionData(projects);
  const docs = buildDocsData(projects);
  const team = buildTeamData(agents);
  const office = buildOfficeData(agents, tasks);
  const workspace = buildWorkspaceData(normalizedBaseUrl, agents, tasks, projects, notes, calendar);
  const events = parseRecentEvents();
  const performance = buildPerformanceSnapshot(agents, tasks);
  const warnings = [
    !config.GATEWAY_ENABLED ? "OpenClaw gateway is configured as standby and not yet actively enabled." : null,
    integrations.integrations.some((integration) => integration.credentialState === "missing")
      ? "One or more remote integrations are visible but still missing production credentials."
      : null,
    memory.indexedCount < Math.ceil(agents.length / 2) ? "Several agent memory vaults are still awaiting ingestion." : null,
  ].filter(Boolean);

  const onlineAgents = agents.filter((agent) => agent.status === "online").length;
  const degradedAgents = agents.filter((agent) => agent.status === "degraded" || agent.status === "warning").length;
  const offlineAgents = agents.filter((agent) => agent.status === "offline").length;
  const alertEvents = events.filter((event) => event.level !== "info");

  const payload = {
    generatedAt: new Date().toISOString(),
    brand: {
      company: "Task Enterprise LLC",
      product: "Mission Control",
      tone: "Executive AI operations headquarters",
    },
    environment: {
      mode: config.NODE_ENV,
      baseUrl: normalizedBaseUrl,
      host: config.HTTP_HOST,
      port: config.HTTP_PORT,
      production: config.IS_PRODUCTION,
    },
    summary: {
      agentsOnline: onlineAgents,
      agentsDegraded: degradedAgents,
      agentsOffline: offlineAgents,
      totalAgents: agents.length,
      totalTools: tools.tools.length,
      enabledTools: tools.enabledCount,
      totalProtocols: protocols.length,
      connectedIntegrations: integrations.connectedCount,
      activeTasks: tasks.activeCount,
      queuedTasks: tasks.queuedCount,
      failedTasks: tasks.failedCount,
      alerts: alertEvents.length,
      overallHealth: performance.averageAgentHealth,
    },
    services,
    quickActions: QUICK_ACTIONS,
    workspace,
    mission,
    agents,
    models,
    voice,
    openclaw,
    mcp,
    tools,
    toolStore,
    protocols,
    projects,
    docs,
    team,
    office,
    notes,
    calendar,
    tasks,
    logs: {
      events,
      streams: LogService.listLogFiles().map((file) => ({
        name: file.replace(/\.log$/i, ""),
        lines: LogService.getRecentLogs(file === "global.log" ? undefined : file.replace(/\.log$/i, ""), 6).split(/\r?\n/).filter(Boolean).length,
      })),
      counts: {
        info: events.filter((event) => event.level === "info").length,
        warning: events.filter((event) => event.level === "warning").length,
        error: events.filter((event) => event.level === "error").length,
      },
    },
    memory,
    integrations,
    settings,
    performance,
    alerts: [
      ...warnings.map((message, index) => ({
        id: `warning-${index}`,
        level: "warning",
        title: "Operational Attention",
        message,
        timestamp: isoMinutesAgo(12 + index * 6),
      })),
      ...alertEvents.slice(0, 6).map((event, index) => ({
        id: `event-${index}`,
        level: event.level,
        title: `${event.stream} event`,
        message: event.summary,
        timestamp: event.timestamp,
      })),
    ],
    recentExecutions: tasks.tasks.slice(0, 6),
    recentCommands: [
      { id: "cmd-1", label: "Inspect MCP tool catalog", timestamp: isoMinutesAgo(7), status: "ok" },
      { id: "cmd-2", label: "Review OpenClaw gateway routing", timestamp: isoMinutesAgo(18), status: config.GATEWAY_ENABLED ? "ok" : "standby" },
      { id: "cmd-3", label: "Refresh agent fleet snapshot", timestamp: isoMinutesAgo(29), status: "ok" },
      { id: "cmd-4", label: "Audit cloud connector mesh", timestamp: isoMinutesAgo(54), status: integrations.connectedCount >= 4 ? "ok" : "warning" },
    ],
    recommendations: [
      "Keep OpenClaw and MCP transport health visible in the right-side rail for immediate operator confidence.",
      "Use the models console to tighten fallback routing for agents that share the same primary provider.",
      "Increase memory ingestion coverage for agents with workspace access but zero indexed memory files.",
    ],
  };

  return MissionControlStateService.applyToPayload(payload);
}

export function renderCommandCenterHtml(baseUrl: string): string {
  const payload = buildCommandCenterPayload(baseUrl);
  const dataJson = escapeHtml(JSON.stringify(payload, null, 2));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Task Enterprise Mission Control</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090b10;
      --panel: #10141c;
      --border: rgba(255, 255, 255, 0.12);
      --text: #f5f7fb;
      --muted: #9ca5b5;
      --accent: #dc2626;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Bahnschrift", "Aptos", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(220, 38, 38, 0.18), transparent 28%),
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.06), transparent 22%),
        linear-gradient(180deg, #07090d, #0b1018 42%, #090b10);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 32px;
    }
    .shell {
      width: min(960px, 100%);
      border: 1px solid var(--border);
      background: rgba(16, 20, 28, 0.92);
      border-radius: 28px;
      padding: 32px;
      box-shadow: 0 32px 90px rgba(0, 0, 0, 0.45);
    }
    h1 {
      margin: 0 0 10px;
      font-size: clamp(32px, 4vw, 54px);
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    pre {
      margin-top: 24px;
      padding: 20px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #d9dfeb;
      overflow: auto;
      font-size: 12px;
      line-height: 1.55;
    }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 22px;
      padding: 12px 18px;
      border-radius: 999px;
      text-decoration: none;
      color: var(--text);
      background: linear-gradient(135deg, #c81e1e, #7f1d1d);
      box-shadow: 0 14px 32px rgba(200, 30, 30, 0.28);
    }
  </style>
</head>
<body>
  <main class="shell">
    <h1>Task Enterprise Mission Control</h1>
    <p>The premium control-ui bundle was not found, so the server is returning the structured payload fallback.</p>
    <a href="/api/command-center">Open the raw command center payload</a>
    <pre>${dataJson}</pre>
  </main>
</body>
</html>`;
}

