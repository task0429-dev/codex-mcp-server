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
