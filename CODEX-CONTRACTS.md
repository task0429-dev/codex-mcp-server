# C2 API Contracts — Codex Handoff
**Task Enterprise LLC · C2 Upgrade v3**

Claude owns: frontend, all UI files in `control-ui-src/`
Codex owns: backend, all files in `src/`

---

## Required: Unified C2 Endpoint

The new UI makes a **single fetch** to hydrate the entire C2 surface.

```
GET /api/c2/v1/unified
```

Response shape:
```ts
{
  proof: C2ProofSnapshot,        // existing /api/c2/v1/proof
  overview: C2Overview,          // existing /api/c2/v1/overview
  agents: AgentRecord[],         // existing /api/c2/v1/agents
  tools: ToolMetadata[],         // existing /api/c2/v1/tools
  executions: ExecutionRecord[], // existing /api/c2/v1/executions
  memory: MemorySearchResult,    // existing /api/c2/v1/memory/search?limit=8
  monitoring: MonitoringOverview // existing /api/c2/v1/monitoring/overview
}
```

This eliminates 7 parallel fetches → 1 call, reduces load time, simplifies error handling.

---

## Required: Rex Diagnostic Endpoint

Rex Command Zone is now embedded inside C2 (same container). It needs live data.

```
GET /api/c2/v1/rex/diagnostics
```

Response:
```ts
{
  heartbeatJobs: HeartbeatJob[],    // same shape as data-monitoring.ts HEARTBEAT_JOBS
  connections: Connection[],         // same shape as data-monitoring.ts CONNECTIONS
  alerts: Alert[],                   // active alerts
  incidentCount: number,
  lastAuditAt: string | null
}
```

```
POST /api/c2/v1/rex/chat
Body: { message: string, context: string }
Response: { reply: string }
```

Currently Rex responses are generated client-side in `generateRexResponse()`. 
Wire this to an actual agent call (Rex / RBAC: rex agent) when ready.
Frontend will fall back to local generation if endpoint 404s.

```
POST /api/c2/v1/rex/audit
Response: { ok: boolean, summary: string, jobsChecked: number }
```

---

## Required: SSE Stream (already exists — keep as-is)

```
GET /api/c2/v1/events/stream
```

No changes needed. Frontend subscribes once on mount.

---

## Existing Endpoints (no changes needed)

```
GET  /api/c2/v1/proof
GET  /api/c2/v1/overview
GET  /api/c2/v1/agents
GET  /api/c2/v1/tools
GET  /api/c2/v1/executions
GET  /api/c2/v1/memory/search?q=&agentId=&severity=&limit=
GET  /api/c2/v1/monitoring/overview
POST /api/c2/v1/agents/:id/restart
POST /api/c2/v1/monitoring/action
```

Frontend will call `/api/c2/v1/unified` on mount and fall back to individual endpoints if 404.

---

## Docker — Single Container Confirmed

`docker-compose.yml` already has one service: `mcp-server`.
Rex monitoring (Uptime Kuma) runs on port 3011 — keep as-is, the new UI embeds it via iframe in the Monitor tab.

Enable Redis for session state — uncomment in `docker-compose.yml`:
```yaml
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
```

---

## Agent RBAC for Rex Chat

When implementing `/api/c2/v1/rex/chat`, route through Rex agent with:
- `agentId: "rex"`
- `integration: "monitoring"` 
- `level: "read"`

Ref: `src/policies/` for RBAC enforcement.
