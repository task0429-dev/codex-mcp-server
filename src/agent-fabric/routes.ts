import { Router, type Request, type Response } from "express";
import { AGENT_FABRIC_PHASE, AGENT_FABRIC_UNSUPPORTED_IN_PHASE_1_2, AGENT_FABRIC_WORKER_TOKEN } from "./config";
import { AGENT_FABRIC_SCHEMA_SQL } from "./db-schema";
import { listFabricEvents, recordFabricEvent } from "./events";
import { getAgentFabricHealth, getAgentFabricVersion } from "./health";
import { listRuntimeNames, pickRuntimeName } from "./names";
import { approvalRequiredForPermissions, detectPermissionRisks } from "./permissions";
import { AgentFabricRepository } from "./repository";
import { AgentOrchestratorService } from "./orchestrator";
import type { ApprovalStatus } from "./types";
import { C2MemoryService } from "../c2/memory-service";
import { C2MonitoringService } from "../c2/monitoring-service";
import { C2ToolService } from "../c2/tool-service";
import { buildCanonicalCatalog, runCanonicalTool } from "./canonical-tool-gateway";

const PHASE = AGENT_FABRIC_PHASE;
const canonicalMemory = new C2MemoryService();
const canonicalMonitoring = new C2MonitoringService(canonicalMemory);
const canonicalC2Tools = new C2ToolService(canonicalMemory, canonicalMonitoring);

function notImplemented(res: Response, feature: string) {
  return res.status(501).json({
    success: false,
    error: `${feature} is intentionally not implemented in Phase 6. Unsafe worker capabilities are not built; controlled LLM worker is available only through orchestrator and Tool Gateway.`,
    phase: PHASE,
    unsupported: AGENT_FABRIC_UNSUPPORTED_IN_PHASE_1_2,
  });
}

function parseLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeApprovalStatus(value: unknown): ApprovalStatus | undefined {
  const status = String(value || "").trim().toLowerCase();
  return ["pending", "approved", "denied", "expired"].includes(status) ? (status as ApprovalStatus) : undefined;
}

function routeError(res: Response, err: any, fallback = 500) {
  const message = err?.message || String(err);
  const status = /not found|not pending|not allowed|required|invalid/i.test(message) ? 400 : fallback;
  return res.status(status).json({ success: false, phase: PHASE, error: message });
}

function ok(res: Response, data: Record<string, unknown> = {}, meta: Record<string, unknown> = {}, status = 200) {
  return res.status(status).json({ ok: true, data, meta: { phase: PHASE, ...meta } });
}

function fail(res: Response, status: number, message: string, meta: Record<string, unknown> = {}) {
  return res.status(status).json({ ok: false, error: { message }, meta: { phase: PHASE, ...meta } });
}

function canonicalError(res: Response, err: any, fallback = 500) {
  const message = err?.message || String(err);
  const status = /not found/i.test(message) ? 404 : /not pending|not allowed|required|invalid|blocked|approval/i.test(message) ? 400 : fallback;
  return fail(res, status, message);
}

function requireWorkerToken(req: Request, res: Response): boolean {
  if (!AGENT_FABRIC_WORKER_TOKEN) {
    fail(res, 503, "AGENT_FABRIC_WORKER_TOKEN is not configured; worker-only endpoint refused.", { worker_token_configured: false });
    return false;
  }
  const token = String(req.header("x-agent-fabric-worker-token") || "").trim();
  if (!token || token !== AGENT_FABRIC_WORKER_TOKEN) {
    fail(res, 401, "Invalid or missing Agent Fabric worker token.", { worker_token_configured: true });
    return false;
  }
  return true;
}

function normalizeAgentCallBody(body: any) {
  return {
    ...(body || {}),
    called_by: body?.called_by || body?.caller,
    metadata: { ...(body?.metadata || {}), ...(body?.project ? { project: body.project } : {}) },
  };
}

function dangerousToolName(name: unknown) {
  return ["shell.execute", "docker.control"].includes(String(name || "").trim());
}

async function requireRun(id: unknown) {
  const run = await AgentFabricRepository.getRun(String(id || "").trim());
  if (!run) throw new Error(`Agent run not found: ${id}`);
  return run;
}

