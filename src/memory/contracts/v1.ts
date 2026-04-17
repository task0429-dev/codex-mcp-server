import { z } from "zod";

export const MemoryApiVersion = "v1" as const;

export const ScopeTypeSchema = z.enum(["global", "agent", "client", "project", "system"]);
export const MemoryRoleSchema = z.enum([
  "platform_admin",
  "operator",
  "reliability_engineer",
  "curation_manager",
  "oversight_viewer",
  "agent_service_role",
  "client_viewer",
]);
export const SegmentStatusSchema = z.enum(["complete", "partial", "fragmented"]);
export const HealthSeveritySchema = z.enum(["info", "warning", "critical", "sev0"]);
export const QueueStatusSchema = z.enum(["pending", "processing", "done", "failed", "dead_letter"]);
export const RedactionStateSchema = z.enum(["none", "masked", "tokenized", "restricted"]);

export const MemoryErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
]);

export const MemoryErrorResponseSchema = z.object({
  version: z.literal(MemoryApiVersion),
  error: z.object({
    code: MemoryErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.any()).optional(),
  }),
  timestamp: z.string(),
});

export const MemoryHealthSourceSchema = z.object({
  sourceId: z.string(),
  sourceType: z.string(),
  status: z.enum(["online", "degraded", "offline", "unknown"]),
  trustScore: z.number().min(0).max(1),
  completenessScore: z.number().min(0).max(1),
  orderingTrustScore: z.number().min(0).max(1),
  lastCapturedAt: z.string().nullable(),
  staleByMinutes: z.number().int().nonnegative().nullable(),
});

export const MemoryHealthResponseSchema = z.object({
  version: z.literal(MemoryApiVersion),
  generatedAt: z.string(),
  status: z.enum(["ok", "degraded", "offline"]),
  database: z.object({
    configured: z.boolean(),
    reachable: z.boolean(),
    migrationVersion: z.string().nullable(),
  }),
  queue: z.object({
    pending: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    deadLetter: z.number().int().nonnegative(),
    oldestPendingSeconds: z.number().int().nonnegative().nullable(),
  }),
  ingestion: z.object({
    totalSourceRecords: z.number().int().nonnegative(),
    recordsLast24h: z.number().int().nonnegative(),
    integrityWarnings: z.number().int().nonnegative(),
  }),
  sources: z.array(MemoryHealthSourceSchema),
});

export const FacetBucketSchema = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const MemoryFacetsResponseSchema = z.object({
  version: z.literal(MemoryApiVersion),
  generatedAt: z.string(),
  cursor: z.string().nullable(),
  facets: z.object({
    agents: z.array(FacetBucketSchema),
    clients: z.array(FacetBucketSchema),
    projects: z.array(FacetBucketSchema),
    sources: z.array(FacetBucketSchema),
    tags: z.array(FacetBucketSchema),
    memoryTypes: z.array(FacetBucketSchema),
    statuses: z.array(FacetBucketSchema),
    severities: z.array(FacetBucketSchema),
  }),
  filtersSupported: z.array(z.string()),
  enumRegistry: z.object({
    scopeTypes: z.array(ScopeTypeSchema),
    roles: z.array(MemoryRoleSchema),
    segmentStatus: z.array(SegmentStatusSchema),
    queueStatus: z.array(QueueStatusSchema),
    redactionStates: z.array(RedactionStateSchema),
  }),
  sourceCoverage: z.object({
    totalSources: z.number().int().nonnegative(),
    highReliabilitySources: z.number().int().nonnegative(),
    mediumReliabilitySources: z.number().int().nonnegative(),
    lowReliabilitySources: z.number().int().nonnegative(),
    inaccessibleNativeSources: z.number().int().nonnegative(),
  }),
});

export type MemoryErrorResponse = z.infer<typeof MemoryErrorResponseSchema>;
export type MemoryHealthResponse = z.infer<typeof MemoryHealthResponseSchema>;
export type MemoryFacetsResponse = z.infer<typeof MemoryFacetsResponseSchema>;
export type MemoryRole = z.infer<typeof MemoryRoleSchema>;

export const MEMORY_FILTERS_SUPPORTED = [
  "date_from",
  "date_to",
  "agents[]",
  "clients[]",
  "projects[]",
  "sources[]",
  "tags[]",
  "memory_types[]",
  "status[]",
  "severity[]",
  "has_actions",
  "has_decisions",
  "archived",
  "scope",
  "sort",
];

export function buildMemoryError(
  requestId: string,
  code: z.infer<typeof MemoryErrorCodeSchema>,
  message: string,
  details?: Record<string, unknown>
): MemoryErrorResponse {
  return {
    version: MemoryApiVersion,
    error: {
      code,
      message,
      requestId,
      details,
    },
    timestamp: new Date().toISOString(),
  };
}