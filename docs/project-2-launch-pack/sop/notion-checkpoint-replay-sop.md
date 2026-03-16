# Notion Checkpoint Replay SOP

## Purpose
Push the latest Project #2 checkpoint payload to Notion HQ when the runtime that produced fallback artifacts had no network access.

## Inputs
- `NOTION_TOKEN` in `.env`
- `PROJECT2_NOTION_CHECKPOINT_PAGE_ID` in `.env` (or cached page id from `data/project-2/notion/checkpoint-target.json`)
- Latest run artifacts in `data/project-2/evidence/latest-status.json`

## Procedure
1. Run `npm run project2:notion:replay` from `mcp-server`.
2. Confirm command returns JSON with `"status":"ok"` and a `page_url`.
3. Verify the checkpoint block is visible in Notion HQ.
4. Re-run `npm run project2:run` so blocker state updates after successful publish.

## Failure Handling
- If replay fails with `fetch failed`, run from a network-enabled environment.
- If replay fails with `object_not_found`, share the target page with the Notion integration and set `PROJECT2_NOTION_CHECKPOINT_PAGE_ID`.
- If replay fails with `unauthorized`, rotate `NOTION_TOKEN` and retry.
