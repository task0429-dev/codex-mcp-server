import { Router } from "express";
import {
  AgentId,
  AgentRecord,
  ExecutionCreateSchema,
  MemorySearchQuerySchema,
  MonitoringActionSchema,
} from "./contracts";
import { c2Events } from "./store";
import { C2ExecutionService } from "./execution-service";
import { C2MemoryService } from "./memory-service";
import { C2MonitoringService } from "./monitoring-service";
import { C2ToolService } from "./tool-service";

const memory = new C2MemoryService();
const monitoring = new C2MonitoringService(memory);
const tools = new C2ToolService(memory, monitoring);
const executions = new C2ExecutionService(tools, memory);

const AGENTS: AgentRecord[] = [
  ["abdi", "Abdi", "Executive command"],
  ["dame", "Dame", "Infrastructure execution"],
  ["ayub", "Ayub", "Build and automation"],
  ["rex", "Rex", "Reliability and security"],
  ["ahmed", "Ahmed", "Knowledge operations"],
  ["atlas", "Atlas", "Growth operations"],
  ["prime", "Prime", "Trading intelligence"],
  ["sygma", "Sygma", "Operational systems"],
].map(([id, name, role], index) => ({
  id: id as AgentId,
  name,
  role,
  description: `${name} operator profile`,
  permissions: [{ integration: "core", level: "admin" }],
  toolAccess: tools
    .list()
    .filter((tool) => tool.allowedAgents.includes(id as AgentId))
    .map((tool) => tool.id),
  memoryScope: ["global", `agent:${id}`],
  status: "online",
  heartbeatAt: new Date(Date.now() - index * 60_000).toISOString(),
  activeSessionCount: 0,
  lastActivityAt: new Date(Date.now() - index * 90_000).toISOString(),
}));

function buildOverview() {
  return {
    generatedAt: new Date().toISOString(),
    overallStatus: "online",
    proof: getC2UiProofSnapshot(),
  };
}

function parseExecutionInput(body: unknown) {
  return ExecutionCreateSchema.parse(body || {});
}

function wrapOk(data: unknown) {
  return { ok: true, data };
}

