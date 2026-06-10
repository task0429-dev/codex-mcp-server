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
