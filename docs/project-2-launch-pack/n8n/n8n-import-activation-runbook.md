# n8n Import and Activation Runbook

## Objective
Import and activate `Project2 Lead Intake and CRM Sync` in n8n with evidence captured per run.

## Steps
1. Confirm `N8N_BASE_URL` and `N8N_API_KEY` are set in `mcp-server/.env`.
2. Import workflow from `docs/project-2-launch-pack/n8n/project2-lead-intake-workflow.json`.
3. Activate workflow.
4. Verify webhook path `project2/lead-intake` is reachable in n8n.
5. Save evidence file at `data/project-2/evidence/n8n/n8n-activation-check-latest.json`.

## Pass Criteria
- Workflow exists in n8n.
- Workflow is `active: true`.
- Evidence file contains `status: "Pass"`.

## Blocker Handling
- If n8n API cannot be reached, capture the exact error in evidence and escalate to Rex for network/access diagnostics.
