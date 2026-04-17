/* ─── Rex Command Zone — Command Header, Alert Ribbon, KPI Strip ─── */

import { useMemo } from 'react';
import { formatRelative } from './types';
import { healthColor, healthLabel, type Alert, type Incident, type MonitorGroup } from './data-monitoring';

// ── CommandHeader ────────────────────────────────────────────────

interface CommandHeaderProps {
  groups: MonitorGroup[];
  alerts: Alert[];
  incidents: Incident[];
  onAction: (id: string) => void;
  liveMode: boolean;
  onToggleLive: () => void;
  lastSync: string;
}

export function CommandHeader({ groups, alerts, incidents, onAction, liveMode, onToggleLive, lastSync }: CommandHeaderProps) {
  const totals = useMemo(() => {
    const total   = groups.reduce((a, g) => a + g.total, 0);
    const healthy = groups.reduce((a, g) => a + g.healthy, 0);
    const degraded = groups.reduce((a, g) => a + g.degraded, 0);
    const down    = groups.reduce((a, g) => a + g.down, 0);
    const openInc = incidents.filter(i => i.status === 'open').length;
    return { total, healthy, degraded, down, openInc };
  }, [groups, incidents]);

  const critCount = alerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="rzm-header">
      {/* Left — brand */}
      <div className="rzm-header-brand">
        <span className="rzm-brand-text">◈ REX COMMAND ZONE</span>
        <span className="rzm-badge rzm-badge-prod">ENV: PROD</span>
        <button
          className={`rzm-live-btn ${liveMode ? 'rzm-live-btn-on' : 'rzm-live-btn-off'}`}
          onClick={onToggleLive}
          title="Toggle live mode"
        >
          <span className={liveMode ? 'rzm-live-dot' : 'rzm-live-dot-off'} />
          {liveMode ? 'LIVE' : 'PAUSED'}
        </button>
      </div>

      {/* Center — totals */}
      <div className="rzm-header-center">
        <div className="rzm-hstat rzm-hstat-total">
          <span className="rzm-hstat-num">{totals.total}</span>
          <span className="rzm-hstat-lbl">TOTAL</span>
        </div>
        <div className="rzm-hstat rzm-hstat-healthy">
          <span className="rzm-hstat-num" style={{ color: 'var(--rzm-green)' }}>{totals.healthy}</span>
          <span className="rzm-hstat-lbl">HEALTHY</span>
        </div>
        <div className="rzm-hstat rzm-hstat-degraded">
          <span className="rzm-hstat-num" style={{ color: 'var(--rzm-amber)' }}>{totals.degraded}</span>
          <span className="rzm-hstat-lbl">DEGRADED</span>
        </div>
        <div className="rzm-hstat rzm-hstat-down">
          <span className="rzm-hstat-num rzm-hstat-down-num">{totals.down}</span>
          <span className="rzm-hstat-lbl">DOWN</span>
        </div>
        {totals.openInc > 0 && (
          <div className="rzm-hstat">
            <span className="rzm-hstat-num" style={{ color: 'var(--rzm-accent)' }}>{totals.openInc}</span>
            <span className="rzm-hstat-lbl">INCIDENTS</span>
          </div>
        )}
        {critCount > 0 && (
          <div className="rzm-header-crit-badge">
            ⚡ {critCount} CRITICAL
          </div>
        )}
      </div>

      {/* Right — actions */}
      <div className="rzm-header-actions">
        <button className="rzm-icon-btn" title="Refresh All" onClick={() => onAction('refresh')}>
          <span>↻</span>
        </button>
        <button className="rzm-icon-btn" title="Health Scan" onClick={() => onAction('health-check')}>
          <span>⊕</span>
        </button>
        <button className="rzm-icon-btn" title="Reconnect Failed" onClick={() => onAction('reconnect')}>
          <span>⟳</span>
        </button>
        <button className="rzm-btn rzm-btn-primary rzm-btn-sm" onClick={() => onAction('add-connection')}>
          + Add
        </button>
        <span className="rzm-header-sync">
          {lastSync ? `Sync ${formatRelative(lastSync)}` : '—'}
        </span>
      </div>
    </div>
  );
}

// ── AlertRibbon ──────────────────────────────────────────────────

interface AlertRibbonProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
}

