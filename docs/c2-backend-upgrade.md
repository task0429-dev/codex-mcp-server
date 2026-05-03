# Task Enterprise C2 Backend Upgrade

## Overview

This upgrade adds a production-oriented `c2` backend domain under [`src/c2`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2) and mounts it at `/api/c2/v1`.

It provides:

- MCP and tool orchestration metadata with per-agent allowlists
- Execution lifecycle management with audit-grade status transitions
- Searchable memory and logging with hybrid keyword/semantic scoring
- Monitoring and control endpoints for command-center operations
- Front-end contract documentation and proof endpoints

## Architecture

### Core modules

- [`contracts.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/contracts.ts): shared schemas, enums, and response shapes
- [`store.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/store.ts): persistent JSON/JSONL storage and event stream emitter
- [`memory-service.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/memory-service.ts): long-term event recording, retrieval, and hybrid search
- [`monitoring-service.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/monitoring-service.ts): live service probes, incidents, and operator actions
- [`tool-service.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/tool-service.ts): versioned tool registry and normalized execution contracts
- [`execution-service.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/execution-service.ts): queued/running/completed/failed/canceled execution state handling
- [`agent-service.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/agent-service.ts): unified agent identity, permission, heartbeat, and activity state
- [`api.ts`](/C:/Users/offic/Sync/repos/codex-mcp-server/src/c2/api.ts): mounted API router, SSE stream, frontend contracts, and proof snapshot

### Mounted routes

- `GET /api/c2/v1/overview`
- `GET /api/c2/v1/agents`
- `GET /api/c2/v1/agents/:agentId`
- `POST /api/c2/v1/agents/:agentId/heartbeat`
- `GET /api/c2/v1/tools`
- `GET /api/c2/v1/tools/:toolId`
- `POST /api/c2/v1/executions`
- `GET /api/c2/v1/executions`
- `GET /api/c2/v1/executions/:executionId`
- `POST /api/c2/v1/executions/:executionId/cancel`
- `GET /api/c2/v1/memory/search`
- `GET /api/c2/v1/memory/timeline`
- `GET /api/c2/v1/monitoring/overview`
- `GET /api/c2/v1/monitoring/services`
- `GET /api/c2/v1/monitoring/services/:serviceId`
- `POST /api/c2/v1/monitoring/services/:serviceId/actions`
- `GET /api/c2/v1/contracts/frontend`
- `GET /api/c2/v1/proof`
- `GET /api/c2/v1/events/stream`

## Data flow

1. Agent or operator action enters via `/api/c2/v1`.
2. Execution requests resolve through the tool registry.
3. Every significant state change is written into C2 memory JSONL storage.
4. Monitoring actions and health checks also write traceable memory entries.
5. The existing `/api/command-center` payload now includes `c2Upgrade` proof data for UI surfacing.

## Configuration

Added environment variables in [.env.example](/C:/Users/offic/Sync/repos/codex-mcp-server/.env.example):

- `C2_DATA_DIR`
- `C2_FILESYSTEM_ROOTS`
- `UPTIME_KUMA_URL`
- `UPTIME_KUMA_API_KEY`

## Verification

Build:

```powershell
npm run build:server
```

Run proof script:

```powershell
npm run verify:c2
```

Manual checks:

- `GET /api/c2/v1/proof`
- `GET /api/c2/v1/contracts/frontend`
- `GET /api/c2/v1/overview`
- `GET /api/command-center` and confirm `c2Upgrade.mounted === true`
