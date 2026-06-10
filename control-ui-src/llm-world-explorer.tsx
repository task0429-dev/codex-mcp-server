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