export function AlertRibbon({ alerts, onDismiss }: AlertRibbonProps) {
  if (alerts.length === 0) return null;
  return (
    <div className="rzm-alert-ribbon">
      <span className="rzm-alert-ribbon-label">⚡ ALERTS</span>
      {alerts.map(alert => (
        <div key={alert.id} className={`rzm-alert-item rzm-alert-item-${alert.severity}`}>
          <span className={`rzm-alert-dot rzm-alert-dot-${alert.severity}`} />
          <span className="rzm-alert-conn">{alert.connectionName}</span>
          <span className="rzm-alert-msg">{alert.message}</span>
          <span className="rzm-alert-time">{formatRelative(alert.timestamp)}</span>
          <button className="rzm-alert-dismiss" onClick={() => onDismiss(alert.id)} title="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}

// ── KpiStrip ─────────────────────────────────────────────────────

interface KpiStripProps {
  groups: MonitorGroup[];
  incidents: Incident[];
}

export function KpiStrip({ groups, incidents }: KpiStripProps) {
  const kpis = useMemo(() => {
    const total    = groups.reduce((a, g) => a + g.total, 0);
    const healthy  = groups.reduce((a, g) => a + g.healthy, 0);
    const degraded = groups.reduce((a, g) => a + g.degraded, 0);
    const down     = groups.reduce((a, g) => a + g.down, 0);
    const openInc  = incidents.filter(i => i.status === 'open').length;
    const rtGroups = groups.filter(g => g.avgResponseTime !== null);
    const avgRt = rtGroups.length > 0
      ? Math.round(rtGroups.reduce((a, g) => a + (g.avgResponseTime as number), 0) / rtGroups.length)
      : null;

    // heartbeat success rate across HB group
    const hbGroup = groups.find(g => g.id === 'heartbeat-jobs');
    const hbRate = hbGroup
      ? ((hbGroup.healthy + hbGroup.degraded) / Math.max(hbGroup.total, 1) * 100).toFixed(0) + '%'
      : '—';

    const apiGroup      = groups.find(g => g.id === 'apis');
    const dockerGroup   = groups.find(g => g.id === 'docker');
    const mcpGroup      = groups.find(g => g.id === 'mcp-services');
    const portGroup     = groups.find(g => g.id === 'ports-tcp');
    const serverGroup   = groups.find(g => g.id === 'servers');

    return {
      total, healthy, degraded, down, openInc,
      avgRt: avgRt !== null ? `${avgRt}ms` : '—',
      hbRate,
      apis:    apiGroup    ? `${apiGroup.uptime.toFixed(1)}%`    : '—',
      docker:  dockerGroup ? `${dockerGroup.uptime.toFixed(0)}%` : '—',
      mcp:     mcpGroup    ? `${mcpGroup.uptime.toFixed(1)}%`    : '—',
      ports:   portGroup   ? `${portGroup.uptime.toFixed(1)}%`   : '—',
      servers: serverGroup ? `${serverGroup.uptime.toFixed(0)}%` : '—',
    };
  }, [groups, incidents]);

  type CellColor = 'green' | 'amber' | 'red' | 'accent' | 'default';

  function downColor(v: number): CellColor {
    if (v === 0) return 'green';
    if (v <= 2) return 'amber';
    return 'red';
  }
  function incColor(v: number): CellColor {
    if (v === 0) return 'green';
    if (v === 1) return 'amber';
    return 'red';
  }

  const colorVar: Record<CellColor, string> = {
    green: 'var(--rzm-green)',
    amber: 'var(--rzm-amber)',
    red: 'var(--rzm-red)',
    accent: 'var(--rzm-accent)',
    default: 'var(--rzm-t1)',
  };

  function Cell({ label, value, color = 'default' }: { label: string; value: string | number; color?: CellColor }) {
    return (
      <div className="rzm-kpi-cell">
        <span className="rzm-kpi-label">{label}</span>
        <span className="rzm-kpi-value" style={{ color: colorVar[color] }}>{value}</span>
      </div>
    );
  }

  const hbHealthColor = (rate: string): CellColor => {
    const n = parseFloat(rate);
    if (isNaN(n)) return 'default';
    if (n >= 90) return 'green';
    if (n >= 60) return 'amber';
    return 'red';
  };

  const uptimeColor = (pct: string): CellColor => {
    const n = parseFloat(pct);
    if (isNaN(n)) return 'default';
    if (n >= 99) return 'green';
    if (n >= 95) return 'amber';
    return 'red';
  };

  return (
    <div className="rzm-kpi-strip">
      <Cell label="TOTAL"    value={kpis.total}    color="default" />
      <Cell label="HEALTHY"  value={kpis.healthy}  color="green" />
      <Cell label="DEGRADED" value={kpis.degraded} color={kpis.degraded > 0 ? 'amber' : 'green'} />
      <Cell label="DOWN"     value={kpis.down}     color={downColor(kpis.down)} />
      <Cell label="INC"      value={kpis.openInc}  color={incColor(kpis.openInc)} />
      <Cell label="AVG RT"   value={kpis.avgRt}    color="default" />
      <Cell label="HB RATE"  value={kpis.hbRate}   color={hbHealthColor(kpis.hbRate)} />
      <Cell label="APIs"     value={kpis.apis}     color={uptimeColor(kpis.apis)} />
      <Cell label="DOCKER"   value={kpis.docker}   color={uptimeColor(kpis.docker)} />
      <Cell label="MCP"      value={kpis.mcp}      color={uptimeColor(kpis.mcp)} />
      <Cell label="PORTS"    value={kpis.ports}    color={uptimeColor(kpis.ports)} />
      <Cell label="SERVERS"  value={kpis.servers}  color={uptimeColor(kpis.servers)} />
    </div>
  );
}
