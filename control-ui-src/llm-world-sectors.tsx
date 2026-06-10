import { useMemo } from "react";
import { cn } from "./types";
import { RuntimeBadge } from "./llm-world-components";
import { deriveReadiness, type WorldCategory, type WorldEntry } from "./llm-world-types";

function dominantRuntime(entries: WorldEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const r of entry.runtime) counts.set(r, (counts.get(r) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 1).map(([name]) => name);
}

function readinessSummary(entries: WorldEntry[]) {
  let ready = 0;
  for (const entry of entries) if (deriveReadiness(entry) === "ready") ready += 1;
  return { ready, attention: entries.length - ready };
}

export function SectorCard({ category, entries, active, onSelect }: {
  category: WorldCategory;
  entries: WorldEntry[];
  active: boolean;
  onSelect: () => void;
}) {
  const runtime = dominantRuntime(entries);
  const { ready, attention } = readinessSummary(entries);
  return (
    <button className={cn("llmw-sector-card", active && "llmw-sector-card-active")} onClick={onSelect}>
      <div className="llmw-sector-head">
        <span className="llmw-sector-label">{category.label}</span>
        <span className="llmw-sector-count">{category.projects}</span>
      </div>
      <div className="llmw-sector-meta">
        <span>{category.agents} agents</span>
        <span>·</span>
        <span>{category.projects - category.agents} projects</span>
      </div>
      {runtime.length ? <RuntimeBadge runtime={runtime} /> : <span className="llmw-badge llmw-badge-tone-neutral">No runtime detected</span>}
      <div className="llmw-sector-readiness">
        <span className="llmw-sector-ready">{ready} ready</span>
        <span className="llmw-sector-attention">{attention} need attention</span>
      </div>
    </button>
  );
}

export function CategoryWorldMap({ categories, projects, activeCategory, onSelect }: {
  categories: WorldCategory[];
  projects: WorldEntry[];
  activeCategory: string;
  onSelect: (categoryId: string) => void;
}) {
  const byCategory = useMemo(() => {
    const map = new Map<string, WorldEntry[]>();
    for (const entry of projects) {
      const list = map.get(entry.category) || [];
      list.push(entry);
      map.set(entry.category, list);
    }
    return map;
  }, [projects]);

  return (
    <div className="llmw-sector-grid">
      {categories.map((category) => (
        <SectorCard
          key={category.id}
          category={category}
          entries={byCategory.get(category.id) || []}
          active={activeCategory === category.id}
          onSelect={() => onSelect(activeCategory === category.id ? "all" : category.id)}
        />
      ))}
    </div>
  );
}
