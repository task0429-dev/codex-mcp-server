# CRM 100-Record Dry-Run SOP

## Objective
Execute and prove a 100-record dry-run against the CRM sync endpoint with zero required-field mapping failures.

## Inputs
- `CRM_SYNC_ENDPOINT`
- `CRM_SYNC_BEARER_TOKEN`
- Config template: `docs/project-2-launch-pack/crm-sync/crm-live-config.template.env`
- Contract: `docs/project-2-launch-pack/crm-sync/crm-sync-contract.md`

## Execution
1. Populate CRM endpoint/token in `.env` using the config template.
2. Run `npm run project2:run` from `mcp-server`.
3. Confirm launch report and blocker register show CRM gate as passed.
4. Record request status, response body summary, and pass/fail result.
5. Save evidence in:
   - `data/project-2/evidence/crm-sync/crm-dry-run-latest.json`
   - optional payload snapshot: `data/project-2/evidence/crm-sync/crm-dry-run-payload-*.json`

## Pass Criteria
- HTTP 2xx response.
- `record_count >= 100`.
- `dry_run_passed = true`.

## Failure Routing
- Owner: Ayub
- Escalation: Abdi decision desk if unresolved > 30 minutes.
