# Rex Heartbeat Mapping

This mapping defines what each push monitor represents and when it is stale.

Stale threshold formula:
- `stale_after = expected_interval * tolerance_missed_cycles`

| Monitor | Source job/workflow | Expected interval | Tolerance cycles | Stale after | Stale meaning |
|---|---|---:|---:|---:|---|
| HEARTBEAT - Rex Agent Loop | Primary Rex loop process | 60s | 3 | 180s | Control loop likely stalled or dead. |
| HEARTBEAT - Project2 Strike Run | `scripts/project2_strike_run.mjs` | 3600s | 2 | 7200s | Strike workflow stopped executing on schedule. |
| HEARTBEAT - Project2 Launch Verify | `scripts/project2_launch_gate_verify.mjs` | 21600s | 2 | 43200s | Launch verification no longer checking in. |
| HEARTBEAT - Project2 Notion Replay | `scripts/project2_notion_checkpoint_replay.mjs` | 21600s | 2 | 43200s | Notion replay queue may be stale. |
| HEARTBEAT - Nightly Backup Job | Nightly backup script (Windows/WSL) | 86400s | 2 | 172800s | Backups likely not running or not reporting completion. |

## Wiring patterns
- One-shot scripts: send `start` before run, `success` on zero exit, `fail` on non-zero exit.
- Long-running loops: send periodic `success` heartbeat each cycle.
- Workflow systems (n8n): add HTTP request node to push URL on successful completion and on failure branch.

## Implementation paths
- Node client: `scripts/heartbeat/heartbeat-client.mjs`
- PowerShell wrapper: `scripts/heartbeat/send-heartbeat.ps1`
- Bash wrapper: `scripts/heartbeat/send-heartbeat.sh`
- Command wrapper: `scripts/heartbeat/run-with-heartbeat.mjs`

## Runtime push URLs
After running provisioning in apply mode:
- generated file: `monitoring/rex-heartbeat-map.generated.json`
