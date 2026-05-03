import { z } from "zod";

export const AgentIdSchema = z.enum(["abdi", "dame", "ayub", "rex", "ahmed", "atlas", "prime", "sygma"]);
export type AgentId = z.infer<typeof AgentIdSchema>;

export const ToolExecutionModeSchema = z.enum(["sync", "async", "streaming"]);
export const ExecutionStatusSchema = z.enum(["queued", "running", "completed", "failed", "canceled", "timed_out"]);
export const SeveritySchema = z.enum(["info", "warning", "error", "critical"]);
export const ToolCategorySchema = z.enum(["rest_api", "filesystem", "command_execution", "docker", "n8n", "notion", "memory_search", "monitoring"]);

export const AgentPermissionSchema = z.object({
  integration: z.string(),
  level: z.enum(["none", "read", "write", "execute", "admin"]),
});

export const AgentRecordSchema = z.object({
  id: AgentIdSchema,
  name: z.string(),
  role: z.string(),
  description: z.string(),
  permissions: z.array(AgentPermissionSchema),
  toolAccess: z.array(z.string()),
  memoryScope: z.array(z.string()),
  status: z.enum(["online", "degraded", "offline", "standby"]),
  heartbeatAt: z.string().nullable(),
  activeSessionCount: z.number(),
  lastActivityAt: z.string().nullable(),
});

export const ToolMetadataSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: ToolCategorySchema,
  inputSchema: z.record(z.string(), z.any()),
  outputSchema: z.record(z.string(), z.any()),
  authRequired: z.boolean(),
  rateLimitPerMinute: z.number().nullable(),
  executionMode: ToolExecutionModeSchema,
  allowedAgents: z.array(AgentIdSchema),
  auditEnabled: z.boolean(),
  version: z.string(),
  destructive: z.boolean(),
});

export const ExecutionCreateSchema = z.object({
  toolId: z.string(),
  agentId: AgentIdSchema,
  payload: z.record(z.string(), z.any()).default({}),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  intent: z.string(),
  projectId: z.string().optional(),
  correlationId: z.string().optional(),
  async: z.boolean().optional().default(false),
});

export const ExecutionRecordSchema = z.object({
  id: z.string(),
  toolId: z.string(),
  toolName: z.string(),
  agentId: AgentIdSchema,
  intent: z.string(),
  projectId: z.string().nullable(),
  correlationId: z.string().nullable(),
  priority: z.enum(["low", "normal", "high", "critical"]),
  status: ExecutionStatusSchema,
  payload: z.record(z.string(), z.any()),
  result: z.any().nullable(),
  error: z.string().nullable(),
  failureClass: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  retries: z.number(),
  timeoutMs: z.number().nullable(),
});

export const MemorySearchQuerySchema = z.object({
  q: z.string().optional().default(""),
  agentId: AgentIdSchema.optional(),
  projectId: z.string().optional(),
  source: z.string().optional(),
  severity: SeveritySchema.optional(),
  tag: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().optional().default(20),
  cursor: z.number().optional().default(0),
});

export const MemoryRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  source: z.string(),
  kind: z.string(),
  severity: SeveritySchema,
  summary: z.string(),
  detail: z.string(),
  agentId: AgentIdSchema.nullable(),
  projectId: z.string().nullable(),
  tags: z.array(z.string()),
  correlationId: z.string().nullable(),
  metadata: z.record(z.string(), z.any()).default({}),
  embedding: z.array(z.number()),
});

export const MonitoringActionSchema = z.object({
  action: z.enum(["diagnose", "restart"]),
  agentId: AgentIdSchema,
});

export const ServiceHealthSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  status: z.enum(["healthy", "degraded", "offline", "unknown"]),
  target: z.string(),
  lastCheckedAt: z.string(),
  responseTimeMs: z.number().nullable(),
  detail: z.string(),
  actions: z.array(z.string()),
  incidentCount: z.number(),
});

export const ConnectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  groupId: z.string(),
  type: z.enum(["https", "http", "tcp", "ping", "heartbeat", "docker", "dns", "ssl", "push"]),
  endpoint: z.string(),
  environment: z.enum(["prod", "staging", "dev"]),
  uptime: z.number(),
  responseTime: z.number().nullable(),
  lastCheck: z.string(),
  lastSuccess: z.string().nullable(),
  lastFailure: z.string().nullable(),
  heartbeatPct: z.number().nullable(),
  beats: z.array(z.enum(["u", "d", "e", "p", "m"])),
  tags: z.array(z.string()),
  failureReason: z.string().optional(),
  incidentCount: z.number(),
  owner: z.string().optional(),
});

export const AlertSchema = z.object({
  id: z.string(),
  type: z.enum(["down", "degraded", "heartbeat_miss", "ssl_expiry", "latency_spike"]),
  connectionId: z.string(),
  connectionName: z.string(),
  groupId: z.string(),
  message: z.string(),
  severity: z.enum(["critical", "high", "medium"]),
  timestamp: z.string(),
});

export const HeartbeatJobSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  name: z.string(),
  expectedIntervalMin: z.number(),
  lastReceived: z.string().nullable(),
  consecutiveMisses: z.number(),
  successRate24h: z.number(),
  schedule: z.string(),
  workerNode: z.string().nullable(),
  status: z.enum(["active", "missed", "critical", "unknown"]),
  failureReason: z.string(),
  suggestedFix: z.string(),
});

export const RexDiagnosticsSchema = z.object({
  heartbeatJobs: z.array(HeartbeatJobSchema),
  connections: z.array(ConnectionSchema),
  alerts: z.array(AlertSchema),
  incidentCount: z.number(),
  lastAuditAt: z.string().nullable(),
});

export type AgentRecord = z.infer<typeof AgentRecordSchema>;
export type ToolMetadata = z.infer<typeof ToolMetadataSchema>;
export type ExecutionCreateInput = z.infer<typeof ExecutionCreateSchema>;
export type ExecutionRecord = z.infer<typeof ExecutionRecordSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type MemorySearchQuery = z.infer<typeof MemorySearchQuerySchema>;
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type HeartbeatJob = z.infer<typeof HeartbeatJobSchema>;
export type RexDiagnostics = z.infer<typeof RexDiagnosticsSchema>;
