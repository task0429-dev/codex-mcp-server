import { z } from "zod";
import { logger } from "../core/logger";
import { buildCommandCenterPayload } from "../core/command-center";
import { getAllTools, getTool } from "../server/tool-registry";
import { C2ToolService } from "../c2/tool-service";
import { listToolDefinitions } from "./tool-registry";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_CHARS = 20_000;

type PolicyStatus = "callable" | "approval_required" | "blocked_by_policy" | "inventory_only";
type ToolSource = "mcp-core" | "c2-runtime" | "inventory" | "agent-fabric";

type CanonicalCatalogEntry = {
  name: string;
  description: string;
  source: ToolSource;
  inputSchema: Record<string, unknown>;
  callable: boolean;
  policyStatus: PolicyStatus;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiredAuthPolicy: string;
  executionRoute: string | null;
  timeoutMs: number | null;
  destructive: boolean;
  approvalRequired: boolean;
  blocked: boolean;
  inventoryOnly: boolean;
  visibleInCommandCenter: boolean;
  details: Record<string, unknown>;
};

type RunOptions = {
  requestId: string;
  timeoutMs?: number;
};

function normalizeToolName(value: unknown) {
  return String(value || "").trim();
}

function classifyToolPolicy(
  name: string,
  description: string,
  destructive = false,
  details: Record<string, unknown> = {},
): { status: PolicyStatus; riskLevel: CanonicalCatalogEntry["riskLevel"]; requiredAuthPolicy: string } {
  const nameText = String(name || "").toLowerCase();
  const descText = String(description || "").toLowerCase();
  const group = String(details.group || details.category || "").toLowerCase();
  const executionMode = String(details.executionMode || "").toLowerCase();
  const combined = `${nameText} ${descText} ${group} ${executionMode}`;
  const token = "(^|[\\s._-])";
  const tokenEnd = "($|[\\s._-])";
  const safeNameSignals = new RegExp(`${token}(read|search|list|status|health|diagnose|inspect|fetch|echo|summary|snapshot|metadata|info|port|schema|tables|transform)${tokenEnd}`);
  const blockedNameSignals = new RegExp(`${token}(delete|remove|drop|kill|shutdown|restart|credential|secret|payment|billing|firewall|wipe|prune|format|trash)${tokenEnd}`);
  const blockedDescSignals = /\b(delete|remove|drop|kill|shutdown|restart|credential|secret|payment|billing|firewall|wipe|prune|format|trash)\b/;
  const approvalSignals = new RegExp(`${token}(write|create|update|send|execute|build|deploy|store|unlock|commit|push|open|control|message|delegate|approve|cancel|activate|deactivate|launch|call)${tokenEnd}`);
  const structuredApprovalGroup = /\b(command_execution|terminal|desktop|shell|deployment|email|calendar|repo_write)\b/;

  if (
    destructive ||
    /\bshell(\.execute)?\b/.test(`${nameText} ${group} ${executionMode}`) ||
    /\bdocker\.control\b/.test(`${nameText} ${group} ${executionMode}`) ||
    blockedNameSignals.test(nameText) ||
    blockedDescSignals.test(descText)
  ) {
    return { status: "blocked_by_policy", riskLevel: destructive ? "high" : "critical", requiredAuthPolicy: "blocked_high_risk" };
  }
  if (structuredApprovalGroup.test(combined)) {
    return { status: "approval_required", riskLevel: "medium", requiredAuthPolicy: "approval_required_medium_risk" };
  }
  if (safeNameSignals.test(nameText)) {
    return { status: "callable", riskLevel: "low", requiredAuthPolicy: "low_risk_callable" };
  }
  if (approvalSignals.test(nameText) || (/\b(write|create|update|send|execute|build|deploy|store|unlock|commit|push|open|control|message|delegate|approve|cancel|activate|deactivate|launch|call)\b/.test(descText) && !safeNameSignals.test(nameText))) {
    return { status: "approval_required", riskLevel: "medium", requiredAuthPolicy: "approval_required_medium_risk" };
  }
  return { status: "callable", riskLevel: "low", requiredAuthPolicy: "low_risk_callable" };
}

