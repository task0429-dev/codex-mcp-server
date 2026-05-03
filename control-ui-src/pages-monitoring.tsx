import { useState } from "react";
import type { PageProps } from "./types";
import { GROUPS, ALERTS } from "./data-monitoring";
import { MonitoringTable } from "./monitoring-table";
import { MonitoringRexBar } from "./monitoring-rex-bar";

export function MonitoringPage(_props: PageProps) {
  const [filter, setFilter] = useState("");
  const [segment, setSegment] = useState<"all" | "watch" | "critical">("all");
  const [pendingRexMsg, setPendingRexMsg] = useState<string | null>(null);

  const allConns = GROUPS.flatMap((g) => g.connections);
  const totalConns = allConns.length;
  const optimalCount = allConns.filter((c) => c.uptime >= 99.5).length;
  const watchCount = allConns.filter((c) => c.uptime >= 95 && c.uptime < 99.5).length;
  const downCount = allConns.filter((c) => c.uptime < 80).length;
  const degradedCount = allConns.filter((c) => c.uptime >= 80 && c.uptime < 95).length;
  const openAlerts = ALERTS.filter((a) => a.severity === "critical" || a.severity === "high").length;

  const avgResp = Math.round(
    allConns.filter((c) => c.responseTime != null).reduce((s, c) => s + (c.responseTime ?? 0), 0) /
      Math.max(1, allConns.filter((c) => c.responseTime != null).length)
  );

  // Filter groups by segment
  const segmentedGroups = GROUPS.map((g) => ({
    ...g,
    connections:
      segment === "watch"
        ? g.connections.filter((c) => c.uptime < 99.5 && c.uptime >= 80)
        : segment === "critical"
        ? g.connections.filter((c) => c.uptime < 80 || (c.incidentCount > 0 && c.uptime < 95))
        : g.connections,
  })).filter((g) => g.connections.length > 0);

  function handleAskRex(msg: string) {
    setPendingRexMsg(msg);
  }

  return (
    <div className="mon-page">
      {/* ── Top bar ── */}
      <div className="mon-topbar">
        <div className="mon-topbar-brand">
          <div className="mon-brand-icon">◈</div>
          <div>
            <div className="mon-brand-kicker">Rex Command Center</div>
            <div className="mon-brand-title">Network Persistence Monitor</div>
          </div>
        </div>
        <div className="mon-topbar-right">
          <span className="mon-pill mon-pill-live">
            <span className="mon-live-dot" />
            LIVE SCAN
          </span>
          {downCount > 0 && (
            <span className="mon-pill mon-pill-critical">
              <span className="mon-live-dot" />
              {downCount} CRITICAL
            </span>
          )}
          {(watchCount > 0 || degradedCount > 0) && (
            <span className="mon-pill mon-pill-warn">
              {watchCount + degradedCount} WATCH
            </span>
          )}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="mon-kpi-strip">
        <div className="mon-kpi">
          <div className="mon-kpi-accent mon-kpi-accent-blue" />
          <div className="mon-kpi-label">Total Connections</div>
          <div className="mon-kpi-value mon-kpi-white">{totalConns}</div>
          <div className="mon-kpi-sub">{GROUPS.length} groups</div>
        </div>
        <div className="mon-kpi">
          <div className="mon-kpi-accent mon-kpi-accent-green" />
          <div className="mon-kpi-label">Optimal</div>
          <div className="mon-kpi-value mon-kpi-green">{optimalCount}</div>
          <div className="mon-kpi-sub">{totalConns > 0 ? ((optimalCount / totalConns) * 100).toFixed(1) : 0}% of total</div>
        </div>
        <div className="mon-kpi">
          <div className="mon-kpi-accent mon-kpi-accent-amber" />
          <div className="mon-kpi-label">Watch / Degraded</div>
          <div className="mon-kpi-value mon-kpi-amber">{watchCount + degradedCount}</div>
          <div className="mon-kpi-sub">need monitoring</div>
        </div>
        <div className="mon-kpi">
          <div className="mon-kpi-accent mon-kpi-accent-red" />
          <div className="mon-kpi-label">Down / Critical</div>
          <div className="mon-kpi-value mon-kpi-red">{downCount}</div>
          <div className="mon-kpi-sub">{openAlerts} open alerts</div>
        </div>
        <div className="mon-kpi">
          <div className="mon-kpi-accent mon-kpi-accent-blue" />
          <div className="mon-kpi-label">Avg Response</div>
          <div className="mon-kpi-value mon-kpi-white">{avgResp}ms</div>
          <div className="mon-kpi-sub">across all checks</div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="mon-controls">
        <div className="mon-search-wrap">
          <span className="mon-search-icon">⌕</span>
          <input
            className="mon-search"
            placeholder="Search connections, endpoints, tags…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="mon-seg">
          {(["all", "watch", "critical"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`mon-seg-btn${segment === s ? " mon-seg-active" + (s === "critical" ? " mon-seg-red" : "") : ""}`}
              onClick={() => setSegment(s)}
            >
              {s === "all" ? "All" : s === "watch" ? "Watch" : "Critical"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Connection table ── */}
      <MonitoringTable
        groups={segmentedGroups}
        filter={filter}
        onAskRex={handleAskRex}
      />

      {/* ── Rex bottom bar ── */}
      <MonitoringRexBar
        groups={GROUPS}
        pendingMessage={pendingRexMsg}
        onPendingConsumed={() => setPendingRexMsg(null)}
      />
    </div>
  );
}
