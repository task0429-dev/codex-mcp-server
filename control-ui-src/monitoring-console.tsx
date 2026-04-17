/* ─── Rex Command Zone — Right Console ─── */

import { useMemo, useState } from 'react';
import { cn, formatRelative } from './types';
import {
  calcHealth, healthColor, healthLabel,
  type ActionId, type Alert, type Beat, type Connection,
  type HeartbeatJob, type HealthLevel, type Incident, type MonitorGroup,
} from './data-monitoring';

// ── Beat Strip ───────────────────────────────────────────────────

function beatClass(b: Beat): string {
  switch (b) {
    case 'u': return 'rzm-beat rzm-beat-u';
    case 'd': return 'rzm-beat rzm-beat-d';
    case 'e': return 'rzm-beat rzm-beat-e';
    case 'p': return 'rzm-beat rzm-beat-p';
    case 'm': return 'rzm-beat rzm-beat-m';
  }
}

function BeatStrip({ beats, height = 14 }: { beats: Beat[]; height?: number }) {
  return (
    <div className="rzm-beats">
      {beats.map((b, i) => (
        <div key={i} className={beatClass(b)} style={{ height: b === 'e' ? 4 : b === 'd' ? height : Math.round(height * 0.7) }} />
      ))}
    </div>
  );
}

function HealthPill({ health }: { health: HealthLevel }) {
  return <span className={`rzm-pill rzm-pill-${healthColor(health)}`}>{healthLabel(health)}</span>;
}

// ── Status Dot ───────────────────────────────────────────────────

function StatusDot({ uptime }: { uptime: number }) {
  const h = calcHealth(uptime);
  return <span className={`rzm-status-dot rzm-status-dot-${healthColor(h)}`} />;
}

// ── SVG Uptime Arc ───────────────────────────────────────────────

function UptimeArc({ uptime }: { uptime: number }) {
  const r = 36;
  const cx = 44;
  const cy = 44;
  const circ = 2 * Math.PI * r;
  const frac = Math.min(uptime / 100, 1);
  const dash = frac * circ;
  const h = calcHealth(uptime);
  const colors: Record<string, string> = {
    optimal: 'var(--rzm-green)',
    stable: 'var(--rzm-cyan)',
    watch: 'var(--rzm-blue)',
    degraded: 'var(--rzm-amber)',
    critical: 'var(--rzm-red)',
    paused: 'var(--rzm-t3)',
    maintenance: 'var(--rzm-blue)',
    unknown: 'var(--rzm-t3)',
  };
  const color = colors[h] ?? 'var(--rzm-t3)';
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
      <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="11" fontWeight="900" fontFamily="var(--rzm-font)">
        {uptime.toFixed(1)}%
      </text>
    </svg>
  );
}

// ── View A: Global Overview ───────────────────────────────────────

interface GlobalOverviewProps {
  groups: MonitorGroup[];
  incidents: Incident[];
  alerts: Alert[];
}

