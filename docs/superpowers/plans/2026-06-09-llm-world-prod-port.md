# LLM World Tab on cc.taskenterprise.tech — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully working "LLM World" tab (stats grid, sector world-map, search/filter/sort explorer, detail drawer, derived readiness, backend `/api/awesome-llm-apps*` routes) to `cc.taskenterprise.tech`'s nav, positioned between "C2" and "Monitoring", built from `codex-mcp-server` (the verified prod source-of-truth) and deployed to the VPS.

**Architecture:** `codex-mcp-server/control-ui-src` gains a new page module (`pages-llm-world.tsx`) plus 5 sub-component files (types/components/sectors/explorer/drawer) ported from `codex-mcp-server-push-worktree`, wired into `types.ts`/`App.tsx`/`styles.css`. The backend gains `src/core/awesome-llm-apps-world.ts` plus 3 routes in `src/core/http.ts`. A new `LLM_WORLD_LOCAL_OPEN` env flag (default off) gates the filesystem "Open folder"/"Open README" actions — off on the VPS (README is shown inline regardless), on for local dev. The control-ui is built twice: once minified (for normal use) and once with `MINIFY=false` (to diff cleanly against prod's unminified bundle before deploying).

**Tech Stack:** TypeScript, React (JSX automatic runtime), esbuild, Express, Node `fs`/`child_process`, Caddy/Docker on the VPS.

---

## Task 1: Restore build tooling in `codex-mcp-server` and add MINIFY toggle

**Files:**
- Restore: `package.json`, `package-lock.json` (tracked at HEAD, deleted in working tree)
- Modify: `scripts/build-control-ui.mjs:24`

- [ ] **Step 1: Restore the deleted-but-tracked build files**

```powershell
cd "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server"
git checkout HEAD -- package.json package-lock.json
```

Expected: `git status --porcelain` no longer lists `package.json`/`package-lock.json` as deleted (` D`).

- [ ] **Step 2: Install dependencies**

```powershell
npm install
```

Expected: completes without fatal errors (warnings are fine).

- [ ] **Step 3: Add the `MINIFY` env toggle to the build script**

In `scripts/build-control-ui.mjs`, change line 24:

```js
  minify: true,
```

to:

```js
  minify: process.env.MINIFY !== "false",
```

- [ ] **Step 4: Verify the baseline build still works**

```powershell
npm run build:control-ui
```

(If `build:control-ui` is not the exact script name, check `package.json` `scripts` block — use the script that runs `node scripts/build-control-ui.mjs`.)

Expected: `control-ui/assets/app.js` and `control-ui/assets/app.css` are written, no esbuild errors.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json scripts/build-control-ui.mjs
git commit -m "chore: restore build tooling and add MINIFY toggle to control-ui build"
```

---

## Task 2: Wire `"llm-world"` into `types.ts` (PageKey, NAV_ITEMS, PAGE_META)

**Files:**
- Modify: `control-ui-src/types.ts:3-29` (PageKey), `:73-100` (NAV_ITEMS), `:102-129` (PAGE_META)

- [ ] **Step 1: Add `"llm-world"` to the `PageKey` union**

In `control-ui-src/types.ts`, line 11-12 currently read:

```ts
  | "models"
  | "c2"
```

Change to:

```ts
  | "models"
  | "llm-world"
  | "c2"
```

- [ ] **Step 2: Insert the NAV_ITEMS entry between "models" and "c2"**

Lines 78-79 currently read:

```ts
  { key: "models",       route: "/models",       label: "Models",       section: "" },
  { key: "c2",           route: "/c2",           label: "C2",           section: "" },
```

Change to:

```ts
  { key: "models",       route: "/models",       label: "Models",       section: "" },
  { key: "llm-world",    route: "/llm-world",    label: "LLM World",    section: "" },
  { key: "c2",           route: "/c2",           label: "C2",           section: "" },
```

- [ ] **Step 3: Insert the PAGE_META entry between "models" and "c2"**

Lines 110-111 currently read:

```ts
  models:       { title: "Models",          description: "Model routing and assignments." },
  c2:           { title: "C2",              description: "Command and control operations." },
```

Change to:

```ts
  models:       { title: "Models",          description: "Model routing and assignments." },
  "llm-world":  { title: "LLM World",       description: "Live universe of agents, projects, and tutorials from awesome-llm-apps." },
  c2:           { title: "C2",              description: "Command and control operations." },
```

- [ ] **Step 4: Verify TypeScript compiles**

```powershell
npx tsc --noEmit -p tsconfig.json
```

Expected: no new errors related to `types.ts` (the `PAGE_META: Record<PageKey, ...>` exhaustiveness check passes because `"llm-world"` was added to both the union and the record).

Note: `App.tsx`'s `renderPage` switch and `defaultContextForPage` (in `types.ts:244-273`) both have a `default:` fallback case, so `"llm-world"` does not need an entry there beyond what Task 7 adds for rendering.

- [ ] **Step 5: Commit**

```powershell
git add control-ui-src/types.ts
git commit -m "feat: add llm-world page key, nav entry, and page meta"
```

---

## Task 3: Copy unchanged LLM World sub-component files

**Files:**
- Create: `control-ui-src/llm-world-types.ts`
- Create: `control-ui-src/llm-world-components.tsx`
- Create: `control-ui-src/llm-world-sectors.tsx`

These three files are reused as-is from `codex-mcp-server-push-worktree` — verified self-contained (only depend on `./types` for `cn`, which exists identically in `codex-mcp-server`).

- [ ] **Step 1: Copy the files**

```powershell
$src = "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server-push-worktree\control-ui-src"
$dst = "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server\control-ui-src"
Copy-Item "$src\llm-world-types.ts" "$dst\llm-world-types.ts"
Copy-Item "$src\llm-world-components.tsx" "$dst\llm-world-components.tsx"
Copy-Item "$src\llm-world-sectors.tsx" "$dst\llm-world-sectors.tsx"
```

- [ ] **Step 2: Verify the files landed**

```powershell
Get-Item "$dst\llm-world-types.ts","$dst\llm-world-components.tsx","$dst\llm-world-sectors.tsx" | Select-Object Name, Length
```

Expected: three files, sizes roughly 2.7KB / 3.0KB / 2.4KB (112/94/78 source lines respectively).

- [ ] **Step 3: Commit**

```powershell
git add control-ui-src/llm-world-types.ts control-ui-src/llm-world-components.tsx control-ui-src/llm-world-sectors.tsx
git commit -m "feat: port llm-world types, components, and sector-map sub-components"
```

---

## Task 4: Create `llm-world-explorer.tsx` with `localOpenEnabled` gating

**Files:**
- Create: `control-ui-src/llm-world-explorer.tsx`

This is a port of `codex-mcp-server-push-worktree/control-ui-src/llm-world-explorer.tsx` (231 lines) with one change: `LaunchActions`, `AgentProjectCard`, and `AgentProjectGrid` gain a `localOpenEnabled: boolean` prop. When `false`, the "Open folder" and "Open README" buttons are not rendered (only "Details" and the disabled "Run" placeholder remain).

- [ ] **Step 1: Write the file**

```tsx
import { Btn } from "./shell";
import { cn } from "./types";
import { DependencyBadge, ReadinessBadge, RuntimeBadge, entryHay } from "./llm-world-components";
import {
  deriveReadiness,
  deriveRuntimeKind,
  isTutorial,
  type ExplorerMode,
  type ReadinessFilter,
  type RuntimeFilter,
  type SortKey,
  type WorldEntry,
} from "./llm-world-types";

export type ExplorerFilters = {
  query: string;
  mode: ExplorerMode;
  category: string;
  runtime: RuntimeFilter;
  readiness: ReadinessFilter;
  sort: SortKey;
};

const MODE_OPTIONS: Array<{ value: ExplorerMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "agents", label: "Agents" },
  { value: "projects", label: "Projects" },
  { value: "tutorials", label: "Tutorials" },
];

