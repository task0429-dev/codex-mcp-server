# memory-contracts v1

Canonical backend contract schemas live in:
- `src/memory/contracts/v1.ts`

This package stores semver and fixture payloads for frontend and CI contract checks.

## Included fixtures
- `fixtures/health.ok.json`
- `fixtures/facets.ok.json`
- `fixtures/error.forbidden.json`

## Validation
Run:

```bash
npm run memory:contracts:check
```