function GlobalOverview({ groups, incidents, alerts }: GlobalOverviewProps) {
  const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'acknowledged');
  const recentFailures = groups
    .flatMap(g => g.connections)
    .filter(c => c.lastFailure && c.uptime < 99)
    .sort((a, b) => new Date(b.lastFailure!).getTime() - new Date(a.lastFailure!).getTime())
    .slice(0, 5);

  const insights = [
    'Heartbeat Jobs group is at 20.35% — 2 jobs have been offline >4 hours. Immediate action required.',
    'Desktop Relay latency spiked to 445ms (+312% above 107ms baseline). Local network congestion suspected.',
    'All Docker containers reporting 100% uptime — last 48h clean. No action needed.',
  ];

  return (
    <div className="rzm-console-body">
      {/* Active Incidents */}
      <div className="rzm-section-label">ACTIVE INCIDENTS</div>
      {openIncidents.length === 0 ? (
        <div className="rzm-empty-state" style={{ padding: '16px 20px' }}>No open incidents</div>
      ) : (
        openIncidents.map(inc => (
          <div key={inc.id} className={`rzm-incident-row rzm-incident-${inc.severity}`}>
            <div className="rzm-incident-header">
              <span className={`rzm-pill rzm-pill-${inc.severity === 'critical' ? 'critical' : inc.severity === 'high' ? 'degraded' : 'watch'}`}>
                {inc.severity.toUpperCase()}
              </span>
              <span className="rzm-incident-name">{inc.connectionName}</span>
              <span className="rzm-incident-duration">{inc.duration}</span>
            </div>
            <div className="rzm-incident-title">{inc.title}</div>
            {inc.suggestedActions[0] && (
              <div className="rzm-incident-action">→ {inc.suggestedActions[0]}</div>
            )}
          </div>
        ))
      )}

      {/* Recent Failures */}
      <div className="rzm-section-label" style={{ marginTop: 4 }}>RECENT FAILURES</div>
      {recentFailures.length === 0 ? (
        <div className="rzm-empty-state" style={{ padding: '16px 20px' }}>No recent failures</div>
      ) : (
        recentFailures.map(c => (
          <div key={c.id} className="rzm-failure-row">
            <StatusDot uptime={c.uptime} />
            <div className="rzm-failure-info">
              <span className="rzm-failure-name">{c.name}</span>
              {c.failureReason && (
                <span className="rzm-failure-reason">{c.failureReason.slice(0, 70)}…</span>
              )}
            </div>
            <span className="rzm-failure-time">{c.lastFailure ? formatRelative(c.lastFailure) : '—'}</span>
          </div>
        ))
      )}

      {/* Rex Insights */}
      <div className="rzm-section-label" style={{ marginTop: 4 }}>◈ REX INSIGHTS</div>
      {insights.map((ins, i) => (
        <div key={i} className="rzm-insight-row">
          <span className="rzm-insight-bullet">▸</span>
          <span className="rzm-insight-text">{ins}</span>
        </div>
      ))}
    </div>
  );
}

// ── View B: Group Selected ────────────────────────────────────────

interface GroupViewProps {
  group: MonitorGroup;
  selectedConnectionId: string | null;
  onSelectConnection: (id: string) => void;
  onAction: (connId: string, action: ActionId) => void;
  actionStates: Record<string, 'idle' | 'running' | 'success' | 'error'>;
}

