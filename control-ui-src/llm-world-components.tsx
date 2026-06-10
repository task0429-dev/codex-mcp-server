import { cn } from "./types";
import {
  READINESS_LABEL,
  READINESS_TONE,
  deriveRuntimeKind,
  type Readiness,
  type RuntimeKind,
  type WorldEntry,
} from "./llm-world-types";

const RUNTIME_LABEL: Record<RuntimeKind, string> = {
  python: "Python",
  node: "Node",
  mixed: "Mixed",
  unknown: "Unknown",
};

export function RuntimeBadge({ runtime }: { runtime: string[] }) {
  const kind = deriveRuntimeKind(runtime);
  return <span className={cn("llmw-badge", `llmw-badge-runtime-${kind}`)}>{RUNTIME_LABEL[kind]}</span>;
}

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  return <span className={cn("llmw-badge", `llmw-badge-tone-${READINESS_TONE[readiness]}`)}>{READINESS_LABEL[readiness]}</span>;
}

export function DependencyBadge({ manifests }: { manifests: string[] }) {
  if (!manifests.length) return <span className="llmw-badge llmw-badge-tone-neutral">No manifest detected</span>;
  return (
    <div className="llmw-dependency-row">
      {manifests.map((name) => <span key={name} className="llmw-chip">{name}</span>)}
    </div>
  );
}

export function WorldStatsGrid({ totals, readyCount, attentionCount }: {
  totals: { projects: number; agents: number; categories: number; pythonFiles: number; packageJson: number; requirements: number };
  readyCount: number;
  attentionCount: number;
}) {
  const cells: Array<{ label: string; value: number; note: string }> = [
    { label: "Projects", value: totals.projects, note: "all discovered" },
    { label: "Agents", value: totals.agents, note: "agent-class apps" },
    { label: "Categories", value: totals.categories, note: "world sectors" },
    { label: "Python", value: totals.pythonFiles, note: "*.py files" },
    { label: "Node", value: totals.packageJson, note: "package.json" },
    { label: "Reqs", value: totals.requirements, note: "requirements.txt" },
    { label: "Ready", value: readyCount, note: "detected ready-to-run" },
    { label: "Needs attention", value: attentionCount, note: "missing env / deps / docs" },
  ];
  return (
    <div className="llmw-stats-grid">
      {cells.map((cell) => (
        <div className="metric" key={cell.label}>
          <div className="metric-value">{cell.value}</div>
          <div className="metric-label">{cell.label}</div>
          <div className="metric-note">{cell.note}</div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="llmw-state-block">
      <div className="llmw-state-icon">◌</div>
      <div className="llmw-state-title">{title}</div>
      <div className="llmw-state-detail">{detail}</div>
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="llmw-state-block llmw-state-error">
      <div className="llmw-state-icon">⚠</div>
      <div className="llmw-state-title">{title}</div>
      <div className="llmw-state-detail">{detail}</div>
    </div>
  );
}

export function SkeletonLoader({ rows = 6 }: { rows?: number }) {
  return (
    <div className="llmw-skeleton-grid">
      {Array.from({ length: rows }).map((_, i) => <div className="llmw-skeleton-card" key={i} />)}
    </div>
  );
}

export function entryHay(entry: WorldEntry) {
  return `${entry.title} ${entry.relativePath} ${entry.description} ${entry.category} ${entry.tags.join(" ")}`.toLowerCase();
}