const RUNTIME_OPTIONS: Array<{ value: RuntimeFilter; label: string }> = [
  { value: "all", label: "Any runtime" },
  { value: "python", label: "Python" },
  { value: "node", label: "Node" },
  { value: "mixed", label: "Mixed" },
  { value: "unknown", label: "Unknown" },
];

const READINESS_OPTIONS: Array<{ value: ReadinessFilter; label: string }> = [
  { value: "all", label: "Any readiness" },
  { value: "ready", label: "Ready" },
  { value: "needs-env", label: "Needs env" },
  { value: "needs-install", label: "Needs install" },
  { value: "missing-readme", label: "Missing README" },
  { value: "unknown-runtime", label: "Unknown runtime" },
  { value: "source-only", label: "Source only" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "name", label: "Name" },
  { value: "category", label: "Category" },
  { value: "readiness", label: "Readiness" },
  { value: "type", label: "Type" },
];

const READINESS_RANK: Record<string, number> = {
  ready: 0,
  "needs-env": 1,
  "needs-install": 2,
  "missing-readme": 3,
  "unknown-runtime": 4,
  "source-only": 5,
};

export function applyExplorerFilters(entries: WorldEntry[], filters: ExplorerFilters): WorldEntry[] {
  const q = filters.query.trim().toLowerCase();
  let out = entries.filter((entry) => {
    if (filters.mode === "agents" && entry.kind !== "agent") return false;
    if (filters.mode === "projects" && entry.kind !== "project") return false;
    if (filters.mode === "tutorials" && !isTutorial(entry)) return false;
    if (filters.category !== "all" && entry.category !== filters.category) return false;
    if (filters.runtime !== "all" && deriveRuntimeKind(entry.runtime) !== filters.runtime) return false;
    if (filters.readiness !== "all" && deriveReadiness(entry) !== filters.readiness) return false;
    if (q && !entryHay(entry).includes(q)) return false;
    return true;
  });

  out = out.slice().sort((a, b) => {
    switch (filters.sort) {
      case "category": return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
      case "readiness": return READINESS_RANK[deriveReadiness(a)] - READINESS_RANK[deriveReadiness(b)] || a.title.localeCompare(b.title);
      case "type": return a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title);
      default: return a.title.localeCompare(b.title);
    }
  });
  return out;
}

