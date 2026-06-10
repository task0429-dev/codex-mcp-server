# LLM World Tab on cc.taskenterprise.tech — Design Spec

## Goal

Add the "LLM World" tab to the navigation on `cc.taskenterprise.tech`, positioned between "C2" and "Monitoring", with the full LLM World feature: stats grid, sector world-map, search/filter/sort explorer, detail drawer (live README/files/manifests/env vars/framework detection), Open folder/Open README actions, derived readiness engine, and backend routes `/api/awesome-llm-apps`, `/api/awesome-llm-apps/:id`, `/api/awesome-llm-apps/open`.

This is a "full feature port" (per TASK's prior decision), not a placeholder tab.

## Background / Investigation Findings

- `cc.taskenterprise.tech` → Caddy (`task-command-center-caddy`, basic-auth gated unless `c2_trusted_device` cookie is present) → `task-command-center` container → serves `/opt/task-command-center/mcp-server/{control-ui,dist}` via bind mounts.
- That deployment has **no `.git`, no `src/`** — it's compiled-artifacts-only and has been hand-patched in place for months (many `.backup-*` files, March–May 2026).
- **Source-of-truth identified**: `development/repos/codex-mcp-server` (GitHub remote `task0429-dev/codex-mcp-server`, HEAD `621587f` 2026-05-31). Its `control-ui-src/types.ts` `NAV_ITEMS` array and `top-nav.tsx` `PINNED` array are **verbatim identical** (including comments) to `prod_app.js:21742-21765` and `:46782`. This confirms `codex-mcp-server` is the codebase prod was built from.
- Prod's bundle is **not minified** (47,898 lines, readable identifiers) even though `codex-mcp-server/scripts/build-control-ui.mjs` always sets `minify: true`. This was almost certainly toggled off during a past hand-patch session to make manual editing of the live bundle easier, and never reverted.
- The fully-built LLM World feature already exists and is verified working in the **local sibling repo `codex-mcp-server-push-worktree`** (built locally, deployed to the local `task-agent-fabric-c2` Docker container on port 3399, hash-verified). This is the porting source.
- The LLM World catalog data lives at `development/Awesome-LLM-Apps` (note capitalization) on this Windows machine, mounted into the local container via `docker-compose.agent-fabric.yml`:
  ```yaml
  environment:
    AWESOME_LLM_APPS_ROOT: /awesome-llm-apps
  volumes:
    - ../../awesome-llm-apps:/awesome-llm-apps:ro
  ```
- `src/core/awesome-llm-apps-world.ts` reads `process.env.AWESOME_LLM_APPS_ROOT`, defaulting to `<WORKSPACE_ROOT>/awesome-llm-apps` if unset, and references `https://github.com/Shubhamsaboo/awesome-llm-apps.git` as the canonical catalog source.

## Approach

1. **Port LLM World source files** from `codex-mcp-server-push-worktree` into `codex-mcp-server`:
   - New files: `control-ui-src/pages-llm-world.tsx`, `control-ui-src/llm-world-drawer.tsx`, `control-ui-src/llm-world-explorer.tsx`, `control-ui-src/llm-world-sectors.tsx`, `control-ui-src/llm-world-components.tsx`, `src/core/awesome-llm-apps-world.ts`.
   - Modified files: `control-ui-src/types.ts` (add `"llm-world"` to `PageKey` + NAV_ITEMS entry `{key:"llm-world", route:"/llm-world", label:"LLM World", section:""}` placed between `c2` and `monitoring` entries), `control-ui-src/top-nav.tsx` (PINNED → `[..., 'c2', 'llm-world', 'monitoring']`), `control-ui-src/App.tsx`/`shell.tsx` (route registration, mirroring worktree), `src/core/command-center.ts` and `src/core/http.ts` (register the 3 `/api/awesome-llm-apps*` routes, mirroring worktree).
   - Carry over `control-ui-src/styles.css` additions for LLM World (sector map, drawer, explorer styles) into `codex-mcp-server`'s `styles.css`.

2. **Adapt Open folder / Open README for prod**: per TASK's decision, the detail drawer renders README content inline (already part of the design) for all environments. The "Open folder" button is hidden when running on the VPS — gate via a new env var (e.g. `LLM_WORLD_LOCAL_OPEN=true`, set only in the local `.env`/compose, absent in prod). When unset/false, the "Open folder" button is not rendered; "Open README" (inline view) always works since it doesn't touch the host filesystem outside the mounted catalog.

3. **Catalog data on the VPS**: clone `https://github.com/Shubhamsaboo/awesome-llm-apps.git` to a directory on the VPS (e.g. `/opt/awesome-llm-apps`), and set `AWESOME_LLM_APPS_ROOT=/opt/awesome-llm-apps` (or bind-mount to `/awesome-llm-apps` to match the existing default, whichever requires fewer container changes — confirmed at implementation time by inspecting `task-command-center`'s actual compose/run config) for the `task-command-center` container. Read-only mount.

4. **Build with prod-matching format**: build `codex-mcp-server`'s `control-ui` with `minify: false` (temporary override, e.g. `MINIFY=false node scripts/build-control-ui.mjs` — add an env-var-controlled minify toggle to the build script) so the output diffs cleanly against `prod_app.js`.

5. **Pre-deploy diff & backup**:
   - On the VPS, tarball `/opt/task-command-center/mcp-server/control-ui` and `dist/` to a timestamped backup before any changes (e.g. `/root/backups/task-command-center-pre-llm-world-<timestamp>.tar.gz`).
   - Diff the newly-built (non-minified) `app.js` against the current `prod_app.js`. Beyond the expected LLM World additions (new nav entry, new page module, new route handlers), flag any other differing regions — these represent prod-only hand-patches not present in `codex-mcp-server`. Present this diff summary to TASK before proceeding. If unexpected divergence is found, pause for a decision on whether to port those patches into `codex-mcp-server` first.

6. **Deploy**:
   - Copy the new `control-ui/assets/{app.js,app.css}` and the new/changed `dist/` backend files (compiled `awesome-llm-apps-world.js`, updated `command-center.js`/`http.js`) into `/opt/task-command-center/mcp-server/`.
   - Restart the `task-command-center` container to pick up the new `dist/` files (bind-mounted, so a restart is sufficient — no rebuild needed).

7. **Verification (GO LOCK)**:
   - Local: build, verify nav order and page render against the local `task-agent-fabric-c2` container.
   - Prod: after deploy, verify via the authenticated session (with `c2_trusted_device` cookie) that `cc.taskenterprise.tech` shows "LLM World" between "C2" and "Monitoring", the page loads the stats grid/world-map/explorer, the detail drawer shows README/files/manifest/env-vars/framework info, "Open folder" is correctly absent, `/api/awesome-llm-apps*` endpoints respond with real data from the VPS catalog clone, and no other tab/page regressed (spot-check Home, C2, Monitoring, Visionary).
   - Restore from the pre-deploy backup if anything is broken and not fixable quickly.

## Out of Scope

- Re-minifying prod's bundle (left as-is, non-minified, consistent with its current state).
- Reconciling the broader divergence between `codex-mcp-server`'s git history and prod's hand-patches, except where the pre-deploy diff (step 5) surfaces conflicts directly relevant to this change.
- Changes to `codex-mcp-server-push-worktree` or the local `task-agent-fabric-c2` container (already done/verified in a prior session).