export function createAgentFabricRouter() {
  const router = Router();

  // Phase 9 canonical API contracts. These routes use { ok, data, meta }.
  router.get("/api/agent-fabric/health", async (_req: Request, res: Response) => {
    const health = await getAgentFabricHealth();
    recordFabricEvent("fabric_health_checked", "Agent Fabric canonical health checked.", { status: health.status, phase: PHASE });
    ok(res, { health, version: getAgentFabricVersion() });
  });

  router.get("/api/agent-fabric/llm/provider", (_req: Request, res: Response) => {
    const contract = AgentOrchestratorService.getContract();
    ok(res, {
      provider: {
        provider: contract.llm_provider,
        openai_compatible_chat_completions: contract.llm_provider === "openai_compatible",
        base_url_configured: contract.llm_base_url_configured,
        model: contract.llm_model,
        model_required: true,
        api_key_configured: contract.llm_api_key_configured,
        api_key_required: true,
        timeout_ms: contract.llm_timeout_ms,
        unsafe_tools_allowed: contract.allow_unsafe_tools,
      },
    });
  });

  router.get("/api/agent-fabric/agents/types", async (_req: Request, res: Response) => {
    const templates = await AgentFabricRepository.listTemplates();
    recordFabricEvent("agent_template_listed", "Canonical agent template registry listed.", { count: templates.length });
    ok(res, { templates }, { count: templates.length, worker_runtime_enabled: AgentOrchestratorService.getContract().worker_runtime_enabled });
  });

  router.get("/api/agent-fabric/agents/types/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const template = await AgentFabricRepository.getTemplate(id);
    if (!template) return fail(res, 404, `Agent template not found: ${id}`);
    recordFabricEvent("agent_template_loaded", "Canonical agent template loaded.", { id });
    ok(res, { template });
  });

  router.post("/api/agent-fabric/agents/call", async (req: Request, res: Response) => {
    try {
      const result = await AgentFabricRepository.createQueuedRun(normalizeAgentCallBody(req.body));
      ok(res, {
        run: result.run,
        approvals: result.approvals,
        permission_risks: result.permission_risks,
        approval_required: result.approvals.length > 0,
        execution_attempted: false,
      }, { worker_runtime_enabled: AgentOrchestratorService.getContract().worker_runtime_enabled }, 202);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/agents/match", async (req: Request, res: Response) => {
    try {
      const matches = await AgentFabricRepository.matchAgents({ task: req.body?.task || req.body?.query, capabilities: req.body?.capabilities, limit: parseLimit(req.body?.limit, 8, 50) });
      ok(res, { matches }, { count: matches.length, helper_agents: true });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/delegations", async (req: Request, res: Response) => {
    try {
      const result = await AgentFabricRepository.createDelegation(req.body || {});
      ok(res, result, { helper_agent: true, worker_runtime_enabled: AgentOrchestratorService.getContract().worker_runtime_enabled }, 202);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/delegations", async (req: Request, res: Response) => {
    try {
      const delegations = await AgentFabricRepository.listDelegations({ parent_run_id: req.query.parent_run_id ? String(req.query.parent_run_id) : undefined, project_id: req.query.project_id ? String(req.query.project_id) : undefined });
      ok(res, { delegations }, { count: delegations.length });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/messages", async (req: Request, res: Response) => {
    try {
      const messages = await AgentFabricRepository.listMessages({ thread_id: req.query.thread_id ? String(req.query.thread_id) : undefined, run_id: req.query.run_id ? String(req.query.run_id) : undefined });
      ok(res, { messages }, { count: messages.length });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/messages", async (req: Request, res: Response) => {
    try {
      const message = await AgentFabricRepository.createMessage(req.body || {});
      ok(res, { message }, { thread_id: message.thread_id }, 201);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/projects/:projectId/activity", async (req: Request, res: Response) => {
    try {
      const activity = await AgentFabricRepository.listProjectActivity(String(req.params.projectId || ""));
      ok(res, { activity }, { count: activity.length, project_id: req.params.projectId });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/projects/:projectId/activity", async (req: Request, res: Response) => {
    try {
      const activity = await AgentFabricRepository.recordProjectActivity({ ...(req.body || {}), project_id: String(req.params.projectId || "") });
      ok(res, { activity }, { project_id: req.params.projectId }, 201);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/monitor/overview", async (_req: Request, res: Response) => {
    const overview = await AgentFabricRepository.monitorOverview();
    ok(res, { overview }, { unsafe_tools_allowed: AgentOrchestratorService.getContract().allow_unsafe_tools });
  });

  router.get("/api/agent-fabric/monitor/runs", async (_req: Request, res: Response) => {
    const runs = await AgentFabricRepository.listRuns();
    ok(res, { runs }, { count: runs.length });
  });

  router.get("/api/agent-fabric/monitor/workers", async (_req: Request, res: Response) => {
    const [workers, jobs] = await Promise.all([AgentOrchestratorService.listHeartbeats(), AgentOrchestratorService.listJobs()]);
    ok(res, { workers, jobs }, { workers: workers.length, jobs: jobs.length });
  });

  router.get("/api/agent-fabric/monitor/alerts", async (_req: Request, res: Response) => {
    const overview: any = await AgentFabricRepository.monitorOverview();
    ok(res, { alerts: overview.alerts || {} }, { unsafe_tools_allowed: AgentOrchestratorService.getContract().allow_unsafe_tools });
  });

  router.get("/api/agent-fabric/runs", async (_req: Request, res: Response) => {
    const runs = await AgentFabricRepository.listRuns();
    ok(res, { runs }, { count: runs.length });
  });

  router.get("/api/agent-fabric/runs/summary", async (_req: Request, res: Response) => {
    const runs = await AgentFabricRepository.listRuns();
    const statuses = runs.reduce<Record<string, number>>((acc, run) => {
      acc[run.status] = (acc[run.status] || 0) + 1;
      return acc;
    }, {});
    ok(res, { total: runs.length, statuses, latest: runs.slice(0, 5) });
  });

  router.get("/api/agent-fabric/runs/:id/state", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      const [logs, events, tools, approvals] = await Promise.all([
        AgentFabricRepository.getRunLogs(run.id),
        AgentFabricRepository.getRunEvents(run.id),
        AgentFabricRepository.listToolCalls(run.id),
        AgentFabricRepository.getRunApprovals(run.id),
      ]);
      ok(res, {
        run_id: run.id,
        status: run.status,
        started_at: run.started_at,
        completed_at: run.completed_at,
        execution_attempted: Boolean(run.metadata?.execution_attempted),
        llm_execution_attempted: Boolean(run.metadata?.llm_execution_attempted),
        counts: { logs: logs.length, events: events.length, tools: tools.length, approvals: approvals.length },
      });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/runs/:id/result", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      ok(res, { run_id: run.id, status: run.status, result_summary: run.result_summary, completed_at: run.completed_at, metadata: run.metadata });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/runs/:id/logs", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      const logs = await AgentFabricRepository.getRunLogs(run.id);
      ok(res, { run_id: run.id, logs }, { count: logs.length });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/runs/:id/events", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      const events = await AgentFabricRepository.getRunEvents(run.id);
      ok(res, { run_id: run.id, events }, { count: events.length });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/runs/:id/tools", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      const calls = await AgentFabricRepository.listToolCalls(run.id);
      ok(res, { run_id: run.id, calls }, { count: calls.length });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/runs/:id/approvals", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      const approvals = await AgentFabricRepository.getRunApprovals(run.id);
      ok(res, { run_id: run.id, approvals }, { count: approvals.length });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/runs/:id", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      ok(res, { run });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/runs/:id/actions", async (req: Request, res: Response) => {
    try {
      const actions = await AgentOrchestratorService.getRunActions(String(req.params.id || ""));
      ok(res, { actions }, { unsafe_tools_allowed: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/runs/:id/execute-llm", async (req: Request, res: Response) => {
    try {
      const result = await AgentOrchestratorService.dispatchControlledLlm({ ...(req.body || {}), run_id: String(req.params.id || "") });
      ok(res, { result }, { worker_runtime_enabled: true, unsafe_tools_allowed: false, execution_attempted: !result.refused }, result.refused ? 409 : result.run.status === "failed" ? 502 : 202);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/runs/:id/dispatch", async (req: Request, res: Response) => {
    try {
      const result = await AgentOrchestratorService.dispatchBoundaryValidation({ ...(req.body || {}), run_id: String(req.params.id || ""), boundary_validation: req.body?.boundary_validation !== false });
      ok(res, { result }, { unsafe_tools_allowed: false, execution_attempted: false }, result.refused ? 409 : 202);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/runs/:id/cancel", async (req: Request, res: Response) => {
    try {
      const run = await AgentFabricRepository.cancelRun(String(req.params.id || ""), req.body || {});
      ok(res, { run, execution_attempted: Boolean(run.metadata?.execution_attempted) });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/approvals/history", async (_req: Request, res: Response) => {
    const approvals = await AgentFabricRepository.listApprovals();
    ok(res, { approvals }, { count: approvals.length });
  });

  router.get("/api/agent-fabric/approvals/pending", async (_req: Request, res: Response) => {
    const approvals = await AgentFabricRepository.listPendingApprovals();
    ok(res, { approvals }, { count: approvals.length });
  });

  router.get("/api/agent-fabric/approvals", async (req: Request, res: Response) => {
    const status = normalizeApprovalStatus(req.query.status);
    const approvals = await AgentFabricRepository.listApprovals(status);
    ok(res, { approvals }, { count: approvals.length, status: status || "all" });
  });

  router.get("/api/agent-fabric/approvals/:id", async (req: Request, res: Response) => {
    const approval = await AgentFabricRepository.getApproval(String(req.params.id || ""));
    if (!approval) return fail(res, 404, `Approval request not found: ${req.params.id}`);
    ok(res, { approval });
  });

  router.post("/api/agent-fabric/approvals/:id/approve", async (req: Request, res: Response) => {
    try {
      const approval = await AgentFabricRepository.approveApproval(String(req.params.id || ""), req.body || {});
      const run = await AgentFabricRepository.getRun(approval.run_id);
      ok(res, { approval, run, execution_attempted: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/approvals/:id/deny", async (req: Request, res: Response) => {
    try {
      const approval = await AgentFabricRepository.denyApproval(String(req.params.id || ""), req.body || {});
      const run = await AgentFabricRepository.getRun(approval.run_id);
      ok(res, { approval, run, execution_attempted: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/approvals/expire", async (req: Request, res: Response) => {
    try {
      const id = req.body?.approval_id || req.body?.id;
      if (id) {
        const approval = await AgentFabricRepository.expireApproval(String(id), req.body || {});
        const run = await AgentFabricRepository.getRun(approval.run_id);
        return ok(res, { expired: [approval], run, execution_attempted: false }, { count: 1 });
      }
      const before = await AgentFabricRepository.listApprovals("expired");
      const pending = await AgentFabricRepository.listPendingApprovals();
      const after = await AgentFabricRepository.listApprovals("expired");
      ok(res, { expired: after.slice(0, Math.max(0, after.length - before.length)), pending }, { count: Math.max(0, after.length - before.length), mode: "expire_due_only" });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/tools/calls", async (_req: Request, res: Response) => {
    const calls = await AgentFabricRepository.listToolCalls();
    ok(res, { calls }, { count: calls.length });
  });

  router.get("/api/agent-fabric/tools/summary", async (_req: Request, res: Response) => {
    const [tools, calls] = await Promise.all([
      AgentFabricRepository.listTools(),
      AgentFabricRepository.listToolCalls(),
    ]);
    const statuses = calls.reduce<Record<string, number>>((acc, call) => {
      acc[call.status] = (acc[call.status] || 0) + 1;
      return acc;
    }, {});
    ok(res, {
      registered: tools.length,
      calls: calls.length,
      statuses,
      unsafe_tools_allowed: AgentOrchestratorService.getContract().allow_unsafe_tools,
      dangerous_categories_blocked: tools.filter((tool) => !tool.safe_internal || tool.requires_approval || tool.risk_level !== "low").map((tool) => tool.name),
    });
  });

  router.get("/api/agent-fabric/tools/:toolName", async (req: Request, res: Response) => {
    const tools = await AgentFabricRepository.listTools();
    const tool = tools.find((item) => item.name === String(req.params.toolName || ""));
    if (!tool) return fail(res, 404, `Tool is not registered: ${req.params.toolName}`);
    ok(res, { tool });
  });

  router.get("/api/agent-fabric/tools", async (_req: Request, res: Response) => {
    const tools = await AgentFabricRepository.listTools();
    ok(res, { tools }, { count: tools.length });
  });

  router.post("/api/agent-fabric/tools/execute", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      if (!body.run_id && dangerousToolName(body.tool_name)) {
        return res.status(403).json({
          ok: false,
          error: { message: `${body.tool_name} is blocked and run_id is required; no execution attempted.` },
          data: null,
          meta: { phase: PHASE, tool_execution_attempted: false, unsafe_tools_allowed: false },
        });
      }
      const result = await AgentFabricRepository.executeTool({
        ...body,
        caller_id: body.caller_id || body.caller,
        request: body.request || body.input || {},
      });
      const executed = result.tool_call.status === "executed";
      if (executed) return ok(res, { tool_call: result.tool_call, output: result.output }, { tool_execution_attempted: true });
      return res.status(403).json({
        ok: false,
        error: { message: result.tool_call.denied_reason || `Tool call ${result.tool_call.status}: ${result.tool_call.tool_name}` },
        data: { tool_call: result.tool_call, output: result.output },
        meta: { phase: PHASE, tool_execution_attempted: false },
      });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/memory/search", async (req: Request, res: Response) => {
    const query = String(req.query.query || req.query.q || "").trim();
    const limit = parseLimit(req.query.limit, 25, 100);
    const entries = await AgentFabricRepository.searchMemory(query, limit);
    ok(res, { query, entries }, { count: entries.length });
  });

  router.post("/api/agent-fabric/memory/write", async (req: Request, res: Response) => {
    try {
      const entry = await AgentFabricRepository.writeMemory(req.body || {});
      ok(res, { entry }, {}, 201);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/orchestrator/state", async (_req: Request, res: Response) => {
    const [jobs, heartbeats, runs] = await Promise.all([
      AgentOrchestratorService.listJobs(),
      AgentOrchestratorService.listHeartbeats(),
      AgentFabricRepository.listRuns(),
    ]);
    ok(res, { contract: AgentOrchestratorService.getContract(), jobs, heartbeats, run_counts: { total: runs.length, active: runs.filter((run) => !["llm_completed", "completed", "failed", "stopped", "approval_denied", "approval_expired", "runtime_refused"].includes(run.status)).length } }, { docker_runtime_ready: false });
  });

  router.get("/api/agent-fabric/workers", async (_req: Request, res: Response) => {
    const [heartbeats, jobs] = await Promise.all([
      AgentOrchestratorService.listHeartbeats(),
      AgentOrchestratorService.listJobs(),
    ]);
    const job_counts = jobs.reduce<Record<string, number>>((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {});
    ok(res, { workers: heartbeats, jobs, job_counts }, { count: heartbeats.length, external_worker_supported: true, unsafe_tools_allowed: false });
  });

  router.get("/api/health/agent-fabric", async (_req: Request, res: Response) => {
    const health = await getAgentFabricHealth();
    recordFabricEvent("fabric_health_checked", "Agent Fabric health checked.", { status: health.status, phase: PHASE });
    res.json({ success: true, version: getAgentFabricVersion(), health });
  });

  router.get("/api/agents/types", async (_req: Request, res: Response) => {
    const templates = await AgentFabricRepository.listTemplates();
    recordFabricEvent("agent_template_listed", "Agent template registry listed.", { count: templates.length });
    res.json({ success: true, phase: PHASE, worker_runtime_enabled: false, count: templates.length, templates });
  });

  router.get("/api/agents/types/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const template = await AgentFabricRepository.getTemplate(id);
    if (!template) return res.status(404).json({ success: false, error: `Agent template not found: ${id}` });
    recordFabricEvent("agent_template_loaded", "Agent template loaded.", { id });
    res.json({ success: true, phase: PHASE, template });
  });

  router.get("/api/agent-fabric/runtime-names", (_req: Request, res: Response) => {
    res.json({ success: true, names: listRuntimeNames(), sample: pickRuntimeName() });
  });

  router.post("/api/agent-fabric/permissions/check", (req: Request, res: Response) => {
    const permissions = req.body?.permissions;
    if (!permissions || typeof permissions !== "object") return res.status(400).json({ success: false, error: "permissions object is required" });
    const requiresApproval = approvalRequiredForPermissions(permissions);
    const risks = detectPermissionRisks(permissions, Array.isArray(req.body?.template_requires_approval_for) ? req.body.template_requires_approval_for : []);
    recordFabricEvent("permission_policy_checked", "Permission policy checked.", { requiresApproval, risks: risks.length });
    res.json({ success: true, phase: PHASE, requires_approval_for: requiresApproval, permission_risks: risks, allowed_without_approval: risks.length === 0 });
  });

  router.get("/api/agent-fabric/events", (_req: Request, res: Response) => {
    res.json({ success: true, events: listFabricEvents() });
  });

  router.get("/api/agent-fabric/run-events", async (req: Request, res: Response) => {
    const limit = parseLimit(req.query.limit, 100, 500);
    const events = await AgentFabricRepository.listEvents(limit);
    res.json({ success: true, phase: PHASE, count: events.length, events });
  });

  router.get("/api/agent-fabric/schema", (_req: Request, res: Response) => {
    res.type("text/plain").send(AGENT_FABRIC_SCHEMA_SQL);
  });

  router.post("/api/agent-fabric/migrate", async (_req: Request, res: Response) => {
    try {
      const migration = await AgentFabricRepository.migrate();
      const seed = migration.databaseConfigured ? await AgentFabricRepository.seedDefaults() : { seeded: false, count: 0, databaseConfigured: false };
      const state_migration = migration.databaseConfigured ? await AgentFabricRepository.migrateStateFileToPostgres() : { migrated: false, counts: {}, databaseConfigured: false };
      res.json({ success: true, migration, seed, state_migration });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  router.post("/api/agents/call", async (req: Request, res: Response) => {
    try {
      const result = await AgentFabricRepository.createQueuedRun(normalizeAgentCallBody(req.body));
      res.status(202).json({
        success: true,
        phase: PHASE,
        worker_runtime_enabled: false,
        execution_attempted: false,
        approval_required: result.approvals.length > 0,
        message: result.approvals.length > 0
          ? "Run is waiting for task-scoped approval. Only orchestrator boundary validation is available in Phase 6."
          : "No approval required, but worker runtime is disabled. No execution was attempted.",
        run: result.run,
        approvals: result.approvals,
        permission_risks: result.permission_risks,
      });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.get("/api/agents/runs", async (_req: Request, res: Response) => {
    const runs = await AgentFabricRepository.listRuns();
    res.json({ success: true, phase: PHASE, count: runs.length, runs });
  });

  router.get("/api/agents/runs/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const run = await AgentFabricRepository.getRun(id);
    if (!run) return res.status(404).json({ success: false, error: `Agent run not found: ${id}` });
    res.json({ success: true, phase: PHASE, run });
  });

  router.get("/api/agents/runs/:id/logs", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const run = await AgentFabricRepository.getRun(id);
    if (!run) return res.status(404).json({ success: false, error: `Agent run not found: ${id}` });
    const logs = await AgentFabricRepository.getRunLogs(id);
    res.json({ success: true, phase: PHASE, run_id: id, count: logs.length, logs });
  });

  router.get("/api/agents/runs/:id/events", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const run = await AgentFabricRepository.getRun(id);
    if (!run) return res.status(404).json({ success: false, error: `Agent run not found: ${id}` });
    const events = await AgentFabricRepository.getRunEvents(id);
    res.json({ success: true, phase: PHASE, run_id: id, count: events.length, events });
  });

  router.get("/api/agents/runs/:id/approvals", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const run = await AgentFabricRepository.getRun(id);
    if (!run) return res.status(404).json({ success: false, error: `Agent run not found: ${id}` });
    const approvals = await AgentFabricRepository.getRunApprovals(id);
    res.json({ success: true, phase: PHASE, run_id: id, count: approvals.length, approvals });
  });

  router.post("/api/memory/write", async (req: Request, res: Response) => {
    try {
      const entry = await AgentFabricRepository.writeMemory(req.body || {});
      res.status(201).json({ success: true, phase: PHASE, entry });
    } catch (err: any) {
      res.status(400).json({ success: false, phase: PHASE, error: err?.message || String(err) });
    }
  });

  router.get("/api/memory/search", async (req: Request, res: Response) => {
    const query = String(req.query.query || req.query.q || "").trim();
    const limit = parseLimit(req.query.limit, 25, 100);
    const entries = await AgentFabricRepository.searchMemory(query, limit);
    res.json({ success: true, phase: PHASE, query, count: entries.length, entries });
  });

  router.get("/api/approvals", async (req: Request, res: Response) => {
    const status = normalizeApprovalStatus(req.query.status);
    const approvals = await AgentFabricRepository.listApprovals(status);
    res.json({ success: true, phase: PHASE, status: status || "all", count: approvals.length, approvals });
  });

  router.get("/api/approvals/pending", async (_req: Request, res: Response) => {
    const approvals = await AgentFabricRepository.listPendingApprovals();
    res.json({ success: true, phase: PHASE, count: approvals.length, approvals });
  });

  router.get("/api/approvals/history", async (_req: Request, res: Response) => {
    const approvals = await AgentFabricRepository.listApprovals();
    res.json({ success: true, phase: PHASE, count: approvals.length, approvals });
  });

  router.get("/api/approvals/:id", async (req: Request, res: Response) => {
    const approval = await AgentFabricRepository.getApproval(String(req.params.id || ""));
    if (!approval) return res.status(404).json({ success: false, error: `Approval request not found: ${req.params.id}` });
    res.json({ success: true, phase: PHASE, approval });
  });

  router.post("/api/approvals/:id/approve", async (req: Request, res: Response) => {
    try {
      const approval = await AgentFabricRepository.approveApproval(String(req.params.id || ""), req.body || {});
      const run = await AgentFabricRepository.getRun(approval.run_id);
      res.json({ success: true, phase: PHASE, worker_runtime_enabled: false, execution_attempted: false, approval, run });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.post("/api/approvals/:id/deny", async (req: Request, res: Response) => {
    try {
      const approval = await AgentFabricRepository.denyApproval(String(req.params.id || ""), req.body || {});
      const run = await AgentFabricRepository.getRun(approval.run_id);
      res.json({ success: true, phase: PHASE, worker_runtime_enabled: false, execution_attempted: false, approval, run });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.post("/api/approvals/:id/expire", async (req: Request, res: Response) => {
    try {
      const approval = await AgentFabricRepository.expireApproval(String(req.params.id || ""), req.body || {});
      const run = await AgentFabricRepository.getRun(approval.run_id);
      res.json({ success: true, phase: PHASE, worker_runtime_enabled: false, execution_attempted: false, approval, run });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.get("/api/agent-fabric/orchestrator/contract", (_req: Request, res: Response) => {
    ok(res, { contract: AgentOrchestratorService.getContract() });
  });

  router.get("/api/agent-fabric/orchestrator/jobs", async (_req: Request, res: Response) => {
    const jobs = await AgentOrchestratorService.listJobs();
    ok(res, { jobs }, { count: jobs.length });
  });

  router.get("/api/agent-fabric/workers/heartbeats", async (_req: Request, res: Response) => {
    const heartbeats = await AgentOrchestratorService.listHeartbeats();
    ok(res, { heartbeats }, { count: heartbeats.length });
  });

  router.post("/api/agent-fabric/workers/heartbeat", async (req: Request, res: Response) => {
    try {
      if (!requireWorkerToken(req, res)) return;
      const heartbeat = await AgentOrchestratorService.heartbeat(req.body || {});
      ok(res, { heartbeat });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/agent-fabric/workers/jobs/next", async (req: Request, res: Response) => {
    try {
      if (!requireWorkerToken(req, res)) return;
      const job = await AgentOrchestratorService.nextJob({ worker_id: String(req.query.worker_id || req.header("x-agent-fabric-worker-id") || "") });
      ok(res, { job }, { job_available: Boolean(job), unsafe_tools_allowed: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/workers/jobs/:jobId/lease", async (req: Request, res: Response) => {
    try {
      if (!requireWorkerToken(req, res)) return;
      const job = await AgentOrchestratorService.leaseJob(String(req.params.jobId || ""), req.body || {});
      ok(res, { job }, { unsafe_tools_allowed: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/workers/jobs/:jobId/complete", async (req: Request, res: Response) => {
    try {
      if (!requireWorkerToken(req, res)) return;
      const job = await AgentOrchestratorService.completeJob(String(req.params.jobId || ""), req.body || {});
      ok(res, { job }, { unsafe_tools_allowed: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/workers/jobs/:jobId/fail", async (req: Request, res: Response) => {
    try {
      if (!requireWorkerToken(req, res)) return;
      const job = await AgentOrchestratorService.failJob(String(req.params.jobId || ""), req.body || {});
      ok(res, { job }, { unsafe_tools_allowed: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/workers/jobs/:jobId/heartbeat", async (req: Request, res: Response) => {
    try {
      if (!requireWorkerToken(req, res)) return;
      const result = await AgentOrchestratorService.heartbeatJob(String(req.params.jobId || ""), req.body || {});
      ok(res, result, { unsafe_tools_allowed: false });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/agent-fabric/orchestrator/dispatch-llm", async (req: Request, res: Response) => {
    try {
      const result = await AgentOrchestratorService.dispatchControlledLlm(req.body || {});
      res.status(result.refused ? 409 : result.run.status === "failed" ? 502 : 202).json({
        success: !result.refused && result.run.status !== "failed",
        phase: PHASE,
        worker_runtime_enabled: true,
        execution_attempted: !result.refused,
        llm_execution_attempted: !result.refused,
        unsafe_tools_allowed: false,
        result,
      });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.post("/api/agent-fabric/orchestrator/dispatch", async (req: Request, res: Response) => {
    try {
      const result = await AgentOrchestratorService.dispatchBoundaryValidation(req.body || {});
      ok(res, { result }, { worker_runtime_enabled: false, execution_attempted: false, llm_execution_attempted: false, unsafe_tools_allowed: false }, result.refused ? 409 : 202);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/tools", async (_req: Request, res: Response) => {
    const tools = await AgentFabricRepository.listTools();
    res.json({ success: true, phase: PHASE, count: tools.length, tools });
  });

  router.get("/api/tools/catalog", async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const catalog = buildCanonicalCatalog(baseUrl, canonicalC2Tools);
      res.json({ ok: true, data: catalog });
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.post("/api/tools/:toolName/run", async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const requestId = `canonical_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = req.body?.arguments ?? req.body?.input ?? req.body ?? {};
      const timeoutMs = req.body?.timeoutMs;
      const result = await runCanonicalTool(String(req.params.toolName || ""), payload, baseUrl, canonicalC2Tools, { requestId, timeoutMs });
      res.status(result.statusCode).json(result.body);
    } catch (err: any) {
      canonicalError(res, err);
    }
  });

  router.get("/api/tools/calls", async (_req: Request, res: Response) => {
    const calls = await AgentFabricRepository.listToolCalls();
    res.json({ success: true, phase: PHASE, count: calls.length, calls });
  });

  router.get("/api/agents/runs/:id/tools", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const run = await AgentFabricRepository.getRun(id);
    if (!run) return res.status(404).json({ success: false, error: `Agent run not found: ${id}` });
    const calls = await AgentFabricRepository.listToolCalls(id);
    res.json({ success: true, phase: PHASE, run_id: id, count: calls.length, calls });
  });

  router.post("/api/tools/execute", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      if (!body.run_id && dangerousToolName(body.tool_name)) {
        return res.status(403).json({
          success: false,
          phase: PHASE,
          error: `${body.tool_name} is blocked and run_id is required; no execution attempted.`,
          tool_execution_attempted: false,
          unsafe_tools_allowed: false,
        });
      }
      const result = await AgentFabricRepository.executeTool({ ...body, caller_id: body.caller_id || body.caller, request: body.request || body.input || {} });
      const ok = result.tool_call.status === "executed";
      const status = ok ? 200 : result.tool_call.status === "approval_required" ? 403 : result.tool_call.status === "blocked" ? 403 : 400;
      res.status(status).json({
        success: ok,
        phase: PHASE,
        worker_runtime_enabled: false,
        execution_attempted: false,
        tool_execution_attempted: ok,
        tool_call: result.tool_call,
        output: result.output,
      });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  // Phase 9 compatibility aliases for older UI/tools. These preserve legacy shape
  // where it already existed, and add missing aliases with stable fields.
  router.get("/api/agents/runs/:id/result", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const run = await AgentFabricRepository.getRun(id);
    if (!run) return res.status(404).json({ success: false, phase: PHASE, error: `Agent run not found: ${id}` });
    res.json({ success: true, phase: PHASE, run_id: id, status: run.status, result_summary: run.result_summary, completed_at: run.completed_at, metadata: run.metadata });
  });

  router.get("/api/agents/runs/:id/state", async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    const run = await AgentFabricRepository.getRun(id);
    if (!run) return res.status(404).json({ success: false, phase: PHASE, error: `Agent run not found: ${id}` });
    res.json({ success: true, phase: PHASE, run_id: id, status: run.status, started_at: run.started_at, completed_at: run.completed_at, metadata: run.metadata });
  });

  router.post("/api/agents/runs/:id/execute-llm", async (req: Request, res: Response) => {
    try {
      const result = await AgentOrchestratorService.dispatchControlledLlm({ ...(req.body || {}), run_id: String(req.params.id || "") });
      res.status(result.refused ? 409 : result.run.status === "failed" ? 502 : 202).json({ success: !result.refused && result.run.status !== "failed", phase: PHASE, worker_runtime_enabled: true, execution_attempted: !result.refused, llm_execution_attempted: !result.refused, unsafe_tools_allowed: false, result });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.post("/api/agents/runs/:id/dispatch", async (req: Request, res: Response) => {
    try {
      const result = await AgentOrchestratorService.dispatchBoundaryValidation({ ...(req.body || {}), run_id: String(req.params.id || ""), boundary_validation: req.body?.boundary_validation !== false });
      res.status(result.refused ? 409 : 202).json({ success: !result.refused, phase: PHASE, worker_runtime_enabled: false, execution_attempted: false, llm_execution_attempted: false, unsafe_tools_allowed: false, result });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.post("/api/agents/runs/:id/cancel", async (req: Request, res: Response) => {
    try {
      const run = await AgentFabricRepository.cancelRun(String(req.params.id || ""), req.body || {});
      res.json({ success: true, phase: PHASE, execution_attempted: Boolean(run.metadata?.execution_attempted), run });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.get("/api/approvals/history", async (_req: Request, res: Response) => {
    const approvals = await AgentFabricRepository.listApprovals();
    res.json({ success: true, phase: PHASE, count: approvals.length, approvals });
  });

  router.post("/api/approvals/expire", async (req: Request, res: Response) => {
    try {
      const id = req.body?.approval_id || req.body?.id;
      if (!id) {
        const pending = await AgentFabricRepository.listPendingApprovals();
        return res.json({ success: true, phase: PHASE, count: 0, expired: [], pending, mode: "expire_due_only" });
      }
      const approval = await AgentFabricRepository.expireApproval(String(id), req.body || {});
      const run = await AgentFabricRepository.getRun(approval.run_id);
      res.json({ success: true, phase: PHASE, count: 1, expired: [approval], run, execution_attempted: false });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  router.get("/api/tools/:toolName", async (req: Request, res: Response) => {
    const tools = await AgentFabricRepository.listTools();
    const tool = tools.find((item) => item.name === String(req.params.toolName || ""));
    if (!tool) return res.status(404).json({ success: false, phase: PHASE, error: `Tool is not registered: ${req.params.toolName}` });
    res.json({ success: true, phase: PHASE, tool });
  });

  router.post("/api/agents/match", async (req: Request, res: Response) => {
    try {
      const matches = await AgentFabricRepository.matchAgents({ task: req.body?.task || req.body?.query, capabilities: req.body?.capabilities, limit: parseLimit(req.body?.limit, 8, 50) });
      res.json({ success: true, phase: PHASE, count: matches.length, matches });
    } catch (err: any) { routeError(res, err); }
  });

  router.post("/api/agents/delegations", async (req: Request, res: Response) => {
    try {
      const result = await AgentFabricRepository.createDelegation(req.body || {});
      res.status(202).json({ success: true, phase: PHASE, ...result });
    } catch (err: any) { routeError(res, err); }
  });

  router.get("/api/agents/messages", async (req: Request, res: Response) => {
    try {
      const messages = await AgentFabricRepository.listMessages({ thread_id: req.query.thread_id ? String(req.query.thread_id) : undefined, run_id: req.query.run_id ? String(req.query.run_id) : undefined });
      res.json({ success: true, phase: PHASE, count: messages.length, messages });
    } catch (err: any) { routeError(res, err); }
  });

  router.post("/api/agents/runs/:id/stop", (_req: Request, res: Response) => notImplemented(res, "Agent run stop"));
  router.post("/api/agents/runs/:id/message", async (req: Request, res: Response) => {
    try {
      const run = await requireRun(req.params.id);
      const message = await AgentFabricRepository.createMessage({ ...(req.body || {}), run_id: run.id, thread_id: req.body?.thread_id || `run:${run.id}`, sender_id: req.body?.sender_id || req.body?.called_by || "c2", sender_role: req.body?.sender_role || "user", agent_type: run.agent_type });
      res.status(201).json({ success: true, phase: PHASE, message });
    } catch (err: any) {
      routeError(res, err);
    }
  });

  return router;
}
