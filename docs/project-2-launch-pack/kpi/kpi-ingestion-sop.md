# KPI Ingestion and Drift Alert SOP

## Objective
Validate daily KPI ingestion and first drift alert delivery for Project #2 launch gate.

## Required Evidence
- `data/project-2/evidence/kpi/kpi-ingestion-check-latest.json`

## Process
1. Confirm daily feed source and ingestion timestamp.
2. Validate baseline metrics are updated:
   - lead_volume
   - response_rate
   - meeting_rate
   - stage_conversion_rate
3. Trigger one controlled drift condition crossing threshold.
4. Confirm alert delivery channel receives event and timestamp.
5. Save `feed_ok`, `drift_alert_tested`, and source metadata in the evidence file.

## Pass Criteria
- `feed_ok = true`
- `drift_alert_tested = true`

## Owner
Prime
