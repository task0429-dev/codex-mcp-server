# Project #2 Launch Pack

This package contains launch-ready deliverables for Task Enterprise Project #2.

## Scope
- Landing page conversion package (copy, CTA map, field schema)
- n8n workflow import JSON
- CRM sync contract + field map
- Outreach sequence templates and cadence
- KPI baseline and drift alert logic
- SOP compliance and handoff checklist

## Run Cadence
- Every run writes a summary to `data/project-2/runs/`.
- Every run refreshes `data/project-2/drive-artifacts/manifest.json` for Drive upload/sync.
- Every run refreshes blocker artifacts in `data/project-2/blockers/`.
- Every run should post a concise checkpoint to Notion Project #2 HQ.

## Launch Gates
1. n8n workflow imports and activates successfully.
2. CRM sync dry-run passes with zero unmapped required fields.
3. Outreach sequence can be triggered from CRM stage transitions.
4. KPI board receives daily data and drift alerts trigger by threshold.
5. SOP owner/status/next-action fields are present for all open blockers.

Landing page package is treated as a completed prerequisite deliverable and remains included in this launch pack.