export function SearchFilterBar({ filters, onChange, onReset, resultCount, totalCount }: {
  filters: ExplorerFilters;
  onChange: (next: Partial<ExplorerFilters>) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const activeChips: Array<{ key: keyof ExplorerFilters; label: string }> = [];
  if (filters.mode !== "all") activeChips.push({ key: "mode", label: `type: ${filters.mode}` });
  if (filters.category !== "all") activeChips.push({ key: "category", label: `sector: ${filters.category}` });
  if (filters.runtime !== "all") activeChips.push({ key: "runtime", label: `runtime: ${filters.runtime}` });
  if (filters.readiness !== "all") activeChips.push({ key: "readiness", label: `readiness: ${filters.readiness}` });
  if (filters.query.trim()) activeChips.push({ key: "query", label: `search: "${filters.query.trim()}"` });

  return (
    <div className="llmw-filter-bar">
      <div className="llmw-filter-row">
        <input
          className="field"
          placeholder="Search agents, projects, paths, frameworks…"
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          style={{ minWidth: 260, flex: 1 }}
        />
        <select className="field" value={filters.mode} onChange={(e) => onChange({ mode: e.target.value as ExplorerMode })}>
          {MODE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select className="field" value={filters.runtime} onChange={(e) => onChange({ runtime: e.target.value as RuntimeFilter })}>
          {RUNTIME_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select className="field" value={filters.readiness} onChange={(e) => onChange({ readiness: e.target.value as ReadinessFilter })}>
          {READINESS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select className="field" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
          {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>Sort: {opt.label}</option>)}
        </select>
      </div>
      <div className="llmw-filter-row llmw-filter-status">
        <span className="text-xs text-3">{resultCount} of {totalCount} visible</span>
        {activeChips.length ? (
          <div className="llmw-chip-row">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                className="llmw-chip llmw-chip-removable"
                onClick={() => onChange({ [chip.key]: chip.key === "query" ? "" : "all" } as Partial<ExplorerFilters>)}
              >
                {chip.label} ×
              </button>
            ))}
            <button className="llmw-chip llmw-chip-reset" onClick={onReset}>Clear all</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LaunchActions({ entry, onOpenDetail, onOpenFolder, onOpenReadme, opening, localOpenEnabled }: {
  entry: WorldEntry;
  onOpenDetail: () => void;
  onOpenFolder: () => void;
  onOpenReadme: () => void;
  opening: "folder" | "readme" | null;
  localOpenEnabled: boolean;
}) {
  return (
    <div className="llmw-launch-actions">
      <Btn size="sm" variant="primary" onClick={onOpenDetail}>Details</Btn>
      {localOpenEnabled ? (
        <>
          <Btn size="sm" onClick={onOpenFolder}>{opening === "folder" ? "Opening…" : "Open folder"}</Btn>
          {entry.readme ? (
            <Btn size="sm" onClick={onOpenReadme}>{opening === "readme" ? "Opening…" : "Open README"}</Btn>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled title="No README detected for this entry">Open README</button>
          )}
        </>
      ) : null}
      <button className="btn btn-secondary btn-sm" disabled title="Run/stop requires a process-management backend endpoint that does not exist yet">
        Run — backend endpoint needed
      </button>
    </div>
  );
}

export function AgentProjectCard({ entry, onOpenDetail, onOpenFolder, onOpenReadme, opening, localOpenEnabled }: {
  entry: WorldEntry;
  onOpenDetail: () => void;
  onOpenFolder: () => void;
  onOpenReadme: () => void;
  opening: "folder" | "readme" | null;
  localOpenEnabled: boolean;
}) {
  const readiness = deriveReadiness(entry);
  return (
    <div className="llmw-card">
      <div className="llmw-card-head">
        <div className="llmw-card-title-row">
          <span className={cn("status-dot", entry.kind === "agent" ? "dot-active" : "dot-online")} />
          <span className="llmw-card-title">{entry.title}</span>
        </div>
        <span className="llmw-chip llmw-chip-kind">{entry.kind}</span>
      </div>
      <div className="llmw-card-path">{entry.relativePath}</div>
      <div className="llmw-card-desc">{entry.description}</div>
      <div className="llmw-card-badges">
        <RuntimeBadge runtime={entry.runtime} />
        <ReadinessBadge readiness={readiness} />
        <span className="llmw-chip">{entry.category}</span>
      </div>
      <DependencyBadge manifests={entry.manifests} />
      <LaunchActions entry={entry} onOpenDetail={onOpenDetail} onOpenFolder={onOpenFolder} onOpenReadme={onOpenReadme} opening={opening} localOpenEnabled={localOpenEnabled} />
    </div>
  );
}

export function AgentProjectGrid({ entries, onOpenDetail, onOpenFolder, onOpenReadme, openingId, localOpenEnabled }: {
  entries: WorldEntry[];
  onOpenDetail: (entry: WorldEntry) => void;
  onOpenFolder: (entry: WorldEntry) => void;
  onOpenReadme: (entry: WorldEntry) => void;
  openingId: { id: string; target: "folder" | "readme" } | null;
  localOpenEnabled: boolean;
}) {
  return (
    <div className="llmw-explorer-grid">
      {entries.map((entry) => (
        <AgentProjectCard
          key={entry.id}
          entry={entry}
          onOpenDetail={() => onOpenDetail(entry)}
          onOpenFolder={() => onOpenFolder(entry)}
          onOpenReadme={() => onOpenReadme(entry)}
          opening={openingId && openingId.id === entry.id ? openingId.target : null}
          localOpenEnabled={localOpenEnabled}
        />
      ))}
    </div>
  );
}

export const EXPLORER_DEFAULT_FILTERS: ExplorerFilters = {
  query: "",
  mode: "all",
  category: "all",
  runtime: "all",
  readiness: "all",
  sort: "name",
};
```

- [ ] **Step 2: Commit**

```powershell
git add control-ui-src/llm-world-explorer.tsx
git commit -m "feat: add llm-world explorer with localOpenEnabled gating"
```

---

## Task 5: Create `llm-world-drawer.tsx` with `localOpenEnabled` gating

**Files:**
- Create: `control-ui-src/llm-world-drawer.tsx`

Port of `codex-mcp-server-push-worktree/control-ui-src/llm-world-drawer.tsx` (169 lines). `AgentProjectDetailDrawer` gains a `localOpenEnabled: boolean` prop; when `false`, the "Open folder" and "Open README" action buttons are omitted, but the inline "README excerpt" section (`detail.readmeExcerpt`, lines 97-102 of the source) and "View on GitHub" remain unchanged — satisfying "show README inline + disable Open folder on prod". `OperationalPanel` is unchanged.

- [ ] **Step 1: Write the file**

```tsx
import { useEffect, useState } from "react";
import { Btn, Panel } from "./shell";
import { DependencyBadge, ReadinessBadge, RuntimeBadge } from "./llm-world-components";
import { deriveReadiness, type EntryDetail, type WorldEntry } from "./llm-world-types";

export function AgentProjectDetailDrawer({ entry, onClose, onOpenFolder, onOpenReadme, opening, localOpenEnabled }: {
  entry: WorldEntry | null;
  onClose: () => void;
  onOpenFolder: (entry: WorldEntry) => void;
  onOpenReadme: (entry: WorldEntry) => void;
  opening: "folder" | "readme" | null;
  localOpenEnabled: boolean;
}) {
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entry) { setDetail(null); setError(""); return; }
    let cancelled = false;
    setDetail(null);
    setError("");
    setLoading(true);
    fetch(`/api/awesome-llm-apps/${encodeURIComponent(entry.id)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Status ${res.status}`))))
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Failed to load entry detail"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entry?.id]);

  if (!entry) return null;
  const readiness = deriveReadiness(entry);

  return (
    <div className="llmw-drawer-overlay" onClick={onClose}>
      <div className="llmw-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="llmw-drawer-head">
          <div>
            <div className="llmw-drawer-title">{entry.title}</div>
            <div className="llmw-drawer-path">{entry.relativePath}</div>
          </div>
          <Btn size="sm" variant="ghost" onClick={onClose}>Close ×</Btn>
        </div>

        <div className="llmw-drawer-badges">
          <span className="llmw-chip llmw-chip-kind">{entry.kind}</span>
          <span className="llmw-chip">{entry.category}</span>
          <RuntimeBadge runtime={entry.runtime} />
          <ReadinessBadge readiness={readiness} />
        </div>

        <div className="llmw-drawer-section">
          <div className="llmw-drawer-section-label">Local path</div>
          <code className="llmw-drawer-code">{entry.absolutePath}</code>
        </div>

        <div className="llmw-drawer-section">
          <div className="llmw-drawer-section-label">Manifests detected</div>
          <DependencyBadge manifests={entry.manifests} />
        </div>

        <div className="llmw-drawer-section">
          <div className="llmw-drawer-section-label">Launch hints (detected)</div>
          {entry.launchHints.length ? (
            <div className="llmw-drawer-launch-list">
              {entry.launchHints.map((hint) => <code key={hint} className="llmw-drawer-code">{hint}</code>)}
            </div>
          ) : <div className="text-sm text-2">No launch command detected from manifests/entry files.</div>}
        </div>

        {loading ? <div className="text-sm text-2">Loading repository detail…</div> : null}
        {error ? <div className="llmw-drawer-error">Detail backend error: {error}</div> : null}

        {detail ? (
          <>
            <div className="llmw-drawer-section">
              <div className="llmw-drawer-section-label">Detected frameworks</div>
              {detail.frameworks.length ? (
                <div className="llmw-chip-row">{detail.frameworks.map((f) => <span key={f} className="llmw-chip">{f}</span>)}</div>
              ) : <div className="text-sm text-2">No known framework signature detected in manifests.</div>}
            </div>

            <div className="llmw-drawer-section">
              <div className="llmw-drawer-section-label">Required env vars (from .env.example)</div>
              {detail.envVars.length ? (
                <div className="llmw-chip-row">{detail.envVars.map((v) => <span key={v} className="llmw-chip llmw-chip-env">{v}</span>)}</div>
              ) : <div className="text-sm text-2">No .env.example detected — no required variables found.</div>}
            </div>

            <div className="llmw-drawer-section">
              <div className="llmw-drawer-section-label">Files ({detail.files.length})</div>
              <div className="llmw-drawer-file-list">
                {detail.files.map((f) => <span key={f} className="llmw-chip llmw-chip-file">{f}</span>)}
              </div>
            </div>

            {detail.readmeExcerpt ? (
              <div className="llmw-drawer-section">
                <div className="llmw-drawer-section-label">README excerpt</div>
                <pre className="llmw-drawer-readme">{detail.readmeExcerpt}</pre>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="llmw-drawer-actions">
          {localOpenEnabled ? (
            <>
              <Btn onClick={() => onOpenFolder(entry)}>{opening === "folder" ? "Opening folder…" : "Open folder"}</Btn>
              {entry.readme ? (
                <Btn onClick={() => onOpenReadme(entry)}>{opening === "readme" ? "Opening README…" : "Open README"}</Btn>
              ) : (
                <button className="btn btn-secondary" disabled title="No README detected for this entry">Open README</button>
              )}
            </>
          ) : null}
          <Btn
            variant="secondary"
            onClick={() => window.open(`https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/${entry.relativePath.replace(/\\/g, "/")}`, "_blank", "noopener,noreferrer")}
          >
            View on GitHub
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function OperationalPanel({ logs, backendConnected, lastError, activeFilters, selected }: {
  logs: Array<{ id: string; summary: string; level: string; timestamp: string }>;
  backendConnected: boolean;
  lastError: string;
  activeFilters: string[];
  selected: WorldEntry | null;
}) {
  return (
    <Panel title="Operational Panel" subtitle="Scan health, recent log events, active filters, and current selection">
      <div className="llmw-ops-grid">
        <div className="llmw-ops-block">
          <div className="llmw-drawer-section-label">Backend health</div>
          <div className={`llmw-ops-health ${backendConnected ? "llmw-ops-health-ok" : "llmw-ops-health-down"}`}>
            {backendConnected ? "Scanner connected" : "Scanner disconnected"}
          </div>
          {lastError ? <div className="llmw-drawer-error">{lastError}</div> : <div className="text-sm text-2">No errors reported.</div>}
        </div>
        <div className="llmw-ops-block">
          <div className="llmw-drawer-section-label">Active filters</div>
          {activeFilters.length ? (
            <div className="llmw-chip-row">{activeFilters.map((f) => <span key={f} className="llmw-chip">{f}</span>)}</div>
          ) : <div className="text-sm text-2">No filters applied — showing the full universe.</div>}
        </div>
        <div className="llmw-ops-block">
          <div className="llmw-drawer-section-label">Selected</div>
          <div className="text-sm text-2">{selected ? `${selected.title} (${selected.relativePath})` : "Nothing selected"}</div>
        </div>
        <div className="llmw-ops-block">
          <div className="llmw-drawer-section-label">Recent scan log</div>
          {logs.length ? (
            <div className="llmw-ops-log-list">
              {logs.slice(0, 6).map((log) => (
                <div className="llmw-ops-log-row" key={log.id}>
                  <span className={`status-dot ${log.level === "error" ? "dot-error" : "dot-online"}`} />
                  <span className="text-xs text-2">{log.summary}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-2">No scan log events yet.</div>}
        </div>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add control-ui-src/llm-world-drawer.tsx
git commit -m "feat: add llm-world detail drawer with localOpenEnabled gating"
```

---

## Task 6: Write the `pages-llm-world.tsx` orchestrator

**Files:**
- Create: `control-ui-src/pages-llm-world.tsx` (note: this filename does NOT currently exist in `codex-mcp-server` — it is new, not a modification)

This is adapted from the recovered orchestrator in `docs/superpowers/plans/2026-06-07-llm-world-upgrade.md:1053-1259`, with `localOpenEnabled` read from `payload.localOpenEnabled` and threaded into `AgentProjectGrid` and `AgentProjectDetailDrawer`. Per the tsconfig check in Task 1 (no `noUnusedParameters`), the original `{ actions }` destructure would compile fine, but since `actions` truly is unused, this version uses `_props: PageProps` to avoid an unused-variable lint warning.

- [ ] **Step 1: Write the file**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Btn, Panel, StatusBadge } from "./shell";
import type { PageProps } from "./types";
import {
  EmptyState,
  ErrorState,
  SkeletonLoader,
  WorldStatsGrid,
} from "./llm-world-components";
import { CategoryWorldMap } from "./llm-world-sectors";
import {
  AgentProjectGrid,
  EXPLORER_DEFAULT_FILTERS,
  SearchFilterBar,
  applyExplorerFilters,
  type ExplorerFilters,
} from "./llm-world-explorer";
import { AgentProjectDetailDrawer, OperationalPanel } from "./llm-world-drawer";
import { deriveReadiness, type WorldEntry, type WorldPayload } from "./llm-world-types";

type OpeningState = { id: string; target: "folder" | "readme" } | null;
type ScanLog = { id: string; summary: string; level: string; timestamp: string };

function WorldHeader({ payload, onRefresh, refreshing }: { payload: WorldPayload; onRefresh: () => void; refreshing: boolean }) {
  return (
    <Panel
      title="LLM Apps World"
      subtitle="A dedicated world for Shubhamsaboo/awesome-llm-apps — agents, apps, projects, runtimes, and launch paths."
      action={<StatusBadge value="backend connected" />}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 16, alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="llmw-hero-title">Awesome LLM Apps Universe</div>
          <div className="llmw-hero-sub">
            A live, repo-backed universe of every agent, project, and tutorial in Shubhamsaboo/awesome-llm-apps — scanned directly off disk, never mocked.
          </div>
        </div>
        <div className="llmw-repo-card">
          <div className="row-between"><span className="text-xs text-3">Branch</span><span className="text-xs text-1">{payload.branch}</span></div>
          <div className="row-between"><span className="text-xs text-3">Commit</span><span className="text-xs text-1">{payload.commit}</span></div>
          <div className="row-between"><span className="text-xs text-3">Generated</span><span className="text-xs text-1">{new Date(payload.generatedAt).toLocaleTimeString()}</span></div>
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
          <div className="text-xs text-3">Repository root</div>
          <code className="llmw-repo-root">{payload.root}</code>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <Btn size="sm" onClick={() => window.open(payload.remote, "_blank", "noopener,noreferrer")}>Open GitHub</Btn>
            <Btn size="sm" onClick={onRefresh}>{refreshing ? "Refreshing…" : "Refresh scan"}</Btn>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function LlmWorldPage(_props: PageProps) {
  const [payload, setPayload] = useState<WorldPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<ExplorerFilters>(EXPLORER_DEFAULT_FILTERS);
  const [selected, setSelected] = useState<WorldEntry | null>(null);
  const [opening, setOpening] = useState<OpeningState>(null);
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);

  const load = (markRefreshing: boolean) => {
    if (markRefreshing) setRefreshing(true); else setLoading(true);
    fetch("/api/awesome-llm-apps")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Status ${res.status}`))))
      .then((data: WorldPayload) => {
        setPayload(data);
        setError("");
        setScanLogs((prev) => [{
          id: `scan-${data.generatedAt}`,
          summary: `Scan completed — ${data.totals.projects} projects, ${data.totals.agents} agents across ${data.totals.categories} sectors.`,
          level: "info",
          timestamp: data.generatedAt,
        }, ...prev].slice(0, 20));
      })
      .catch((err) => {
        const message = err?.message || "Failed to load world";
        setError(message);
        setScanLogs((prev) => [{ id: `scan-error-${Date.now()}`, summary: `Scan failed: ${message}`, level: "error", timestamp: new Date().toISOString() }, ...prev].slice(0, 20));
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { load(false); }, []);

  const visible = useMemo(() => {
    if (!payload) return [];
    return applyExplorerFilters(payload.projects, filters);
  }, [payload, filters]);

  const readyCount = useMemo(() => (payload ? payload.projects.filter((e) => deriveReadiness(e) === "ready").length : 0), [payload]);
  const attentionCount = payload ? payload.projects.length - readyCount : 0;

  const updateFilters = (next: Partial<ExplorerFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const resetFilters = () => setFilters(EXPLORER_DEFAULT_FILTERS);

  const runOpen = (entry: WorldEntry, target: "folder" | "readme") => {
    setOpening({ id: entry.id, target });
    fetch("/api/awesome-llm-apps/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, target }),
    })
      .then((res) => (res.ok ? res.json() : res.json().then((body) => Promise.reject(new Error(body?.error || `Status ${res.status}`)))))
      .then(() => {
        setScanLogs((prev) => [{ id: `open-${entry.id}-${Date.now()}`, summary: `Opened ${target === "readme" ? "README for" : "folder for"} ${entry.title}.`, level: "info", timestamp: new Date().toISOString() }, ...prev].slice(0, 20));
      })
      .catch((err) => {
        const message = err?.message || "Unable to open path";
        setScanLogs((prev) => [{ id: `open-error-${entry.id}-${Date.now()}`, summary: `Open failed for ${entry.title}: ${message}`, level: "error", timestamp: new Date().toISOString() }, ...prev].slice(0, 20));
      })
      .finally(() => setOpening(null));
  };

  if (error && !payload) {
    return (
      <Panel title="LLM Apps World" subtitle="Backend catalog failed" action={<StatusBadge value="backend disconnected" />}>
        <ErrorState title="Backend scanner unavailable" detail={error} />
      </Panel>
    );
  }

  if (loading && !payload) {
    return (
      <Panel title="LLM Apps World" subtitle="Building backend catalog">
        <SkeletonLoader rows={8} />
      </Panel>
    );
  }

  if (!payload) return null;

  const localOpenEnabled = Boolean(payload.localOpenEnabled);

  const activeFilterChips: string[] = [];
  if (filters.mode !== "all") activeFilterChips.push(`type: ${filters.mode}`);
  if (filters.category !== "all") activeFilterChips.push(`sector: ${filters.category}`);
  if (filters.runtime !== "all") activeFilterChips.push(`runtime: ${filters.runtime}`);
  if (filters.readiness !== "all") activeFilterChips.push(`readiness: ${filters.readiness}`);
  if (filters.query.trim()) activeFilterChips.push(`search: "${filters.query.trim()}"`);

  return (
    <div className="llmw-page">
      <WorldHeader payload={payload} onRefresh={() => load(true)} refreshing={refreshing} />

      <Panel title="Intelligence" subtitle="Live counts straight from the filesystem scan — no cached or mocked numbers">
        <WorldStatsGrid totals={payload.totals} readyCount={readyCount} attentionCount={attentionCount} />
      </Panel>

      <Panel title="World Map" subtitle="Repository categories as sectors — click a sector to filter the explorer below">
        {payload.categories.length ? (
          <CategoryWorldMap
            categories={payload.categories}
            projects={payload.projects}
            activeCategory={filters.category}
            onSelect={(categoryId) => updateFilters({ category: categoryId })}
          />
        ) : <EmptyState title="No sectors discovered" detail="The scanner found no top-level categories under the repository root." />}
      </Panel>

      <Panel
        title="Explorer"
        subtitle={`${visible.length} of ${payload.totals.projects} entries visible — every card is backed by the live scanner, never a mock list.`}
      >
        <SearchFilterBar
          filters={filters}
          onChange={updateFilters}
          onReset={resetFilters}
          resultCount={visible.length}
          totalCount={payload.totals.projects}
        />
        {visible.length ? (
          <div className="llmw-explorer-scroll">
            <AgentProjectGrid
              entries={visible}
              onOpenDetail={setSelected}
              onOpenFolder={(entry) => runOpen(entry, "folder")}
              onOpenReadme={(entry) => runOpen(entry, "readme")}
              openingId={opening}
              localOpenEnabled={localOpenEnabled}
            />
          </div>
        ) : (
          <EmptyState title="No entries match these filters" detail="Try clearing a filter or broadening your search — nothing in the current view matches the active criteria." />
        )}
      </Panel>

      <OperationalPanel
        logs={scanLogs}
        backendConnected={!error}
        lastError={error}
        activeFilters={activeFilterChips}
        selected={selected}
      />

      <AgentProjectDetailDrawer
        entry={selected}
        onClose={() => setSelected(null)}
        onOpenFolder={(entry) => runOpen(entry, "folder")}
        onOpenReadme={(entry) => runOpen(entry, "readme")}
        opening={opening && selected && opening.id === selected.id ? opening.target : null}
        localOpenEnabled={localOpenEnabled}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add control-ui-src/pages-llm-world.tsx
git commit -m "feat: add LLM World page orchestrator"
```

---

## Task 7: Wire `LlmWorldPage` into `App.tsx`

**Files:**
- Modify: `control-ui-src/App.tsx:1`, `:303-334`

- [ ] **Step 1: Add the import**

Line 1-2 currently read:

```tsx
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AgentsPage, HomePage, ModelsPage, OverviewPage, VisionaryPage } from "./pages-core";
```

Add a new import line directly after line 2:

```tsx
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AgentsPage, HomePage, ModelsPage, OverviewPage, VisionaryPage } from "./pages-core";
import { LlmWorldPage } from "./pages-llm-world";
```

- [ ] **Step 2: Add the render case**

In `renderPage` (currently lines 303-334), line 313 reads:

```tsx
    case "models": return <ModelsPage {...props} />;
```

Add a new case directly after it:

```tsx
    case "models": return <ModelsPage {...props} />;
    case "llm-world": return <LlmWorldPage {...props} />;
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add control-ui-src/App.tsx
git commit -m "feat: render LlmWorldPage for the llm-world route"
```

---

## Task 8: Append LLM World CSS to `styles.css`

**Files:**
- Modify: `control-ui-src/styles.css` (append at end, currently 4351 lines)

The CSS block (172 lines, sector map / explorer / drawer / operational panel / responsive rules) already exists verbatim in `codex-mcp-server-push-worktree/control-ui-src/styles.css:4353-4524`.

- [ ] **Step 1: Append the block**

```powershell
$srcCss = "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server-push-worktree\control-ui-src\styles.css"
$dstCss = "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server\control-ui-src\styles.css"
$block = Get-Content $srcCss | Select-Object -Skip 4352 -First 172
Add-Content -Path $dstCss -Value ""
Add-Content -Path $dstCss -Value $block
```

- [ ] **Step 2: Verify**

```powershell
(Get-Content $dstCss | Measure-Object -Line).Lines
Select-String -Path $dstCss -Pattern "LLM World — Universe View"
Select-String -Path $dstCss -Pattern "^\.llmw-drawer "
```

Expected: line count ≈ 4524 (4351 + 1 blank + 172), and both `Select-String` calls return one match each.

- [ ] **Step 3: Commit**

```powershell
git add control-ui-src/styles.css
git commit -m "feat: add llm-world stylesheet block"
```

---

## Task 9: Build (minified) and smoke-test the frontend

**Files:** none (build artifacts only)

- [ ] **Step 1: Build**

```powershell
cd "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server"
npm run build:control-ui
```

Expected: build succeeds, `control-ui/assets/app.js` and `app.css` are regenerated with a new `?v=<timestamp>` in `control-ui/index.html`.

- [ ] **Step 2: Confirm the new page is in the bundle**

```powershell
Select-String -Path "control-ui\assets\app.js" -Pattern "LLM World" -SimpleMatch
Select-String -Path "control-ui\assets\app.css" -Pattern "llmw-page" -SimpleMatch
```

Expected: at least one match in each (minified output, so matches may be embedded in long lines — any match count > 0 is success).

- [ ] **Step 3: Run the local control-ui and visually verify**

Start the local dev/serve process per the project's existing `npm run dev` (or equivalent) script, open the control-ui in a browser, and confirm:
- Top nav shows "LLM World" between "C2" and "Monitoring".
- Clicking it loads the LLM World page (it will show "Backend scanner unavailable" or an empty world until Task 10/11's backend routes exist — that is expected at this point and will be re-checked after Task 11).

Note this step's result before continuing — full functional verification happens after Task 11.

---

## Task 10: Port `awesome-llm-apps-world.ts` with `localOpenEnabled`

**Files:**
- Create: `src/core/awesome-llm-apps-world.ts`

Port of `codex-mcp-server-push-worktree/src/core/awesome-llm-apps-world.ts` (321 lines), unchanged except: add `localOpenEnabled: boolean` to `AwesomeWorldPayload` and populate it from `process.env.LLM_WORLD_LOCAL_OPEN === "true"` in both branches of `buildAwesomeLlmAppsWorld()`.

- [ ] **Step 1: Copy the file**

```powershell
$src = "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server-push-worktree\src\core\awesome-llm-apps-world.ts"
$dst = "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server\src\core\awesome-llm-apps-world.ts"
Copy-Item $src $dst
```

- [ ] **Step 2: Add `localOpenEnabled` to the `AwesomeWorldPayload` type**

In `src/core/awesome-llm-apps-world.ts`, lines 22-39 currently read:

```ts
export type AwesomeWorldPayload = {
  generatedAt: string;
  root: string;
  remote: string;
  branch: string;
  commit: string;
  totals: {
    categories: number;
    projects: number;
    agents: number;
    packageJson: number;
    requirements: number;
    pythonFiles: number;
  };
  categories: Array<{ id: string; label: string; path: string; projects: number; agents: number }>;
  projects: AwesomeWorldEntry[];
  agents: AwesomeWorldEntry[];
};
```

Change the last line from `  agents: AwesomeWorldEntry[];\n};` to:

```ts
  agents: AwesomeWorldEntry[];
  localOpenEnabled: boolean;
};
```

- [ ] **Step 3: Populate it in the empty-root branch**

Lines 277-289 (the `if (!fs.existsSync(AWESOME_ROOT))` early return) currently end with:

```ts
      categories: [],
      projects: [],
      agents: [],
    };
  }
```

Change to:

```ts
      categories: [],
      projects: [],
      agents: [],
      localOpenEnabled: process.env.LLM_WORLD_LOCAL_OPEN === "true",
    };
  }
```

- [ ] **Step 4: Populate it in the main return**

Lines 317-320 currently read:

```ts
    categories: Array.from(categoryMap.values()),
    projects,
    agents,
  };
```

Change to:

```ts
    categories: Array.from(categoryMap.values()),
    projects,
    agents,
    localOpenEnabled: process.env.LLM_WORLD_LOCAL_OPEN === "true",
  };
```

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```powershell
git add src/core/awesome-llm-apps-world.ts
git commit -m "feat: port awesome-llm-apps-world scanner with localOpenEnabled flag"
```

---

## Task 11: Register the 3 `/api/awesome-llm-apps*` routes in `http.ts`

**Files:**
- Modify: `src/core/http.ts:1-22` (imports), `:213-215` (route insertion point)

The `/open` route is gated: it 501s unless `LLM_WORLD_LOCAL_OPEN === "true"`. When enabled (local dev only, on Windows), it behaves exactly like the worktree version (`explorer.exe`).

- [ ] **Step 1: Add the import**

Line 1-2 currently read:

```ts
import fs from "fs";
import path from "path";
```

Change to:

```ts
import fs from "fs";
import path from "path";
import {
  buildAwesomeLlmAppsEntryDetail,
  buildAwesomeLlmAppsWorld,
  resolveAwesomeEntryOpenPath,
} from "./awesome-llm-apps-world";
```

- [ ] **Step 2: Insert the 3 routes**

Lines 213-215 currently read:

```ts
  app.get("/api/probe", (_req: Request, res: Response) => {
    res.json({ server: "sync-repos", ts: Date.now() });
  });
```

Insert the new routes directly before this block:

```ts
  app.get("/api/awesome-llm-apps", (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.json(buildAwesomeLlmAppsWorld());
    } catch (err: any) {
      logger.error("awesome_llm_apps_world_failed", { error: err?.message || String(err) });
      res.status(500).json({ error: err?.message || "Unable to build awesome-llm-apps world." });
    }
  });

  app.get("/api/awesome-llm-apps/:id", (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      const detail = buildAwesomeLlmAppsEntryDetail(String(req.params.id || ""));
      if (!detail) return res.status(404).json({ error: "Entry not found." });
      res.json(detail);
    } catch (err: any) {
      logger.error("awesome_llm_apps_detail_failed", { error: err?.message || String(err) });
      res.status(500).json({ error: err?.message || "Unable to load entry detail." });
    }
  });

  app.post("/api/awesome-llm-apps/open", (req: Request, res: Response) => {
    if (process.env.LLM_WORLD_LOCAL_OPEN !== "true") {
      return res.status(501).json({ error: "Local open actions are disabled on this deployment." });
    }
    try {
      const id = String(req.body?.id || "");
      const target = req.body?.target === "readme" ? "readme" : "folder";
      const resolved = resolveAwesomeEntryOpenPath(id, target);
      if (!resolved) return res.status(404).json({ error: "Entry or path not found." });
      const cp = require("child_process") as typeof import("child_process");
      cp.execFile("explorer.exe", [resolved], () => { /* explorer.exe exits non-zero on success on Windows; ignore */ });
      res.json({ ok: true, opened: resolved, target });
    } catch (err: any) {
      logger.error("awesome_llm_apps_open_failed", { error: err?.message || String(err) });
      res.status(500).json({ error: err?.message || "Unable to open path." });
    }
  });

  app.get("/api/probe", (_req: Request, res: Response) => {
    res.json({ server: "sync-repos", ts: Date.now() });
  });
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Build the backend**

