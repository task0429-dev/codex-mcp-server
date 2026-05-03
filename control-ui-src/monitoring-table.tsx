import { useState, useCallback } from "react";
import { cn } from "./types";
import {
  type MonitorGroup,
  type Connection,
  type HealthLevel,
  type DiagResult,
  healthLabel,
  healthColor,
} from "./data-monitoring";

// ─── Uptime Meter ────────────────────────────────────────────────────────────
// Split bar: green (uptime %) left → red (downtime %) right
// Failure blips (from beats) are overlaid at their time positions

function UptimeMeter({ beats, uptime }: { beats: Connection["beats"]; uptime: number }) {
  const pct = Math.max(0, Math.min(100, uptime));
  const failurePct = 100 - pct;

  // Find positions of failures within the beats array for blip overlay
  const failurePositions = beats
    .map((b, i) => (b === "d" || b === "p" ? i / beats.length : null))
    .filter((v): v is number => v !== null);

  const meterColor =
    pct >= 99.5 ? "var(--green)" :
    pct >= 95   ? "var(--yellow)" :
                  "var(--accent-text)";

  return (
    <div className="mon-meter-wrap">
      <div className="mon-meter-track">
        {/* Green fill */}
        <div
          className="mon-meter-fill"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${meterColor}22, ${meterColor})` }}
        />
        {/* Red tail */}
        {failurePct > 0.5 && (
          <div
            className="mon-meter-fail"
            style={{ width: `${failurePct}%`, right: 0 }}
          />
        )}
        {/* Failure blips at exact positions */}
        {failurePositions.map((pos, i) => (
          <div
            key={i}
            className="mon-meter-blip"
            style={{ left: `${pos * 100}%` }}
          />
        ))}
        {/* Glow divider at split point */}
        {failurePct > 0.5 && (
          <div className="mon-meter-split" style={{ left: `${pct}%` }} />
        )}
      </div>
      <span className="mon-meter-label" style={{ color: meterColor }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Status chip ────────────────────────────────────────────────────────────

function StatusChip({ health }: { health: HealthLevel }) {
  const color = healthColor(health);
  return (
    <span className={`mon-status-chip mon-status-${color}`}>
      <span className={`mon-sdot mon-sdot-${color}`} />
      <span>{healthLabel(health)}</span>
    </span>
  );
}

// ─── Left indicator bar ─────────────────────────────────────────────────────

function Indicator({ health }: { health: HealthLevel }) {
  const color = healthColor(health);
  return <span className={`mon-ind mon-ind-${color}`} />;
}

// ─── Mock diagnostics ────────────────────────────────────────────────────────

function getDiagResults(conn: Connection): DiagResult[] {
  const base: DiagResult[] = [
    {
      check: "TCP connectivity",
      status: conn.uptime > 0 ? "pass" : "fail",
      detail: conn.uptime > 0 ? `Connected in ${(conn.responseTime ?? 0)}ms` : "Connection refused",
    },
    {
      check: "HTTP response",
      status: conn.uptime >= 95 ? "pass" : conn.uptime >= 80 ? "warn" : "fail",
      detail: conn.uptime >= 95 ? "200 OK" : conn.uptime >= 80 ? "Elevated latency" : `Error — ${conn.failureReason || "Unknown"}`,
    },
    {
      check: "SSL certificate",
      status: conn.type === "https" ? (conn.uptime >= 95 ? "pass" : "warn") : "pass",
      detail: conn.type === "https" ? (conn.uptime >= 95 ? "Valid, expires in 84 days" : "Certificate OK but latency elevated") : "N/A",
    },
    {
      check: "Response time",
      status: (conn.responseTime ?? 0) < 300 ? "pass" : (conn.responseTime ?? 0) < 600 ? "warn" : "fail",
      detail: conn.responseTime != null ? `${conn.responseTime}ms (baseline ~${Math.round((conn.responseTime ?? 0) * 0.4)}ms)` : "No data",
    },
  ];
  return base;
}

function diagStatusIcon(s: DiagResult["status"]) {
  if (s === "pass") return "✓";
  if (s === "fail") return "✗";
  if (s === "warn") return "⚠";
  return "…";
}

// ─── Expanded detail panel ──────────────────────────────────────────────────

function ExpandedRow({
  conn,
  onAskRex,
}: {
  conn: Connection;
  onAskRex: (msg: string) => void;
}) {
  const [restartState, setRestartState] = useState<"idle" | "running" | "done">("idle");
  const diag = getDiagResults(conn);

  function handleRestart() {
    setRestartState("running");
    setTimeout(() => setRestartState("done"), 2200);
  }

  return (
    <tr className="mon-exp-row">
      <td colSpan={6}>
        <div className="mon-exp-grid">
          {/* Card 1: Connection details */}
          <div className="mon-exp-card">
            <div className="mon-exp-card-title">
              <span className="mon-exp-dot" style={{ background: "var(--text-3)" }} />
              Connection Details
            </div>
            <div className="mon-exp-field">
              <span className="mon-exp-key">Endpoint</span>
              <span className="mon-exp-val mono" style={{ fontSize: 10 }}>{conn.endpoint}</span>
            </div>
            <div className="mon-exp-field">
              <span className="mon-exp-key">Type</span>
              <span className="mon-exp-val mono">{conn.type.toUpperCase()}</span>
            </div>
            <div className="mon-exp-field">
              <span className="mon-exp-key">Environment</span>
              <span className="mon-exp-val">{conn.environment}</span>
            </div>
            <div className="mon-exp-field">
              <span className="mon-exp-key">Uptime (30d)</span>
              <span className="mon-exp-val" style={{ color: conn.uptime >= 99 ? "var(--green)" : conn.uptime >= 95 ? "var(--yellow)" : "var(--red)" }}>
                {conn.uptime.toFixed(2)}%
              </span>
            </div>
            <div className="mon-exp-field">
              <span className="mon-exp-key">Response</span>
              <span className="mon-exp-val mono">{conn.responseTime != null ? `${conn.responseTime}ms` : "—"}</span>
            </div>
            <div className="mon-exp-field">
              <span className="mon-exp-key">Incidents</span>
              <span className="mon-exp-val" style={{ color: conn.incidentCount > 0 ? "var(--accent-text)" : "var(--text-2)" }}>
                {conn.incidentCount}
              </span>
            </div>
            {conn.failureReason && (
              <div className="mon-exp-failure-note">{conn.failureReason}</div>
            )}
          </div>

          {/* Card 2: Rex diagnosis */}
          <div className="mon-exp-card">
            <div className="mon-exp-card-title">
              <span className="mon-exp-dot" style={{ background: "var(--accent)" }} />
              Rex Diagnosis
            </div>
            <div className="mon-diag-term">
              {diag.map((d, i) => (
                <div key={i} className={`mon-diag-line mon-diag-${d.status}`}>
                  <span className="mon-diag-icon">{diagStatusIcon(d.status)}</span>
                  <span className="mon-diag-check">{d.check}</span>
                  <span className="mon-diag-detail">{d.detail}</span>
                </div>
              ))}
              {conn.failureReason && (
                <div className="mon-diag-line mon-diag-warn" style={{ marginTop: 6, opacity: .85 }}>
                  <span className="mon-diag-icon">◈</span>
                  <span style={{ fontStyle: "italic" }}>Rex: {conn.failureReason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Actions */}
          <div className="mon-exp-card">
            <div className="mon-exp-card-title">
              <span className="mon-exp-dot" style={{ background: "var(--blue)" }} />
              Actions
            </div>
            <div className="mon-exp-actions-grid">
              <button
                type="button"
                className={cn("mon-xbtn", restartState === "running" ? "mon-xbtn-running" : "mon-xbtn-restart")}
                onClick={handleRestart}
                disabled={restartState === "running"}
              >
                {restartState === "running" ? "⟳ Restarting…" : restartState === "done" ? "✓ Restarted" : "⟳ Restart Connection"}
              </button>
              <button
                type="button"
                className="mon-xbtn mon-xbtn-rex"
                onClick={() => onAskRex(`Why is ${conn.name} having issues? Uptime: ${conn.uptime}%${conn.failureReason ? `. Last error: ${conn.failureReason}` : ""}`)}
              >
                ◈ Ask Rex to Diagnose
              </button>
              <button
                type="button"
                className="mon-xbtn mon-xbtn-ghost"
                onClick={() => onAskRex(`What's the history of ${conn.name} incidents?`)}
              >
                View Incident History
              </button>
              <button
                type="button"
                className="mon-xbtn mon-xbtn-ghost"
                onClick={() => onAskRex(`Run a full health check on ${conn.name}`)}
              >
                Full Health Check
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Connection row ──────────────────────────────────────────────────────────

function ConnRow({
  conn,
  isOpen,
  onToggle,
  onAskRex,
}: {
  conn: Connection;
  isOpen: boolean;
  onToggle: () => void;
  onAskRex: (msg: string) => void;
}) {
  const health = conn.uptime >= 99.5
    ? "optimal"
    : conn.uptime >= 98
    ? "stable"
    : conn.uptime >= 95
    ? "watch"
    : conn.uptime >= 80
    ? "degraded"
    : "critical" as HealthLevel;

  function handleRestart(e: React.MouseEvent) {
    e.stopPropagation();
  }

  function handleAskRex(e: React.MouseEvent) {
    e.stopPropagation();
    onAskRex(`Tell me about ${conn.name}: uptime ${conn.uptime}%${conn.failureReason ? `, issue: ${conn.failureReason}` : ""}`);
  }

  return (
    <>
      <tr className={cn("mon-conn-row", isOpen && "mon-conn-open")} onClick={onToggle}>
        <td>
          <div className="mon-conn-main">
            <Indicator health={health} />
            <div className="mon-name-col">
              <div className="mon-conn-name">{conn.name}</div>
              <div className="mon-conn-meta">
                <span className="mon-conn-endpoint">{conn.endpoint}</span>
                {conn.tags.slice(0, 2).map((t) => (
                  <span key={t} className="mon-tag">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </td>
        <td className="mon-status-col">
          <StatusChip health={health} />
        </td>
        <td className="mon-uptime-col">
          <span
            className="mon-uptime-val"
            style={{
              color: conn.uptime >= 99 ? "var(--green)" : conn.uptime >= 95 ? "var(--yellow)" : "var(--accent-text)",
            }}
          >
            {conn.uptime.toFixed(1)}%
          </span>
        </td>
        <td className="mon-resp-col">
          <span className="mon-resp-val">
            {conn.responseTime != null ? `${conn.responseTime}ms` : "—"}
          </span>
        </td>
        <td className="mon-hb-col">
          <UptimeMeter beats={conn.beats} uptime={conn.uptime} />
        </td>
        <td className="mon-act-col">
          <div className="mon-act-row">
            <button
              type="button"
              className="mon-iact mon-iact-restart"
              title="Restart connection"
              onClick={handleRestart}
            >
              ⟳
            </button>
            <button
              type="button"
              className="mon-iact mon-iact-rex"
              title="Ask Rex"
              onClick={handleAskRex}
            >
              ◈
            </button>
            <button
              type="button"
              className="mon-iact"
              title={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? "▴" : "▾"}
            </button>
          </div>
        </td>
      </tr>
      {isOpen && <ExpandedRow conn={conn} onAskRex={onAskRex} />}
    </>
  );
}

// ─── Group header row ────────────────────────────────────────────────────────

function GroupHeaderRow({ group }: { group: MonitorGroup }) {
  const pct = group.total > 0 ? (group.healthy / group.total) * 100 : 100;
  return (
    <tr className="mon-grp-row">
      <td colSpan={6}>
        <div className="mon-grp-inner">
          <span className="mon-grp-icon">{group.icon}</span>
          <span className="mon-grp-name">{group.displayName}</span>
          <span className="mon-grp-stats">
            {group.healthy}/{group.total} online
            {group.down > 0 && <span style={{ color: "var(--accent-text)", marginLeft: 6 }}>· {group.down} down</span>}
          </span>
          <div className="mon-grp-bar">
            <div
              className="mon-grp-bar-fill"
              style={{ width: `${pct}%`, background: pct >= 99 ? "var(--green)" : pct >= 90 ? "var(--yellow)" : "var(--accent)" }}
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main table ──────────────────────────────────────────────────────────────

export function MonitoringTable({
  groups,
  filter,
  onAskRex,
}: {
  groups: MonitorGroup[];
  filter: string;
  onAskRex: (msg: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const q = filter.trim().toLowerCase();

  const filtered = groups.map((g) => ({
    ...g,
    connections: q
      ? g.connections.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.endpoint.toLowerCase().includes(q) ||
            c.tags.some((t) => t.toLowerCase().includes(q))
        )
      : g.connections,
  })).filter((g) => g.connections.length > 0);

  if (filtered.length === 0) {
    return (
      <div className="mon-empty">
        No connections match <strong>"{filter}"</strong>
      </div>
    );
  }

  return (
    <div className="mon-table-wrap">
      <table className="mon-table">
        <thead>
          <tr>
            <th>Connection</th>
            <th className="mon-th-status">Status</th>
            <th className="mon-th-uptime">Uptime</th>
            <th className="mon-th-resp">Response</th>
            <th className="mon-th-hb">Heartbeat (40 checks)</th>
            <th className="mon-th-act" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((group) => (
            <>
              <GroupHeaderRow key={`grp-${group.id}`} group={group} />
              {group.connections.map((conn) => (
                <ConnRow
                  key={conn.id}
                  conn={conn}
                  isOpen={openId === conn.id}
                  onToggle={() => toggle(conn.id)}
                  onAskRex={onAskRex}
                />
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
