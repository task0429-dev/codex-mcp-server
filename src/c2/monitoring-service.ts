import { config } from "../config/config";
import { ServiceHealth } from "./contracts";
import { C2MemoryService } from "./memory-service";

type MonitoringTarget = {
  id: string;
  name: string;
  category: string;
  target: string;
  healthPath?: string;
  dockerContainer?: string;
};

function nowIso() {
  return new Date().toISOString();
}

export class C2MonitoringService {
  constructor(private readonly memory: C2MemoryService) {}

  private targets(): MonitoringTarget[] {
    const host = config.HTTP_HOST === "0.0.0.0" ? "127.0.0.1" : config.HTTP_HOST;
    const base = `http://${host}:${config.HTTP_PORT}`;

    return [
      { id: "c2-api", name: "C2 API", category: "apis", target: base, healthPath: "/health" },
      { id: "memory-api", name: "Memory API", category: "memory", target: base, healthPath: "/api/memory/v1/health" },
      { id: "openclaw-gateway", name: "OpenClaw Gateway", category: "agents", target: config.GATEWAY_URL, healthPath: "/" },
      { id: "n8n", name: "n8n", category: "automations", target: config.N8N_BASE_URL || "http://localhost:5678", healthPath: "/" },
      { id: "uptime-kuma", name: "Uptime Kuma", category: "monitoring", target: config.UPTIME_KUMA_URL || "http://localhost:3001", healthPath: "/" },
    ];
  }

  private async probe(target: MonitoringTarget): Promise<ServiceHealth> {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${target.target.replace(/\/+$/, "")}${target.healthPath || ""}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseTimeMs = Date.now() - started;
      const status = response.ok ? "healthy" : response.status >= 500 ? "offline" : "degraded";
      return {
        id: target.id,
        name: target.name,
        category: target.category,
        status,
        target: target.target,
        lastCheckedAt: nowIso(),
        responseTimeMs,
        detail: response.ok ? `HTTP ${response.status}` : `HTTP ${response.status} ${response.statusText}`,
        actions: target.dockerContainer ? ["diagnose", "restart"] : ["diagnose"],
        incidentCount: this.memory
          .search({ q: "", source: "monitoring", limit: 100, cursor: 0 })
          .items.filter((item) => item.metadata?.serviceId === target.id && item.severity !== "info").length,
      };
    } catch (error: any) {
      return {
        id: target.id,
        name: target.name,
        category: target.category,
        status: "offline",
        target: target.target,
        lastCheckedAt: nowIso(),
        responseTimeMs: null,
        detail: error?.message || "Probe failed",
        actions: target.dockerContainer ? ["diagnose", "restart"] : ["diagnose"],
        incidentCount: this.memory
          .search({ q: "", source: "monitoring", limit: 100, cursor: 0 })
          .items.filter((item) => item.metadata?.serviceId === target.id && item.severity !== "info").length,
      };
    }
  }

  async listServices() {
    return Promise.all(this.targets().map((target) => this.probe(target)));
  }

  async getOverview() {
    const services = await this.listServices();
    const incidents = this.memory
      .search({ q: "", source: "monitoring", limit: 20, cursor: 0 })
      .items.filter((item) => item.severity !== "info");

    return {
      generatedAt: nowIso(),
      overallStatus: services.some((service) => service.status === "offline")
        ? "offline"
        : services.some((service) => service.status === "degraded")
        ? "degraded"
        : "healthy",
      services,
      incidents,
      recommendations: [
        ...services.filter((service) => service.status !== "healthy").map((service) => `Inspect ${service.name} and run diagnostics.`),
        ...(incidents.length ? ["Recent monitoring incidents were written into memory and should be reviewed in the Logs/Memory surface."] : []),
      ].slice(0, 6),
    };
  }

  async getServiceDetail(serviceId: string) {
    const services = await this.listServices();
    const service = services.find((entry) => entry.id === serviceId);
    if (!service) {
      throw new Error(`Unknown service: ${serviceId}`);
    }

    const recentIncidents = this.memory
      .search({ q: "", source: "monitoring", limit: 20, cursor: 0 })
      .items.filter((item) => item.metadata?.serviceId === serviceId);

    return {
      ...service,
      recentIncidents,
      latestErrors: recentIncidents.filter((item) => item.severity === "error" || item.severity === "critical").slice(0, 5),
    };
  }

  async runAction(serviceId: string, action: "diagnose" | "restart", agentId: string) {
    const service = await this.getServiceDetail(serviceId);
    const detail = action === "restart"
      ? `Restart action requested for ${service.name}.`
      : `Diagnostic probe requested for ${service.name}.`;

    const record = await this.memory.record({
      source: "monitoring",
      kind: "service_action",
      severity: service.status === "healthy" ? "info" : "warning",
      summary: `${service.name} ${action}`,
      detail,
      agentId: agentId as any,
      projectId: "task-enterprise-c2",
      tags: ["monitoring", action, serviceId],
      correlationId: null,
      metadata: { serviceId, action },
    });

    return {
      serviceId,
      action,
      accepted: true,
      result: service,
      auditRecordId: record.id,
    };
  }
}
