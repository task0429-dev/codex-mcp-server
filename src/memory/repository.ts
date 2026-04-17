import { randomUUID } from "crypto";
import {
  MEMORY_FILTERS_SUPPORTED,
  MemoryFacetsResponse,
  MemoryHealthResponse,
  MemoryRoleSchema,
  QueueStatusSchema,
  RedactionStateSchema,
  ScopeTypeSchema,
  SegmentStatusSchema,
} from "./contracts/v1";
import { getMemoryPool } from "./db";
import { DEFAULT_SOURCE_REGISTRY, SourceRegistryEntry } from "./source-registry";
import { logger } from "../core/logger";

interface IngestRecordInput {
  sourceId: string;
  sourceType: string;
  captureMode: string;
  sourceRecordId: string;
  payloadJson: Record<string, unknown>;
  payloadHash: string;
  eventTime: string | null;
  orderingKey: string | null;
  sourceMutability: string;
  sourceTrustScore: number;
  completenessScore: number;
  segmentStatus: "complete" | "partial" | "fragmented";
}

async function withOptionalClient<T>(fn: (client: any) => Promise<T>): Promise<T | null> {
  const pool = getMemoryPool();
  if (!pool) {
    return null;
  }
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

function statusFromStaleMinutes(staleByMinutes: number | null): "online" | "degraded" | "offline" | "unknown" {
  if (staleByMinutes === null) {
    return "unknown";
  }
  if (staleByMinutes <= 10) {
    return "online";
  }
  if (staleByMinutes <= 90) {
    return "degraded";
  }
  return "offline";
}

export class MemoryRepository {
  static async ensureSourceRegistry(): Promise<void> {
    await withOptionalClient(async (client) => {
      for (const source of DEFAULT_SOURCE_REGISTRY) {
        await client.query(
          `insert into sources (
            id, name, source_type, capture_mode, raw_or_mirror, reliability_tier,
            completeness_hint, ordering_trust_hint, source_mutability, inaccessible_native, active
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
          on conflict (id) do update set
            name = excluded.name,
            source_type = excluded.source_type,
            capture_mode = excluded.capture_mode,
            raw_or_mirror = excluded.raw_or_mirror,
            reliability_tier = excluded.reliability_tier,
            completeness_hint = excluded.completeness_hint,
            ordering_trust_hint = excluded.ordering_trust_hint,
            source_mutability = excluded.source_mutability,
            inaccessible_native = excluded.inaccessible_native,
            updated_at = now()`,
          [
            source.id,
            source.name,
            source.sourceType,
            source.captureMode,
            source.rawOrMirror,
            source.reliabilityTier,
            source.completenessHint,
            source.orderingTrustHint,
            source.mutable,
            source.inaccessibleNative,
          ]
        );
      }
    });
  }

  static async appendAuditLog(input: {
    actorId: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    requestId: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await withOptionalClient(async (client) => {
      await client.query(
        `insert into audit_log (
          id, actor_id, actor_role, action, target_type, target_id, reason, request_id, details_json, timestamp
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
        [
          randomUUID(),
          input.actorId,
          input.actorRole,
          input.action,
          input.targetType,
          input.targetId,
          input.reason,
          input.requestId,
          JSON.stringify(input.details || {}),
        ]
      );
    });
  }

  static async insertSourceRecord(input: IngestRecordInput): Promise<void> {
    await withOptionalClient(async (client) => {
      await client.query(
        `insert into source_records (
          id, source_id, source_type, capture_mode, source_record_id,
          captured_at, event_time, ordering_key, source_mutability,
          source_trust_score, completeness_score, segment_status,
          payload_hash, payload_json
        ) values (
          $1,$2,$3,$4,$5,
          now(),$6,$7,$8,
          $9,$10,$11,
          $12,$13
        )
        on conflict (source_id, source_record_id) do update set
          captured_at = excluded.captured_at,
          source_trust_score = excluded.source_trust_score,
          completeness_score = excluded.completeness_score,
          segment_status = excluded.segment_status,
          payload_hash = excluded.payload_hash,
          payload_json = excluded.payload_json`,
        [
          randomUUID(),
          input.sourceId,
          input.sourceType,
          input.captureMode,
          input.sourceRecordId,
          input.eventTime,
          input.orderingKey,
          input.sourceMutability,
          input.sourceTrustScore,
          input.completenessScore,
          input.segmentStatus,
          input.payloadHash,
          JSON.stringify(input.payloadJson),
        ]
      );
    });
  }

  static async getHealth(): Promise<MemoryHealthResponse> {
    const pool = getMemoryPool();
    const generatedAt = new Date().toISOString();

    if (!pool) {
      return {
        version: "v1",
        generatedAt,
        status: "offline",
        database: {
          configured: false,
          reachable: false,
          migrationVersion: null,
        },
        queue: {
          pending: 0,
          processing: 0,
          failed: 0,
          deadLetter: 0,
          oldestPendingSeconds: null,
        },
        ingestion: {
          totalSourceRecords: 0,
          recordsLast24h: 0,
          integrityWarnings: 0,
        },
        sources: DEFAULT_SOURCE_REGISTRY.map((source) => ({
          sourceId: source.id,
          sourceType: source.sourceType,
          status: source.inaccessibleNative ? "unknown" : "offline",
          trustScore: source.completenessHint,
          completenessScore: source.completenessHint,
          orderingTrustScore: source.orderingTrustHint,
          lastCapturedAt: null,
          staleByMinutes: null,
        })),
      };
    }

    try {
      const migrationVersionResult = await pool.query(
        "select version from memory_schema_migrations order by applied_at desc limit 1"
      );
      const queueResult = await pool.query(
        `select status, count(*)::int as count from index_jobs group by status`
      );
      const oldestPendingResult = await pool.query(
        `select extract(epoch from (now() - min(scheduled_at)))::int as oldest_pending_seconds
         from index_jobs where status = 'pending'`
      );
      const ingestionResult = await pool.query(
        `select
          count(*)::int as total,
          count(*) filter (where captured_at >= now() - interval '24 hours')::int as last24h,
          count(*) filter (where segment_status <> 'complete')::int as integrity_warnings
         from source_records`
      );
      const sourcesResult = await pool.query(
        `select
          s.id,
          s.source_type,
          coalesce(max(sr.captured_at), null) as last_captured_at,
          coalesce(avg(sr.source_trust_score), s.completeness_hint)::float8 as trust_score,
          coalesce(avg(sr.completeness_score), s.completeness_hint)::float8 as completeness_score,
          s.ordering_trust_hint::float8 as ordering_trust_score,
          case
            when max(sr.captured_at) is null then null
            else extract(epoch from (now() - max(sr.captured_at))) / 60
          end as stale_minutes
        from sources s
        left join source_records sr on sr.source_id = s.id
        where s.active = true
        group by s.id, s.source_type, s.completeness_hint, s.ordering_trust_hint
        order by s.id asc`
      );

      const queueMap = new Map<string, number>();
      for (const row of queueResult.rows) {
        queueMap.set(String(row.status), Number(row.count));
      }

      const pending = queueMap.get("pending") || 0;
      const processing = queueMap.get("processing") || 0;
      const failed = queueMap.get("failed") || 0;
      const deadLetter = queueMap.get("dead_letter") || 0;

      const status = failed > 0 || deadLetter > 0 ? "degraded" : "ok";

      return {
        version: "v1",
        generatedAt,
        status,
        database: {
          configured: true,
          reachable: true,
          migrationVersion: migrationVersionResult.rows[0]?.version || null,
        },
        queue: {
          pending,
          processing,
          failed,
          deadLetter,
          oldestPendingSeconds: oldestPendingResult.rows[0]?.oldest_pending_seconds || null,
        },
        ingestion: {
          totalSourceRecords: Number(ingestionResult.rows[0]?.total || 0),
          recordsLast24h: Number(ingestionResult.rows[0]?.last24h || 0),
          integrityWarnings: Number(ingestionResult.rows[0]?.integrity_warnings || 0),
        },
        sources: sourcesResult.rows.map((row: any) => {
          const staleByMinutes = row.stale_minutes === null ? null : Math.max(0, Math.round(Number(row.stale_minutes)));
          return {
            sourceId: String(row.id),
            sourceType: String(row.source_type),
            status: statusFromStaleMinutes(staleByMinutes),
            trustScore: Number(row.trust_score || 0),
            completenessScore: Number(row.completeness_score || 0),
            orderingTrustScore: Number(row.ordering_trust_score || 0),
            lastCapturedAt: row.last_captured_at ? new Date(row.last_captured_at).toISOString() : null,
            staleByMinutes,
          };
        }),
      };
    } catch (err: any) {
      logger.warn("memory_health_query_failed", { message: err?.message || String(err) });
      return {
        version: "v1",
        generatedAt,
        status: "degraded",
        database: {
          configured: true,
          reachable: false,
          migrationVersion: null,
        },
        queue: {
          pending: 0,
          processing: 0,
          failed: 0,
          deadLetter: 0,
          oldestPendingSeconds: null,
        },
        ingestion: {
          totalSourceRecords: 0,
          recordsLast24h: 0,
          integrityWarnings: 0,
        },
        sources: [],
      };
    }
  }

  static async getFacets(): Promise<MemoryFacetsResponse> {
    const pool = getMemoryPool();
    const generatedAt = new Date().toISOString();

    if (!pool) {
      return {
        version: "v1",
        generatedAt,
        cursor: null,
        facets: {
          agents: [],
          clients: [],
          projects: [],
          sources: DEFAULT_SOURCE_REGISTRY.map((source) => ({
            id: source.id,
            label: source.name,
            count: 0,
          })),
          tags: [],
          memoryTypes: [],
          statuses: [],
          severities: [],
        },
        filtersSupported: MEMORY_FILTERS_SUPPORTED,
        enumRegistry: {
          scopeTypes: ScopeTypeSchema.options,
          roles: MemoryRoleSchema.options,
          segmentStatus: SegmentStatusSchema.options,
          queueStatus: QueueStatusSchema.options,
          redactionStates: RedactionStateSchema.options,
        },
        sourceCoverage: {
          totalSources: DEFAULT_SOURCE_REGISTRY.length,
          highReliabilitySources: DEFAULT_SOURCE_REGISTRY.filter((source) => source.reliabilityTier === "high").length,
          mediumReliabilitySources: DEFAULT_SOURCE_REGISTRY.filter((source) => source.reliabilityTier === "medium").length,
          lowReliabilitySources: DEFAULT_SOURCE_REGISTRY.filter((source) => source.reliabilityTier === "low").length,
          inaccessibleNativeSources: DEFAULT_SOURCE_REGISTRY.filter((source) => source.inaccessibleNative).length,
        },
      };
    }

    const mapFacetRows = (rows: any[]) => rows.map((row) => ({ id: String(row.id), label: String(row.label), count: Number(row.count) }));

    const [agents, clients, projects, sources, tags, memoryTypes, statuses, severities] = await Promise.all([
      pool.query(`select e.id, e.canonical_name as label, count(*)::int as count from entities e where e.entity_type='agent' group by e.id, e.canonical_name order by count desc, label asc limit 50`).then((res: any) => mapFacetRows(res.rows)).catch(() => []),
      pool.query(`select e.id, e.canonical_name as label, count(*)::int as count from entities e where e.entity_type='client' group by e.id, e.canonical_name order by count desc, label asc limit 50`).then((res: any) => mapFacetRows(res.rows)).catch(() => []),
      pool.query(`select e.id, e.canonical_name as label, count(*)::int as count from entities e where e.entity_type='project' group by e.id, e.canonical_name order by count desc, label asc limit 50`).then((res: any) => mapFacetRows(res.rows)).catch(() => []),
      pool.query(`select s.id, s.name as label, count(sr.id)::int as count from sources s left join source_records sr on sr.source_id = s.id group by s.id, s.name order by count desc, label asc`).then((res: any) => mapFacetRows(res.rows)).catch(() => DEFAULT_SOURCE_REGISTRY.map((source) => ({ id: source.id, label: source.name, count: 0 }))),
      pool.query(`select t.id, t.label, count(tb.id)::int as count from tags t left join tag_bindings tb on tb.tag_id = t.id group by t.id, t.label order by count desc, t.label asc limit 200`).then((res: any) => mapFacetRows(res.rows)).catch(() => []),
      pool.query(`select type as id, type as label, count(*)::int as count from memory_objects group by type order by count desc, type asc`).then((res: any) => mapFacetRows(res.rows)).catch(() => []),
      pool.query(`select status as id, status as label, count(*)::int as count from memory_objects group by status order by count desc, status asc`).then((res: any) => mapFacetRows(res.rows)).catch(() => []),
      pool.query(`select severity as id, severity as label, count(*)::int as count from health_events group by severity order by count desc, severity asc`).then((res: any) => mapFacetRows(res.rows)).catch(() => []),
    ]);

    const sourceEntries = await pool.query(`select reliability_tier, inaccessible_native from sources where active = true`).catch(() => ({ rows: DEFAULT_SOURCE_REGISTRY.map((source) => ({ reliability_tier: source.reliabilityTier, inaccessible_native: source.inaccessibleNative })) } as any));

    return {
      version: "v1",
      generatedAt,
      cursor: null,
      facets: {
        agents,
        clients,
        projects,
        sources,
        tags,
        memoryTypes,
        statuses,
        severities,
      },
      filtersSupported: MEMORY_FILTERS_SUPPORTED,
      enumRegistry: {
        scopeTypes: ScopeTypeSchema.options,
        roles: MemoryRoleSchema.options,
        segmentStatus: SegmentStatusSchema.options,
        queueStatus: QueueStatusSchema.options,
        redactionStates: RedactionStateSchema.options,
      },
      sourceCoverage: {
        totalSources: sourceEntries.rows.length,
        highReliabilitySources: sourceEntries.rows.filter((row: any) => row.reliability_tier === "high").length,
        mediumReliabilitySources: sourceEntries.rows.filter((row: any) => row.reliability_tier === "medium").length,
        lowReliabilitySources: sourceEntries.rows.filter((row: any) => row.reliability_tier === "low").length,
        inaccessibleNativeSources: sourceEntries.rows.filter((row: any) => Boolean(row.inaccessible_native)).length,
      },
    };
  }

  static getSourceById(sourceId: string): SourceRegistryEntry | undefined {
    return DEFAULT_SOURCE_REGISTRY.find((source) => source.id === sourceId);
  }
}

