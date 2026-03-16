# Landing Page Conversion Package

## Offer Positioning
- Audience: SMB owners needing automation-led client acquisition.
- Primary value: "Deploy a working acquisition engine in days, not months."
- Proof angle: production tooling + measurable KPI dashboard + SOP execution.

## CTA Map
| Placement | CTA | Intent | Event Name |
|---|---|---|---|
| Hero | Build My Acquisition Engine | Primary conversion | cta_primary_click |
| Problem/Solution | See System Blueprint | Mid-funnel education | cta_blueprint_click |
| Social Proof | Book Strategy Call | Sales handoff | cta_book_call_click |
| Footer | Get Launch Checklist | Lead magnet | cta_checklist_click |

## Required Lead Form Fields
| Field | Key | Type | Required | Validation |
|---|---|---|---|---|
| Full Name | full_name | text | yes | min 2 chars |
| Work Email | email | email | yes | RFC5322 |
| Company | company | text | yes | min 2 chars |
| Team Size | team_size | select | yes | 1-10,11-50,51-200,200+ |
| Monthly Lead Goal | monthly_lead_goal | number | yes | >= 10 |
| CRM In Use | crm_in_use | select | no | none,hubspot,salesforce,pipedrive,other |
| Consent | consent_marketing | checkbox | yes | must be true |

## Handoff Payload Contract
- Trigger: any CTA submit endpoint `/api/project2/lead-capture`
- Destination: n8n webhook `POST /webhook/project2/lead-intake`
- Content type: `application/json`
- Auth: `X-Task-Signature` HMAC SHA-256