function GroupView({ group, selectedConnectionId, onSelectConnection, onAction, actionStates }: GroupViewProps) {
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return group.connections.filter(c => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const h = calcHealth(c.uptime);
      const matchHealth = healthFilter === 'all' || h === healthFilter;
      return matchSearch && matchHealth;
    });
  }, [group.connections, search, healthFilter]);

  return (
    <>
      <div className="rzm-console-header">
        <span>{group.icon} {group.displayName}</span>
        <HealthPill health={group.health} />
      </div>
      <div className="rzm-group-view-bar">
        <input
          className="rzm-search rzm-search-sm"
          placeholder="Filter connections…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="rzm-select"
          value={healthFilter}
          onChange={e => setHealthFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="optimal">Optimal</option>
          <option value="stable">Stable</option>
          <option value="watch">Watch</option>
          <option value="degraded">Degraded</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <div className="rzm-console-body">
        {filtered.map(c => {
          const h = calcHealth(c.uptime);
          const isActive = c.id === selectedConnectionId;
          const retryKey = `${c.id}-retry`;
          const checkKey = `${c.id}-check`;
          return (
            <div
              key={c.id}
              className={cn('rzm-conn-row', isActive && 'active')}
              onClick={() => onSelectConnection(c.id)}
            >
              <StatusDot uptime={c.uptime} />
              <div className="rzm-conn-info">
                <span className="rzm-conn-name">{c.name}</span>
                <div className="rzm-conn-meta">
                  <span className="rzm-badge rzm-badge-type">{c.type}</span>
                  <span className={`rzm-conn-uptime rzm-health-${healthColor(h)}`}>{c.uptime.toFixed(1)}%</span>
                  {c.responseTime !== null && (
                    <span className="rzm-conn-rt">{c.responseTime}ms</span>
                  )}
                  <span className="rzm-conn-check">{formatRelative(c.lastCheck)}</span>
                </div>
              </div>
              <div className="rzm-conn-actions" onClick={e => e.stopPropagation()}>
                <button
                  className="rzm-icon-btn rzm-icon-btn-sm"
                  title="Retry"
                  onClick={() => onAction(c.id, 'retry')}
                  disabled={actionStates[retryKey] === 'running'}
                >
                  {actionStates[retryKey] === 'running' ? <span className="rzm-spinner" /> : '⟳'}
                </button>
                <button
                  className="rzm-icon-btn rzm-icon-btn-sm"
                  title="Health Check"
                  onClick={() => onAction(c.id, 'health-check')}
                  disabled={actionStates[checkKey] === 'running'}
                >
                  {actionStates[checkKey] === 'running' ? <span className="rzm-spinner" /> : '⊕'}
                </button>
                <button
                  className="rzm-icon-btn rzm-icon-btn-sm"
                  title="Ask Rex"
                  onClick={() => onAction(c.id, 'ask-rex')}
                >
                  ◈
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rzm-empty-state">No connections match filter</div>
        )}
      </div>
    </>
  );
}

// ── View C: Connection Detail ─────────────────────────────────────

interface ConnectionDetailProps {
  conn: Connection;
  group: MonitorGroup;
  onAction: (connId: string, action: ActionId) => void;
  actionStates: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  onOpenRex: (context: string) => void;
}

function ConnectionDetail({ conn, group, onAction, actionStates, onOpenRex }: ConnectionDetailProps) {
  const [rexInput, setRexInput] = useState('');
  const h = calcHealth(conn.uptime);
  const isFailed = conn.uptime < 50;
  const isDegraded = conn.uptime >= 50 && conn.uptime < 98;

  const rexContext = `${conn.name} — ${conn.uptime}%${conn.failureReason ? ' — ' + conn.failureReason.slice(0, 60) : ''}`;

  const quickActions: { id: ActionId; icon: string; label: string; variant?: 'ghost' | 'danger' | 'amber' }[] = [
    { id: 'health-check',   icon: '⊕', label: 'Health Check' },
    { id: 'retry',          icon: '⟳', label: 'Retry' },
    { id: 'reconnect',      icon: '↻', label: 'Reconnect' },
    { id: 'inspect-logs',   icon: '◻', label: 'Logs' },
    { id: 'verify-ssl',     icon: '⊗', label: 'Verify SSL' },
    { id: 'verify-dns',     icon: '⬡', label: 'Verify DNS' },
    { id: 'test-heartbeat', icon: '♡', label: 'Test HB' },
    { id: 'run-diagnostics',icon: '⊛', label: 'Diagnose', variant: 'amber' },
  ];

  const quickPrompts = ['Why is this failing?', 'Suggest recovery', 'What changed recently?'];

  function isRunning(action: ActionId) {
    return actionStates[`${conn.id}-${action}`] === 'running';
  }

  return (
    <div className="rzm-console-body rzm-detail-view">
      {/* Detail Header */}
      <div className="rzm-detail-header">
        <div className="rzm-detail-name">{conn.name}</div>
        <div className="rzm-detail-badges">
          <HealthPill health={h} />
          <span className="rzm-badge rzm-badge-group">{group.displayName}</span>
          <span className="rzm-badge rzm-badge-env">{conn.environment.toUpperCase()}</span>
          <span className="rzm-badge rzm-badge-type">{conn.type}</span>
        </div>
      </div>

      {/* Health Ring + Metrics */}
      <div className="rzm-detail-health">
        <UptimeArc uptime={conn.uptime} />
        <div className="rzm-detail-metrics-grid">
          <div className="rzm-detail-metric">
            <span className="rzm-label">Uptime</span>
            <span className={`rzm-detail-metric-val rzm-health-${healthColor(h)}`}>{conn.uptime.toFixed(2)}%</span>
          </div>
          <div className="rzm-detail-metric">
            <span className="rzm-label">Response</span>
            <span className="rzm-detail-metric-val">{conn.responseTime !== null ? `${conn.responseTime}ms` : '—'}</span>
          </div>
          <div className="rzm-detail-metric">
            <span className="rzm-label">Last Success</span>
            <span className="rzm-detail-metric-val">{conn.lastSuccess ? formatRelative(conn.lastSuccess) : '—'}</span>
          </div>
          <div className="rzm-detail-metric">
            <span className="rzm-label">Incidents</span>
            <span className="rzm-detail-metric-val">{conn.incidentCount}</span>
          </div>
        </div>
      </div>

      {/* Heartbeat Section */}
      {conn.type === 'heartbeat' && conn.heartbeatPct !== null && (
        <div className="rzm-detail-section">
          <div className="rzm-label rzm-section-mini-label">HEARTBEAT STATUS</div>
          <div className="rzm-hb-row">
            <div className="rzm-detail-metric">
              <span className="rzm-label">Success Rate</span>
              <span className={`rzm-detail-metric-val rzm-health-${healthColor(calcHealth(conn.heartbeatPct))}`}>
                {conn.heartbeatPct.toFixed(1)}%
              </span>
            </div>
            <div className="rzm-detail-metric">
              <span className="rzm-label">Last Received</span>
              <span className="rzm-detail-metric-val">{conn.lastSuccess ? formatRelative(conn.lastSuccess) : 'Never'}</span>
            </div>
          </div>
          <div className="rzm-hb-progress-bar">
            <div className="rzm-hb-progress-fill" style={{ width: `${conn.heartbeatPct}%` }} />
          </div>
        </div>
      )}

      {/* Beat History */}
      <div className="rzm-detail-section">
        <div className="rzm-label rzm-section-mini-label">BEAT HISTORY (40 checks)</div>
        <div style={{ padding: '6px 0' }}>
          <BeatStrip beats={conn.beats} height={22} />
        </div>
      </div>

      {/* Failure Info */}
      {(isFailed || isDegraded) && conn.failureReason && (
        <div className="rzm-detail-failure">
          <div className="rzm-detail-failure-label">⚡ FAILURE DETAILS</div>
          <div className="rzm-detail-failure-text">{conn.failureReason}</div>
          <div className="rzm-detail-failure-actions">
            <button className="rzm-btn rzm-btn-danger" onClick={() => onAction(conn.id, 'run-diagnostics')}>
              {isRunning('run-diagnostics') ? <span className="rzm-spinner" /> : '⊛'} Diagnose
            </button>
            <button className="rzm-btn rzm-btn-amber" onClick={() => onAction(conn.id, 'retry')}>
              {isRunning('retry') ? <span className="rzm-spinner" /> : '⟳'} Retry
            </button>
            <button className="rzm-btn rzm-btn-ghost" onClick={() => onOpenRex(rexContext)}>
              ◈ Ask Rex
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions Grid */}
      <div className="rzm-detail-section">
        <div className="rzm-label rzm-section-mini-label">QUICK ACTIONS</div>
        <div className="rzm-quick-actions-grid">
          {quickActions.map(qa => (
            <button
              key={qa.id}
              className={`rzm-btn rzm-btn-${qa.variant ?? 'ghost'} rzm-quick-action-btn`}
              onClick={() => onAction(conn.id, qa.id)}
              disabled={isRunning(qa.id)}
              title={qa.label}
            >
              {isRunning(qa.id) ? <span className="rzm-spinner" /> : <span>{qa.icon}</span>}
              <span>{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Connection Details */}
      <div className="rzm-detail-section">
        <div className="rzm-label rzm-section-mini-label">CONNECTION DETAILS</div>
        <div className="rzm-kv-list">
          <div className="rzm-kv-row">
            <span className="rzm-kv-key">Endpoint</span>
            <span className="rzm-kv-val rzm-mono">{conn.endpoint}</span>
          </div>
          <div className="rzm-kv-row">
            <span className="rzm-kv-key">Environment</span>
            <span className="rzm-kv-val">{conn.environment}</span>
          </div>
          {conn.owner && (
            <div className="rzm-kv-row">
              <span className="rzm-kv-key">Owner</span>
              <span className="rzm-kv-val">{conn.owner}</span>
            </div>
          )}
          {conn.tags.length > 0 && (
            <div className="rzm-kv-row">
              <span className="rzm-kv-key">Tags</span>
              <span className="rzm-kv-val">{conn.tags.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Ask Rex Module */}
      <div className="rzm-detail-section rzm-ask-rex-module">
        <div className="rzm-label rzm-section-mini-label">◈ ASK REX</div>
        <div className="rzm-rex-context-badge">{rexContext}</div>
        <div className="rzm-rex-quick-prompts">
          {quickPrompts.map(p => (
            <button
              key={p}
              className="rzm-rex-prompt-pill"
              onClick={() => onOpenRex(`${rexContext}\n\n${p}`)}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="rzm-rex-inline-input">
          <input
            className="rzm-rex-input"
            placeholder="Ask about this connection…"
            value={rexInput}
            onChange={e => setRexInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && rexInput.trim()) {
                onOpenRex(`${rexContext}\n\n${rexInput.trim()}`);
                setRexInput('');
              }
            }}
          />
          <button
            className="rzm-btn rzm-btn-primary"
            disabled={!rexInput.trim()}
            onClick={() => {
              if (rexInput.trim()) {
                onOpenRex(`${rexContext}\n\n${rexInput.trim()}`);
                setRexInput('');
              }
            }}
          >
            ⟶
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RightConsole ─────────────────────────────────────────────────

interface RightConsoleProps {
  groups: MonitorGroup[];
  incidents: Incident[];
  alerts: Alert[];
  heartbeatJobs: HeartbeatJob[];
  selectedGroupId: string | null;
  selectedConnectionId: string | null;
  onSelectConnection: (id: string) => void;
  onAction: (connId: string, action: ActionId) => void;
  actionStates: Record<string, 'idle' | 'running' | 'success' | 'error'>;
  onOpenRex: (context: string) => void;
}

export function RightConsole({
  groups, incidents, alerts,
  selectedGroupId, selectedConnectionId,
  onSelectConnection, onAction, actionStates, onOpenRex,
}: RightConsoleProps) {
  const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId) ?? null : null;
  const selectedConn = selectedConnectionId
    ? groups.flatMap(g => g.connections).find(c => c.id === selectedConnectionId) ?? null
    : null;
  const connGroup = selectedConn ? groups.find(g => g.id === selectedConn.groupId) ?? null : null;

  if (selectedConn && connGroup) {
    return (
      <div className="rzm-console">
        <div className="rzm-console-header">
          <span>◈ CONNECTION DETAIL</span>
          <button className="rzm-icon-btn rzm-icon-btn-sm" onClick={() => onSelectConnection('')} title="Close">×</button>
        </div>
        <ConnectionDetail
          conn={selectedConn}
          group={connGroup}
          onAction={onAction}
          actionStates={actionStates}
          onOpenRex={onOpenRex}
        />
      </div>
    );
  }

  if (selectedGroup) {
    return (
      <div className="rzm-console">
        <GroupView
          group={selectedGroup}
          selectedConnectionId={selectedConnectionId}
          onSelectConnection={onSelectConnection}
          onAction={onAction}
          actionStates={actionStates}
        />
      </div>
    );
  }

  return (
    <div className="rzm-console">
      <div className="rzm-console-header">
        <span>◈ OVERVIEW</span>
        <span className="rzm-console-header-hint">Select a group →</span>
      </div>
      <GlobalOverview groups={groups} incidents={incidents} alerts={alerts} />
    </div>
  );
}