```powershell
npm run build
```

Expected: `dist/core/awesome-llm-apps-world.js` and updated `dist/core/http.js` are produced, no errors.

- [ ] **Step 5: Commit**

```powershell
git add src/core/http.ts
git commit -m "feat: register /api/awesome-llm-apps routes with gated open action"
```

---

## Task 12: Document the `LLM_WORLD_LOCAL_OPEN` and `AWESOME_LLM_APPS_ROOT` env vars

**Files:**
- Modify: `.env.example`, `.env.production.example` (if present)

- [ ] **Step 1: Append to `.env.example`**

Append to the end of `c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server\.env.example`:

```
# LLM World tab — awesome-llm-apps catalog scanner
AWESOME_LLM_APPS_ROOT=/awesome-llm-apps
# Enables filesystem "Open folder"/"Open README" actions (Windows-only, local dev only)
LLM_WORLD_LOCAL_OPEN=false
```

- [ ] **Step 2: Check for and update `.env.production.example`**

```powershell
Test-Path "c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\repos\codex-mcp-server\.env.production.example"
```

If it exists, append:

```
# LLM World tab — awesome-llm-apps catalog scanner (read-only clone path on the VPS)
AWESOME_LLM_APPS_ROOT=/awesome-llm-apps
# Must remain false in production — Open folder/README use Windows explorer.exe
LLM_WORLD_LOCAL_OPEN=false
```

