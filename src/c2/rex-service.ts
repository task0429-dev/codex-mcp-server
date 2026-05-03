import crypto from "crypto";
import { AgentService } from "../services/agent-service";
import { AccessPolicy } from "../policies/policies";
import { Alert, Connection, HeartbeatJob, RexDiagnostics, ServiceHealth } from "./contracts";
import { C2MemoryService } from "./memory-service";
import { C2MonitoringService } from "./monitoring-service";
import { readJsonFile, writeJsonFile } from "./store";

type RexAuditState = {
  lastAuditAt: string | null;
};

function readAuditState(): RexAuditState {
  return readJsonFile<RexAuditState>("rex-audit.json", { lastAuditAt: null });
}

function writeAuditState(state: RexAuditState) {
  writeJsonFile("rex-audit.json", state);
}

function inferConnectionType(target: string): Connection["type"] {
  if (target.startsWith("https://")) return "https";
  if (target.startsWith("http://")) return "http";
  if (/:\d+$/.test(target)) return "tcp";
  return "heartbeat";
}

function inferEnvironment(service: ServiceHealth): Connection["environment"] {
  const text = `${service.name} ${service.target}`.toLowerCase();
  if (text.includes("staging")) return "staging";
  if (text.includes("dev") || text.includes("127.0.0.1") || text.includes("localhost")) return "dev";
  return "prod";
}

function inferUptime(status: ServiceHealth["status"]): number {
  switch (status) {
    case "healthy":
      return 99.9;
    case "degraded":
      return 93.4;
    case "offline":
      return 0;
    default:
      return 72;
  }
}

function buildBeats(status: ServiceHealth["status"]): Connection["beats"] {
  if (status === "healthy") return Array.from({ length: 40 }, () => "u" as const);
  if (status === "degraded") return [...Array.from({ length: 30 }, () => "u" as const), ...Array.from({ length: 10 }, () => "p" as const)];
  if (status === "offline") return [...Array.from({ length: 8 }, () => "u" as const), ...Array.from({ length: 32 }, () => "d" as const)];
  return [...Array.from({ length: 25 }, () => "u" as const), ...Array.from({ length: 15 }, () => "e" as const)];
}

function subtractMinutes(stamp: string, minutes: number): string {
  return new Date(new Date(stamp).getTime() - minutes * 60_000).toISOString();
}

function summarizeFailure(service: ServiceHealth): string {
  if (service.status === "healthy") {
    return "";
  }
  return service.detail || `${service.name} requires diagnostic review.`;
}

function buildConnection(service: ServiceHealth): Connection {
  const failed = service.status !== "healthy";
  return {
    id: service.id,
    name: service.name,
    groupId: service.category,
    type: inferConnectionType(service.target),
    endpoint: service.target,
    environment: inferEnvironment(service),
    uptime: inferUptime(service.status),
    responseTime: service.responseTimeMs,
    lastCheck: service.lastCheckedAt,
    lastSuccess: failed ? subtractMinutes(service.lastCheckedAt, 30) : service.lastCheckedAt,
    lastFailure: failed ? service.lastCheckedAt : null,
    heartbeatPct: null,
    beats: buildBeats(service.status),
    tags: [service.category, service.status],
    failureReason: failed ? summarizeFailure(service) : undefined,
    incidentCount: service.incidentCount,
    owner: "rex",
  };
}

function buildAlert(connection: Connection): Alert | null {
  if (connection.uptime >= 98) {
    return null;
  }

  const severity: Alert["severity"] = connection.uptime === 0 ? "critical" : connection.uptime < 95 ? "high" : "medium";
  return {
    id: `alert-${connection.id}`,
    type: connection.type === "heartbeat" ? "heartbeat_miss" : connection.uptime === 0 ? "down" : "degraded",
    connectionId: connection.id,
    connectionName: connection.name,
    groupId: connection.groupId,
    message: connection.failureReason || `${connection.name} requires attention.`,
    severity,
    timestamp: connection.lastFailure || connection.lastCheck,
  };
}

