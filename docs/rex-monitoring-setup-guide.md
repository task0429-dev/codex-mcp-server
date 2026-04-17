# Rex Monitoring Setup Guide

## 1. Inventory is source of truth
All monitors must be defined in:
- `monitoring/rex-monitor-inventory.json`

Do not hand-manage monitors in Kuma as a long-term practice.

## 2. Configure provisioning credentials
1. Copy env template:
   - `monitoring/rex-monitor-provision.env.example` -> `monitoring/rex-monitor-provision.env`
2. Fill Kuma credentials and (optionally) P0/P1 notification IDs.

## 3. Validate inventory and plan
Run dry-run:
```bash
node monitoring/rex-monitor-provision.mjs --dry-run
```

## 4. Apply to Uptime Kuma
```bash
node monitoring/rex-monitor-provision.mjs --env-file monitoring/rex-monitor-provision.env
```

Provisioning behavior:
- Creates group monitors (`GROUP - <group>`)
- Creates/updates monitors from inventory by `name`
- Syncs tags
- Applies notifications only for P0/P1 (if IDs are configured)
- Exports push monitor mapping to `monitoring/rex-heartbeat-map.generated.json`

## 5. Heartbeat onboarding
Core scripts:
- `scripts/heartbeat/heartbeat-client.mjs`
- `scripts/heartbeat/send-heartbeat.ps1`
- `scripts/heartbeat/send-heartbeat.sh`
- `scripts/heartbeat/run-with-heartbeat.mjs`

Example (Node wrapper around project2 run):
```bash
node scripts/heartbeat/run-with-heartbeat.mjs \
  --url "http://localhost:3011/api/push/<token>" \
  --start_msg "project2-run-start" \
  --success_msg "project2-run-ok" \
  --fail_msg "project2-run-failed" \
  -- node scripts/project2_strike_run.mjs
```

PowerShell heartbeat ping:
```powershell
pwsh -File scripts/heartbeat/send-heartbeat.ps1 -Mode success -Url "http://localhost:3011/api/push/<token>" -Msg "nightly-backup-ok"
```

Bash heartbeat ping:
```bash
bash scripts/heartbeat/send-heartbeat.sh success --url "http://localhost:3011/api/push/<token>" --msg "agent-loop-ok"
```

## 6. Health endpoint checks
- Liveness: `/health`
- Readiness: `/ready`

Example:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

## 7. Add a new service (required flow)
1. Add entry to `monitoring/rex-monitor-inventory.json`.
2. Assign group, priority, tags, and monitor type.
3. If job/agent-based, set `type=push`, `heartbeat=true`, `expected_interval`, and `tolerance_missed_cycles`.
4. Re-run provisioning.
5. Validate monitor state in Kuma dashboard.

## 8. Maintenance checklist
- Re-run provision after any service change.
- Review P3 entries monthly and promote/archive as needed.
- Keep P0/P1 notification IDs current.
- Audit stale heartbeat jobs weekly.