If it does not exist, skip this step (no placeholder file created).

- [ ] **Step 3: Commit**

```powershell
git add .env.example .env.production.example 2>$null
git commit -m "docs: document LLM_WORLD_LOCAL_OPEN and AWESOME_LLM_APPS_ROOT env vars"
```

---

## Task 13: Local end-to-end verification with the catalog mounted

**Files:** none (runtime configuration only)

- [ ] **Step 1: Point the local backend at the existing catalog checkout**

Set in `codex-mcp-server`'s local `.env` (do not commit `.env`):

```
AWESOME_LLM_APPS_ROOT=c:\Users\offic\بِسْمِ ٱللَّٰهِ\development\Awesome-LLM-Apps
LLM_WORLD_LOCAL_OPEN=true
```

- [ ] **Step 2: Rebuild backend and frontend**

```powershell
npm run build
npm run build:control-ui
```

- [ ] **Step 3: Start the server and hit the new endpoints**

Start the server per its existing run script, then:

```powershell
curl http://localhost:<port>/api/awesome-llm-apps | Select-String "totals"
```

Expected: JSON containing non-zero `totals.projects`/`totals.agents`/`totals.categories`, and `"localOpenEnabled":true`.

- [ ] **Step 4: Browser check**

Open the control-ui, navigate to "LLM World" (between C2 and Monitoring), and confirm:
- Stats grid shows non-zero numbers matching `/api/awesome-llm-apps`.
- World map renders one card per category; clicking a sector filters the explorer.
- Search/filter/sort controls work; clicking "Details" on a card opens the drawer.
- Drawer shows files/manifests/env vars/frameworks/README excerpt for an entry that has a README.
- "Open folder" / "Open README" buttons are visible (since `LLM_WORLD_LOCAL_OPEN=true` locally) and work.

