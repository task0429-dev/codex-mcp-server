# SOP Cadence and Handoff Compliance

## Daily Cadence
1. 08:00 - blocker triage and owner assignment.
2. 12:00 - integration checkpoint (landing > n8n > CRM).
3. 16:00 - KPI drift review.
4. 20:00 - launch gate review and next-action lock.

## Handoff Record Requirements
Each open item must include:
- Owner
- Status (`Not Started`, `In Progress`, `Blocked`, `Done`)
- Next action
- Due timestamp

## Blocker Rule
- Any blocker unresolved for >30 minutes is escalated to Decision Desk.
- Escalation record must include failure point, current owner, and unblock request.

## Launch Readiness Checklist
- [ ] Landing schema and CTA map approved.
- [ ] n8n workflow imported and active.
- [ ] CRM sync dry run succeeded.
- [ ] Outreach sequences connected to CRM stage transitions.
- [ ] KPI board receiving daily data.
- [ ] SOP handoff fields complete for all active tasks.
