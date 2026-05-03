# Claude Front-End Handoff

## Build target

Build the premium Task Enterprise command-center UI against the live upgraded backend at `/api/c2/v1` and the existing `/api/command-center` payload.

Use the backend as the source of truth. Avoid demo-only data once these routes are available.

## Implementation order

1. Add a visible backend-live indicator using `GET /api/c2/v1/proof`.
2. Rebuild Logs into a memory center using `GET /api/c2/v1/memory/search` and `GET /api/c2/v1/memory/timeline`.
3. Build tools and executions surfaces from `GET /api/c2/v1/tools`, `GET /api/c2/v1/executions`, and `POST /api/c2/v1/executions`.
4. Build agents roster and detail views from `GET /api/c2/v1/agents`.
5. Build Rex monitoring zone from `GET /api/c2/v1/monitoring/overview` and service detail routes.
6. Subscribe to `GET /api/c2/v1/events/stream` for live memory/trace updates or poll every 10-15 seconds if SSE is not used.

## Exact routes

- `GET /api/c2/v1/proof`
- `GET /api/c2/v1/overview`
- `GET /api/c2/v1/contracts/frontend`
- `GET /api/c2/v1/agents`
- `GET /api/c2/v1/agents/:agentId`
- `POST /api/c2/v1/agents/:agentId/heartbeat`
- `GET /api/c2/v1/tools`
- `GET /api/c2/v1/tools/:toolId`
- `GET /api/c2/v1/executions`
- `GET /api/c2/v1/executions/:executionId`
- `POST /api/c2/v1/executions`
- `POST /api/c2/v1/executions/:executionId/cancel`
- `GET /api/c2/v1/memory/search`
- `GET /api/c2/v1/memory/timeline`
- `GET /api/c2/v1/monitoring/overview`
- `GET /api/c2/v1/monitoring/services`
- `GET /api/c2/v1/monitoring/services/:serviceId`
- `POST /api/c2/v1/monitoring/services/:serviceId/actions`
- `GET /api/c2/v1/events/stream`

## Key models

### Proof

- `mounted: boolean`
- `version: string`
- `routes: string[]`
- `counts.agents: number`
- `counts.tools: number`
- `counts.executions: number`
- `counts.memoryRecords: number`
- `recentHeartbeatAt: string | null`
- `latestExecutionAt: string | null`
- `latestMemoryAt: string | null`

### Agent

- `id`
- `name`
- `role`
- `description`
- `permissions[]`
- `toolAccess[]`
- `memoryScope[]`
- `status`
- `heartbeatAt`
- `activeSessionCount`
- `lastActivityAt`

### Tool

- `id`
- `displayName`
- `description`
- `category`
- `inputSchema`
- `outputSchema`
- `authRequired`
- `rateLimitPerMinute`
- `executionMode`
- `allowedAgents[]`
- `auditEnabled`
- `version`
- `destructive`

### Execution

- `id`
- `toolId`
- `toolName`
- `agentId`
- `intent`
- `priority`
- `status`
- `payload`
- `result`
- `error`
- `failureClass`
- `createdAt`
- `startedAt`
- `completedAt`
- `canceledAt`

### Memory result

- `id`
- `timestamp`
- `source`
- `kind`
- `severity`
- `summary`
- `detail`
- `agentId`
- `projectId`
- `tags[]`
- `correlationId`
- `metadata`
- `relevance`
- `exactMatches`
- `semanticScore`

### Monitoring service

- `id`
- `name`
- `category`
- `status`
- `target`
- `lastCheckedAt`
- `responseTimeMs`
- `detail`
- `actions[]`
- `incidentCount`

## Page requirements

### Dashboard

- Read `GET /api/c2/v1/overview`.
- Show proof chip, route count, tool count, execution count, and most recent heartbeat.
- Surface degraded/offline services prominently.

### Logs to Memory Center

- Default to hybrid search.
- Filters: agent, source, severity, project, tag, date window.
- States:
  - Loading: skeleton timeline
  - Empty: “No memory matched this query”
  - Error: inline error panel with retry
- Support grouped traces by `correlationId`.

### Tools and Executions

- Show live registry, allowed agents, destructive badge, and schema preview.
- Execution drawer should post to `POST /api/c2/v1/executions`.
- Show state transitions using execution status enum.

### Agents

- Roster view with heartbeat age, session count, and last activity.
- Detail view grouped by permissions, tools, and memory scope.

### Monitoring / Rex Zone

- Health overview cards from `/monitoring/overview`.
- Service detail panel from `/monitoring/services/:id`.
- Action buttons for `diagnose` and `restart` where available.

## Verification in UI

Add visible live proof using:

- `proof.version`
- `proof.counts.tools`
- `proof.counts.executions`
- `proof.latestMemoryAt`
- real monitoring status from `/monitoring/overview`
- real agent heartbeat timestamps from `/agents`

If the backend is live, the interface should visibly show current timestamps and counts rather than static placeholders.
