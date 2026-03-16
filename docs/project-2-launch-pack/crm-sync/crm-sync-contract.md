# CRM Sync Contract

## Objective
Ensure every captured lead is upserted into CRM with deterministic field mapping and idempotency.

## Endpoint Contract
- Method: `POST`
- Endpoint: `${CRM_SYNC_ENDPOINT}`
- Auth: `Authorization: Bearer ${CRM_SYNC_BEARER_TOKEN}`
- Idempotency key: `external_lead_id`

## Required Fields
| Payload Field | CRM Field | Type | Required |
|---|---|---|---|
| external_lead_id | external_lead_id | string | yes |
| full_name | contact.name | string | yes |
| email | contact.email | string | yes |
| company | account.name | string | yes |
| team_size | lead.team_size | enum | yes |
| monthly_lead_goal | lead.monthly_goal | integer | yes |
| crm_in_use | lead.current_crm | string | no |
| source | lead.source | string | yes |
| cta_id | lead.cta_id | string | yes |

## Sync Rules
- Upsert by email + external_lead_id.
- Reject if required fields missing.
- Return `200` on upsert, `409` on duplicate conflict, `422` on schema error.
- Emit sync status to KPI stream (`lead_sync_status`).

## Failure Handling
- n8n retry: 3 attempts with exponential backoff.
- After retries fail, push payload to DLQ and create blocker ticket with owner.