function wrapError(error: unknown) {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function getC2UiProofSnapshot() {
  const latestExecution = executions.list()[0] || null;
  const latestMemory = memory.listAll()[0] || null;

  return {
    mounted: true,
    version: "c2-api-recovered-1",
    routes: [
      "/api/c2/v1/proof",
      "/api/c2/v1/unified",
      "/api/c2/v1/agents",
      "/api/c2/v1/tools",
      "/api/c2/v1/executions",
      "/api/c2/v1/memory/search",
      "/api/c2/v1/monitoring/overview",
      "/api/c2/v1/events/stream",
      "/api/c2/v1/rex/diagnostics",
      "/api/c2/v1/rex/chat",
    ],
    counts: {
      agents: AGENTS.length,
      tools: tools.list().length,
      executions: executions.list().length,
      memoryRecords: memory.listAll().length,
    },
    recentHeartbeatAt: AGENTS[0]?.heartbeatAt || null,
    latestExecutionAt: latestExecution?.completedAt || latestExecution?.createdAt || null,
    latestMemoryAt: latestMemory?.timestamp || null,
  };
}

export function createC2Router(): Router {
  const router = Router();

  router.get("/proof", (_req, res) => {
    res.json(wrapOk(getC2UiProofSnapshot()));
  });

  router.get("/overview", async (_req, res) => {
    try {
      res.json(wrapOk(buildOverview()));
    } catch (error) {
      res.status(500).json(wrapError(error));
    }
  });

  router.get("/agents", (_req, res) => {
    res.json(wrapOk(AGENTS));
  });

  router.get("/tools", (_req, res) => {
    res.json(wrapOk(tools.list()));
  });

  router.get("/executions", (_req, res) => {
    res.json(wrapOk(executions.list()));
  });

  router.post("/executions", async (req, res) => {
    try {
      const input = parseExecutionInput(req.body);
      const created = await executions.create(input);
      res.json(wrapOk(created));
    } catch (error) {
      res.status(400).json(wrapError(error));
    }
  });

  router.post("/executions/:id/run", async (req, res) => {
    try {
      const result = await executions.run(String(req.params.id));
      res.json(wrapOk(result));
    } catch (error) {
      res.status(400).json(wrapError(error));
    }
  });

  router.post("/executions/:id/cancel", async (req, res) => {
    try {
      const result = await executions.cancel(String(req.params.id));
      res.json(wrapOk(result));
    } catch (error) {
      res.status(400).json(wrapError(error));
    }
  });

  router.get("/memory/search", (req, res) => {
    try {
      const parsed = MemorySearchQuerySchema.parse({
        q: typeof req.query.q === "string" ? req.query.q : "",
        agentId: typeof req.query.agentId === "string" ? req.query.agentId : undefined,
        projectId: typeof req.query.projectId === "string" ? req.query.projectId : undefined,
        source: typeof req.query.source === "string" ? req.query.source : undefined,
        severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
        tag: typeof req.query.tag === "string" ? req.query.tag : undefined,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor ? Number(req.query.cursor) : undefined,
      });

      res.json(wrapOk(memory.search(parsed)));
    } catch (error) {
      res.status(400).json(wrapError(error));
    }
  });

  router.get("/monitoring/overview", async (_req, res) => {
    try {
      res.json(wrapOk(await monitoring.getOverview()));
    } catch (error) {
      res.status(500).json(wrapError(error));
    }
  });

  router.get("/monitoring/services/:id", async (req, res) => {
    try {
      res.json(wrapOk(await monitoring.getServiceDetail(String(req.params.id))));
    } catch (error) {
      res.status(404).json(wrapError(error));
    }
  });

  router.post("/monitoring/services/:id/actions", async (req, res) => {
    try {
      const input = MonitoringActionSchema.parse(req.body || {});
      const result = await monitoring.runAction(String(req.params.id), input.action, input.agentId);
      res.json(wrapOk(result));
    } catch (error) {
      res.status(400).json(wrapError(error));
    }
  });

  router.get("/rex/diagnostics", async (_req, res) => {
    try {
      const overview = await monitoring.getOverview();
      const services = overview.services || [];
      const heartbeatJobs = services.map((service: any) => ({
        id: `hb-${service.id}`,
        connectionId: service.id,
        name: `${service.name} heartbeat`,
        expectedIntervalMin: 1,
        lastReceived: service.lastCheckedAt,
        consecutiveMisses: service.status === "offline" ? 3 : service.status === "degraded" ? 1 : 0,
        successRate24h: service.status === "healthy" ? 99.9 : service.status === "degraded" ? 90 : 60,
        schedule: "* * * * *",
        workerNode: "rex",
        status: service.status === "offline" ? "critical" : service.status === "degraded" ? "missed" : "active",
        failureReason: service.status === "healthy" ? "none" : service.detail,
        suggestedFix: service.status === "healthy" ? "none" : `Inspect ${service.name}`,
      }));

      const connections = services.map((service: any) => ({
        id: service.id,
        name: service.name,
        groupId: service.category,
        type: "heartbeat",
        endpoint: service.target,
        environment: "prod",
        uptime: service.status === "healthy" ? 99.9 : service.status === "degraded" ? 97.5 : 90,
        responseTime: service.responseTimeMs,
        lastCheck: service.lastCheckedAt,
        lastSuccess: service.status === "offline" ? null : service.lastCheckedAt,
        lastFailure: service.status === "healthy" ? null : service.lastCheckedAt,
        heartbeatPct: service.status === "healthy" ? 99.9 : service.status === "degraded" ? 92 : 70,
        beats: ["u", "u", service.status === "healthy" ? "u" : service.status === "degraded" ? "m" : "d", "u", "u"],
        tags: ["c2", service.category],
        failureReason: service.status === "healthy" ? undefined : service.detail,
        incidentCount: service.incidentCount || 0,
        owner: "rex",
      }));

      res.json(
        wrapOk({
          heartbeatJobs,
          connections,
          alerts: overview.incidents || [],
          incidentCount: (overview.incidents || []).length,
          lastAuditAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      res.status(500).json(wrapError(error));
    }
  });

  router.post("/rex/chat", async (req, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    const context = typeof req.body?.context === "string" ? req.body.context : "";
    const reply = `Rex confirms: ${message || "No prompt provided"}. Current context: ${context || "none"}.`;
    res.json(wrapOk({ reply }));
  });

  router.get("/unified", async (_req, res) => {
    try {
      const memoryResult = memory.search({ q: "", limit: 8, cursor: 0 });
      const monitoringResult = await monitoring.getOverview();
      res.json(
        wrapOk({
          proof: getC2UiProofSnapshot(),
          overview: buildOverview(),
          agents: AGENTS,
          tools: tools.list(),
          executions: executions.list(),
          memory: memoryResult,
          monitoring: monitoringResult,
        })
      );
    } catch (error) {
      res.status(500).json(wrapError(error));
    }
  });

  router.get("/events/stream", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: "connected", ts: new Date().toISOString() })}\n\n`);

    const onEvent = (type: string, payload: unknown) => {
      res.write(`data: ${JSON.stringify({ type, payload, ts: new Date().toISOString() })}\n\n`);
    };

    c2Events.on("memory", (payload) => onEvent("memory", payload));

    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
    }, 25_000);

    res.on("close", () => {
      clearInterval(heartbeat);
      res.end();
    });
  });

  return router;
}
