/* ============================================================
   Memory Console — API Adapter Layer
   Task Enterprise LLC · 2026

   Live endpoints:
     GET /api/memory/v1/health  → MemoryHealth
     GET /api/memory/v1/facets  → MemoryFacets

   Ready-to-wire stubs (return SERVICE_UNAVAILABLE until backend ships):
     POST /api/memory/search
     GET  /api/memory/threads/:id
     GET  /api/memory/objects/:id
     GET  /api/memory/jobs
   ============================================================ */

/* ─── Shared ─── */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export interface FacetBucket {
  id: string;
  label: string;
  count: number;
}

/* ─── Health ─── */

export interface MemoryHealthSource {
  sourceId: string;
  sourceType: string;
  status: "online" | "degraded" | "offline" | "unknown";
  trustScore: number;
  completenessScore: number;
  orderingTrustScore: number;
  lastCapturedAt: string | null;
  staleByMinutes: number | null;
}

export interface MemoryHealth {
  version: "v1";
  generatedAt: string;
  status: "ok" | "degraded" | "offline";
  database: {
    configured: boolean;
    reachable: boolean;
    migrationVersion: string | null;
  };
  queue: {
    pending: number;
    processing: number;
    failed: number;
    deadLetter: number;
    oldestPendingSeconds: number | null;
  };
  ingestion: {
    totalSourceRecords: number;
    recordsLast24h: number;
    integrityWarnings: number;
  };
  sources: MemoryHealthSource[];
}

/* ─── Facets ─── */

export interface MemoryFacets {
  version: "v1";
  generatedAt: string;
  cursor: string | null;
  facets: {
    agents: FacetBucket[];
    clients: FacetBucket[];
    projects: FacetBucket[];
    sources: FacetBucket[];
    tags: FacetBucket[];
    memoryTypes: FacetBucket[];
    statuses: FacetBucket[];
    severities: FacetBucket[];
  };
  filtersSupported: string[];
  enumRegistry: {
    scopeTypes: string[];
    roles: string[];
    segmentStatus: string[];
    queueStatus: string[];
    redactionStates: string[];
  };
  sourceCoverage: {
    totalSources: number;
    highReliabilitySources: number;
    mediumReliabilitySources: number;
    lowReliabilitySources: number;
    inaccessibleNativeSources: number;
  };
}

/* ─── Future: Search ─── */

export interface MemorySearchParams {
  query?: string;
  agents?: string[];
  clients?: string[];
  projects?: string[];
  sources?: string[];
  tags?: string[];
  memory_types?: string[];
  status?: string[];
  severity?: string[];
  date_from?: string;
  date_to?: string;
  has_actions?: boolean;
  has_decisions?: boolean;
  archived?: boolean;
  scope?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface MemorySearchResult {
  id: string;
  type: string;
  summary: string;
  agent?: string;
  client?: string;
  project?: string;
  source?: string;
  tags?: string[];
  status?: string;
  severity?: string;
  confidence?: number;
  createdAt: string;
  updatedAt?: string;
  hasDecisions?: boolean;
  hasActions?: boolean;
  threadId?: string;
  sourceCount?: number;
}

export interface MemorySearchResponse {
  version: "v1";
  query: string;
  results: MemorySearchResult[];
  cursor: string | null;
  total: number | null;
  partialData: boolean;
}

/* ─── Future: Thread ─── */

export interface MemoryMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  agent?: string;
  eventType?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryObject {
  id: string;
  type: string;
  summary: string;
  body?: string;
  agent?: string;
  client?: string;
  project?: string;
  source?: string;
  confidence?: number;
  status?: string;
  tags?: string[];
  linkedThreadIds?: string[];
  lineage?: Array<{ sourceId: string; recordId: string; capturedAt: string }>;
  createdAt: string;
  updatedAt?: string;
}

export interface MemoryThread {
  id: string;
  summary?: string;
  agent?: string;
  client?: string;
  project?: string;
  source?: string;
  startedAt: string;
  endedAt?: string;
  messages: MemoryMessage[];
  extractedMemory?: MemoryObject[];
  status?: string;
  tags?: string[];
}

/* ─── Fetchers ─── */

async function safeFetch<T>(url: string): Promise<ApiResult<T>> {
  try {
    const r = await fetch(url);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      const code = body?.error?.code ?? (r.status === 403 ? "FORBIDDEN" : r.status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR");
      return { ok: false, error: body?.error?.message ?? `HTTP ${r.status}`, code };
    }
    return { ok: true, data: body as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

export function fetchMemoryHealth(): Promise<ApiResult<MemoryHealth>> {
  return safeFetch<MemoryHealth>("/api/memory/v1/health");
}

export function fetchMemoryFacets(): Promise<ApiResult<MemoryFacets>> {
  return safeFetch<MemoryFacets>("/api/memory/v1/facets");
}

/* ─── Ready-to-wire stubs ─── */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchMemory(_p: MemorySearchParams): Promise<ApiResult<MemorySearchResponse>> {
  return { ok: false, error: "Search endpoint not yet available", code: "SERVICE_UNAVAILABLE" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchThread(_id: string): Promise<ApiResult<MemoryThread>> {
  return { ok: false, error: "Thread endpoint not yet available", code: "SERVICE_UNAVAILABLE" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchMemoryObject(_id: string): Promise<ApiResult<MemoryObject>> {
  return { ok: false, error: "Objects endpoint not yet available", code: "SERVICE_UNAVAILABLE" };
}