function buildHeartbeatJob(connection: Connection, index: number): HeartbeatJob {
  const status: HeartbeatJob["status"] =
    connection.uptime === 0 ? "critical" : connection.uptime < 98 ? "missed" : "active";
  const expectedIntervalMin = connection.groupId === "monitoring" ? 15 : 5;
  const lastReceived =
    status === "critical"
      ? connection.lastSuccess || subtractMinutes(connection.lastCheck, expectedIntervalMin * 4)
      : connection.lastCheck;
  const consecutiveMisses = status === "critical" ? 4 : status === "missed" ? 1 : 0;
  const successRate24h = Number(Math.max(0, Math.min(100, connection.uptime)).toFixed(1));

  return {
    id: `hb-${index + 1}-${connection.id}`,
    connectionId: connection.id,
    name: connection.name,
    expectedIntervalMin,
    lastReceived,
    consecutiveMisses,
    successRate24h,
    schedule: `Every ${expectedIntervalMin} minutes`,
    workerNode: connection.environment === "dev" ? "local-host" : "mcp-server",
    status,
    failureReason: connection.failureReason || `${connection.name} is reporting normally.`,
    suggestedFix:
      status === "critical"
        ? `Restart or re-probe ${connection.name}, inspect logs, and verify the next heartbeat cycle.`
        : status === "missed"
        ? `Review ${connection.name} latency and re-run a targeted diagnostic probe.`
        : `No action required for ${connection.name}.`,
  };
}

function buildFallbackReply(message: string, diagnostics: RexDiagnostics): string {
  const critical = diagnostics.alerts.filter((alert) => alert.severity === "critical").length;
  const degraded = diagnostics.alerts.filter((alert) => alert.severity !== "critical").length;
  const line = diagnostics.alerts[0]?.message || "No active infrastructure alerts detected.";
  return [
    `Rex fallback diagnostic response for: ${message}`,
    `Active incidents: ${diagnostics.incidentCount} total, ${critical} critical, ${degraded} degraded/high.`,
    line,
  ].join("\n");
}

export class C2RexService {
  constructor(
    private readonly monitoring: C2MonitoringService,
    private readonly memory: C2MemoryService
  ) {}

  canReadMonitoring(agentId = "Rex") {
    return AccessPolicy.hasPermission(agentId, "monitoring", "read");
  }

  async getDiagnostics(): Promise<RexDiagnostics> {
    const services = await this.monitoring.listServices();
    const connections = services.map(buildConnection);
    const alerts = connections
      .map((connection) => buildAlert(connection))
      .filter((alert): alert is Alert => Boolean(alert));
    const heartbeatJobs = connections.slice(0, 4).map((connection, index) => buildHeartbeatJob(connection, index));
    const state = readAuditState();

    return {
      heartbeatJobs,
      connections,
      alerts,
      incidentCount: alerts.length,
      lastAuditAt: state.lastAuditAt,
    };
  }

  async runAudit() {
    const diagnostics = await this.getDiagnostics();
    const lastAuditAt = new Date().toISOString();
    writeAuditState({ lastAuditAt });

    const summary = diagnostics.alerts.length
      ? `Rex audit flagged ${diagnostics.alerts.length} active alert(s) across ${diagnostics.connections.length} monitored connection(s).`
      : `Rex audit completed with no active alerts across ${diagnostics.connections.length} monitored connection(s).`;

    await this.memory.record({
      source: "monitoring",
      kind: "rex_audit",
      severity: diagnostics.alerts.some((alert) => alert.severity === "critical") ? "warning" : "info",
      summary: "Rex audit completed",
      detail: summary,
      agentId: "rex",
      projectId: "task-enterprise-c2",
      tags: ["monitoring", "rex", "audit"],
      correlationId: crypto.randomUUID(),
      metadata: {
        lastAuditAt,
        jobsChecked: diagnostics.heartbeatJobs.length,
        incidentCount: diagnostics.incidentCount,
      },
    });

    return {
      ok: true,
      summary,
      jobsChecked: diagnostics.heartbeatJobs.length,
      lastAuditAt,
    };
  }

  async chat(message: string, context: string) {
    const diagnostics = await this.getDiagnostics();
    const prompt = [
      "You are Rex operating inside the Task Enterprise C2 monitoring surface.",
      "Answer concisely, with direct diagnostic guidance.",
      `Operator context: ${context || "none"}`,
      `Live diagnostics: ${JSON.stringify({
        incidentCount: diagnostics.incidentCount,
        alerts: diagnostics.alerts.slice(0, 5),
        heartbeatJobs: diagnostics.heartbeatJobs.slice(0, 4),
      })}`,
      `Operator message: ${message}`,
    ].join("\n\n");

    const result = await AgentService.ask("rex", prompt);
    const reply = result.status === "ok" && result.message.trim()
      ? result.message
      : buildFallbackReply(message, diagnostics);

    await this.memory.record({
      source: "monitoring",
      kind: "rex_chat",
      severity: "info",
      summary: "Rex chat response",
      detail: reply,
      agentId: "rex",
      projectId: "task-enterprise-c2",
      tags: ["monitoring", "rex", "chat"],
      correlationId: crypto.randomUUID(),
      metadata: {
        message,
        context,
        transportStatus: result.status,
      },
    });

    return { reply };
  }
}
