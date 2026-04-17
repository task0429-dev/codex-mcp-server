# C2 Memory System Backend v1 Baseline

Implemented baseline aligned to spec v2 milestone: **Contract + Governance + Source Registry**.

## Implemented
- Versioned memory API contracts in `src/memory/contracts/v1.ts`.
- Source registry and trust/completeness metadata in `src/memory/source-registry.ts`.
- Access policy parsing and role checks in `src/memory/access-policy.ts`.
- Postgres-backed repository + ingestion/audit pipeline in `src/memory/repository.ts` and `src/memory/ingestion-service.ts`.
- New API endpoints:
  - `GET /api/memory/v1/health`
  - `GET /api/memory/v1/facets`
- Live capture hooks for:
  - Mission control actions
  - Voice chat endpoint
  - Messages chat endpoint
  - MCP tool calls (HTTP + stdio)
- SQL migration baseline in `db/migrations/0001_memory_baseline.sql`.
- Contract package + fixtures in `memory-contracts/v1/`.

## New scripts
- `npm run memory:migrate`
- `npm run memory:contracts:check`

## Notes
- If `DATABASE_URL` is not configured, health/facets still return valid `v1` contract payloads in fallback mode.
- Migrations must be applied before full DB-backed metrics/facets are available.