- [ ] **Step 5: Set `LLM_WORLD_LOCAL_OPEN=false` and re-check the gate**

Restart with `LLM_WORLD_LOCAL_OPEN=false` (or unset), reload the page, and confirm:
- "Open folder"/"Open README" buttons are gone from both cards and the drawer.
- README excerpt and "View on GitHub" still work in the drawer.
- `POST /api/awesome-llm-apps/open` returns HTTP 501.

```powershell
curl -X POST http://localhost:<port>/api/awesome-llm-apps/open -H "Content-Type: application/json" -d '{\"id\":\"test\",\"target\":\"folder\"}'
```

Expected: `{"error":"Local open actions are disabled on this deployment."}` with status 501.

---

## Task 14: Build with `MINIFY=false` and diff against prod's bundle

**Files:** none (build artifacts only)

- [ ] **Step 1: Build unminified**

```powershell
$env:MINIFY = "false"
npm run build:control-ui
Remove-Item Env:\MINIFY
```

- [ ] **Step 2: Diff against the previously fetched prod bundle**

```powershell
$prod = "C:\Users\offic\AppData\Local\Temp\prod_app.js"
$new = "control-ui\assets\app.js"
(Get-Content $new | Measure-Object -Line).Lines
(Get-Content $prod | Measure-Object -Line).Lines
Compare-Object (Get-Content $prod) (Get-Content $new) -SyncWindow 200 | Measure-Object
```