function validateShape(input: Record<string, unknown>, schema: Record<string, unknown>) {
  const shape: Record<string, unknown> = schema && typeof schema === "object" ? schema : {};
  const errors: string[] = [];
  for (const [key, config] of Object.entries(shape)) {
    const rule = config && typeof config === "object" ? config as Record<string, unknown> : {};
    const optional = Boolean(rule.optional);
    const expectedType = typeof rule.type === "string" ? String(rule.type) : "";
    const value = input[key];
    if ((value === undefined || value === null) && !optional) {
      errors.push(`${key} is required`);
      continue;
    }
    if (value === undefined || value === null || !expectedType) continue;
    if (expectedType === "array" && !Array.isArray(value)) errors.push(`${key} must be an array`);
    else if (expectedType === "number" && typeof value !== "number") errors.push(`${key} must be a number`);
    else if (expectedType === "boolean" && typeof value !== "boolean") errors.push(`${key} must be a boolean`);
    else if (expectedType === "string" && typeof value !== "string") errors.push(`${key} must be a string`);
    else if (expectedType === "object" && (Array.isArray(value) || typeof value !== "object")) errors.push(`${key} must be an object`);
  }
  if (errors.length) throw new Error(`Validation failed: ${errors.join("; ")}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function enforceResponseLimit(result: unknown) {
  const text = JSON.stringify(result);
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new Error(`Tool response exceeds ${MAX_RESPONSE_CHARS} characters`);
  }
  return result;
}

function normalizeInventory(baseUrl: string) {
  const payload = buildCommandCenterPayload(baseUrl) as any;
  const items = Array.isArray(payload?.tools?.tools) ? payload.tools.tools : [];
  return items.map((tool: any) => ({
    name: normalizeToolName(tool?.name || tool?.id),
    description: String(tool?.description || ""),
    inputSchema: tool?.schema && typeof tool.schema === "object" ? tool.schema : {},
    destructive: Boolean(tool?.destructive),
    details: tool && typeof tool === "object" ? tool : {},
  })).filter((tool: any) => tool.name);
}

export function buildCanonicalCatalog(baseUrl: string, c2Tools: C2ToolService) {
  const inventory = normalizeInventory(baseUrl);
  const coreTools = getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema as any).toJSON?.() || {},
    destructive: Boolean(tool.destructive),
    source: "mcp-core" as const,
    details: { group: tool.group },
  }));
  const gatewayTools = listToolDefinitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {},
    destructive: tool.risk_level === "critical",
    source: "agent-fabric" as const,
    details: {
      category: tool.category,
      gatewayRiskLevel: tool.risk_level,
      gatewayImplemented: tool.implemented,
      gatewayRequiresApproval: tool.requires_approval,
      gatewaySafeInternal: tool.safe_internal,
      gatewayRequiredPermission: tool.required_permission,
    },
    directExecution: false,
  }));
  const runtimeTools = c2Tools.list().map((tool) => ({
    name: tool.id,
    description: tool.description,
    inputSchema: tool.inputSchema || {},
    destructive: Boolean(tool.destructive),
    source: "c2-runtime" as const,
    details: { category: tool.category, executionMode: tool.executionMode, allowedAgents: tool.allowedAgents },
  }));

  const merged = new Map<string, CanonicalCatalogEntry>();
  const add = (input: { name: string; description: string; inputSchema: Record<string, unknown>; destructive: boolean; source: ToolSource; details: Record<string, unknown>; visibleInCommandCenter?: boolean; directExecution?: boolean }) => {
    const existing = merged.get(input.name);
    const policy = classifyToolPolicy(input.name, input.description, input.destructive, input.details);
    const directExecution = input.directExecution ?? input.source !== "inventory";
    const shouldForceInventoryOnly =
      input.source === "agent-fabric" &&
      !directExecution &&
      !/(^|[.\s_-])write($|[.\s_-])/.test(input.name.toLowerCase()) &&
      input.details.gatewayImplemented === true &&
      input.details.gatewaySafeInternal === true &&
      input.details.gatewayRequiresApproval !== true &&
      String(input.details.gatewayRiskLevel || "").toLowerCase() === "low";
    const inventoryOnly = shouldForceInventoryOnly || (!directExecution && policy.status === "callable");
    const policyStatus = inventoryOnly ? "inventory_only" : policy.status;
    const next: CanonicalCatalogEntry = {
      name: input.name,
      description: input.description || existing?.description || "",
      source: input.source === "inventory" ? existing?.source || "inventory" : input.source,
      inputSchema: Object.keys(input.inputSchema || {}).length ? input.inputSchema : existing?.inputSchema || {},
      callable: policy.status === "callable" && directExecution,
      policyStatus,
      riskLevel: policy.riskLevel,
      requiredAuthPolicy: inventoryOnly ? "inventory_only" : policy.requiredAuthPolicy,
      executionRoute: inventoryOnly ? null : `/api/tools/${encodeURIComponent(input.name)}/run`,
      timeoutMs: inventoryOnly ? null : DEFAULT_TIMEOUT_MS,
      destructive: input.destructive || Boolean(existing?.destructive),
      approvalRequired: policy.status === "approval_required",
      blocked: policy.status === "blocked_by_policy",
      inventoryOnly,
      visibleInCommandCenter: Boolean(input.visibleInCommandCenter || existing?.visibleInCommandCenter),
      details: { ...(existing?.details || {}), ...(input.details || {}) },
    };
    if (existing) {
      next.inventoryOnly = false;
      next.visibleInCommandCenter = Boolean(existing.visibleInCommandCenter || input.visibleInCommandCenter);
    }
    merged.set(input.name, next);
  };

  for (const item of inventory) add({ ...item, source: "inventory", visibleInCommandCenter: true });
  for (const item of gatewayTools) add(item);
  for (const item of coreTools) add({ ...item, visibleInCommandCenter: merged.has(item.name) });
  for (const item of runtimeTools) add({ ...item, visibleInCommandCenter: merged.has(item.name) });

  const tools = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    generatedAt: new Date().toISOString(),
    totalToolsVisible: tools.length,
    callableTools: tools.filter((tool) => tool.callable).length,
    inventoryOnlyTools: tools.filter((tool) => tool.inventoryOnly).length,
    approvalRequiredTools: tools.filter((tool) => tool.policyStatus === "approval_required").length,
    blockedTools: tools.filter((tool) => tool.policyStatus === "blocked_by_policy").length,
    tools,
  };
}

export async function runCanonicalTool(toolName: string, rawInput: unknown, baseUrl: string, c2Tools: C2ToolService, options: RunOptions) {
  const catalog = buildCanonicalCatalog(baseUrl, c2Tools);
  const entry = catalog.tools.find((tool) => tool.name === normalizeToolName(toolName));
  if (!entry) {
    return { statusCode: 404, body: { ok: false, error: `Unknown tool: ${toolName}`, code: "tool_not_found" } };
  }

  const safeInput = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) ? rawInput as Record<string, unknown> : {};
  const argKeys = Object.keys(safeInput).slice(0, 20);
  logger.info("canonical_tool_attempt", { requestId: options.requestId, tool: entry.name, policyStatus: entry.policyStatus, argKeys });

  if (entry.inventoryOnly) {
    return { statusCode: 409, body: { ok: false, code: "not_callable", tool: entry.name, policyStatus: entry.policyStatus, message: `${entry.name} is inventory-only right now.` } };
  }
  if (entry.policyStatus === "blocked_by_policy") {
    return { statusCode: 403, body: { ok: false, code: "blocked_by_policy", tool: entry.name, policyStatus: entry.policyStatus, message: `${entry.name} is blocked by policy.` } };
  }
  if (entry.policyStatus === "approval_required") {
    return { statusCode: 403, body: { ok: false, code: "requires_approval", tool: entry.name, policyStatus: entry.policyStatus, message: `${entry.name} requires approval before execution.` } };
  }

  const timeoutMs = Math.max(1, Math.min(Number(options.timeoutMs || entry.timeoutMs || DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS));
  try {
    let result: unknown;
    const coreTool = getTool(entry.name);
    if (coreTool) {
      const validated = coreTool.inputSchema.parse(safeInput);
      result = await withTimeout(coreTool.handler(validated, { requestId: options.requestId }), timeoutMs);
    } else {
      const runtimeTool = c2Tools.get(entry.name);
      if (!runtimeTool) {
        return { statusCode: 409, body: { ok: false, code: "not_callable", tool: entry.name, policyStatus: "inventory_only", message: `${entry.name} has no callable executor.` } };
      }
      validateShape(safeInput, runtimeTool.inputSchema || {});
      result = await withTimeout(c2Tools.execute(entry.name, safeInput), timeoutMs);
    }
    enforceResponseLimit(result);
    logger.info("canonical_tool_success", { requestId: options.requestId, tool: entry.name, timeoutMs });
    return { statusCode: 200, body: { ok: true, tool: entry.name, timeoutMs, result } };
  } catch (error: any) {
    const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("; ") : error?.message || String(error);
    const lowered = message.toLowerCase();
    const code = error instanceof z.ZodError || lowered.startsWith("validation failed:")
      ? "validation_error"
      : lowered.includes("timed out")
        ? "timeout"
        : lowered.includes("response exceeds")
          ? "response_too_large"
          : "execution_error";
    const statusCode = code === "validation_error" ? 400 : code === "timeout" ? 504 : 500;
    logger.warn("canonical_tool_failure", { requestId: options.requestId, tool: entry.name, code });
    return { statusCode, body: { ok: false, code, tool: entry.name, message, timeoutMs } };
  }
}