- [ ] **Step 3: Inspect the diff regions**

```powershell
Compare-Object (Get-Content $prod) (Get-Content $new) -SyncWindow 200 |
  Sort-Object SideIndicator | Select-Object -First 200 |
  Format-Table -AutoSize
```

Review the output:
- Expected differences: the new `NAV_ITEMS`/`PAGE_META` entries for `"llm-world"`, the new `pages-llm-world`/`llm-world-*` module code, the new `LlmWorldPage` render case.
- Flag anything else as a prod-only hand-patch not present in `codex-mcp-server`. If found, present the specific diff lines to TASK before proceeding to Task 15 — do not silently drop or silently port unrelated hand-patches.

- [ ] **Step 4: Re-build minified for deployment**

```powershell
npm run build:control-ui
```

(Default `MINIFY` is unset → `minify: true` per Task 1's toggle, matching the rest of `codex-mcp-server`'s normal build output. Note: prod itself currently runs unminified — Task 15 decides which artifact to actually ship based on what's least disruptive; default to keeping prod's existing unminified format unless TASK says otherwise, i.e. ship the Task 14 Step 1 unminified build.)

---

## Task 15: VPS deployment and GO LOCK verification

**Authorization note:** the read-only VPS investigation in prior sessions does NOT authorize these write/restart actions. Before running Step 2 onward, confirm with TASK that deployment should proceed now.

**Files:** none (remote VPS operations)

- [ ] **Step 1: Backup the current prod control-ui and dist**

On the VPS (`root@187.77.211.125`):

```bash
mkdir -p /root/backups
ts=$(date +%Y%m%d-%H%M%S)
tar -czf /root/backups/task-command-center-pre-llm-world-$ts.tar.gz \
  -C /opt/task-command-center/mcp-server control-ui dist
ls -lh /root/backups/ | tail -3
```

Expected: a new `.tar.gz` listed.

- [ ] **Step 2: Clone the awesome-llm-apps catalog**

```bash
mkdir -p /opt/awesome-llm-apps
git clone --depth 1 https://github.com/Shubhamsaboo/awesome-llm-apps.git /opt/awesome-llm-apps
```

Expected: clone completes, `/opt/awesome-llm-apps` is non-empty.

- [ ] **Step 3: Configure the container's environment**

Locate the `task-command-center` container's env file or compose config (e.g. `docker inspect task-command-center | grep -A5 Env` or the relevant `docker-compose.yml`/`.env` under `/opt/task-command-center`), and add/confirm:

```
AWESOME_LLM_APPS_ROOT=/awesome-llm-apps
LLM_WORLD_LOCAL_OPEN=false
```

Add a bind mount so `/opt/awesome-llm-apps` (host) → `/awesome-llm-apps` (container, read-only). If the container is started via `docker run`, this means adding `-v /opt/awesome-llm-apps:/awesome-llm-apps:ro` to its run command / compose `volumes:` and recreating the container; if via compose, edit the `volumes:` list under the `task-command-center` service.

- [ ] **Step 4: Copy the new build artifacts**

From the local machine, copy the Task 14 build output to the VPS (paths match `/opt/task-command-center/mcp-server/{control-ui,dist}`):

```bash
scp -r control-ui/* root@187.77.211.125:/opt/task-command-center/mcp-server/control-ui/
scp -r dist/* root@187.77.211.125:/opt/task-command-center/mcp-server/dist/
```

- [ ] **Step 5: Restart the container**

```bash
docker restart task-command-center
docker logs --tail 50 task-command-center
```

Expected: container restarts cleanly, no crash loop, logs show normal startup (HTTP server listening).

- [ ] **Step 6: GO LOCK verification**

Per CLAUDE.md's GO LOCK protocol, deploy an independent Lock agent (model: opus) to verify, via the authenticated session (with `c2_trusted_device` cookie) against `https://cc.taskenterprise.tech`:

- [ ] "LLM World" appears in the nav between "C2" and "Monitoring"
- [ ] The page loads: stats grid shows non-zero totals from `/opt/awesome-llm-apps`
- [ ] World map renders sector cards; clicking one filters the explorer
- [ ] Search/filter/sort work; "Details" opens the drawer with live README/files/manifests/env-vars/frameworks
- [ ] "Open folder"/"Open README" buttons are ABSENT (production gating confirmed)
- [ ] `GET /api/awesome-llm-apps` returns `"localOpenEnabled":false` and real totals
- [ ] `POST /api/awesome-llm-apps/open` returns 501
- [ ] No regressions on Home, C2, Monitoring, Visionary, Models tabs (spot-check each loads without console errors)
- [ ] Container restart count stable (no crash loop) 5+ minutes after deploy

- [ ] **Step 7: Rollback path (if anything fails)**

```bash
cd /opt/task-command-center/mcp-server
tar -xzf /root/backups/task-command-center-pre-llm-world-<ts>.tar.gz
docker restart task-command-center
```

---

## Self-Review Notes

- **Spec coverage:** stats grid (Task 6/Task 9 step3), sector world-map (Task 6 via `CategoryWorldMap`), search/filter/sort explorer (Task 4/6), detail drawer with live README/files/manifests/env-vars/frameworks (Task 5/6), Open folder/Open README gated per design decision (Task 4/5/10/11), derived readiness engine (Task 3, `llm-world-types.ts` unchanged), 3 backend routes (Task 11), nav position between C2 and Monitoring (Task 2), catalog data on VPS (Task 15 step 2-3), pre-deploy diff (Task 14), GO LOCK (Task 15 step 6) — all covered.
- **Type consistency:** `localOpenEnabled: boolean` flows from `AwesomeWorldPayload` (Task 10) → `WorldPayload` is the frontend alias in `llm-world-types.ts` (Task 3, copied unchanged — note `WorldPayload` does NOT declare `localOpenEnabled` in its type since it's structurally compatible via `Boolean(payload.localOpenEnabled)` in Task 6, which handles `undefined` safely; this is intentional to avoid modifying the unchanged Task 3 file). `AgentProjectGrid`/`AgentProjectCard`/`LaunchActions` (Task 4) and `AgentProjectDetailDrawer` (Task 5) all take `localOpenEnabled: boolean`, matching how Task 6 calls them.
- **No placeholders:** all new/modified files have complete code; copy/diff steps reference exact, previously-verified source files and line ranges.
