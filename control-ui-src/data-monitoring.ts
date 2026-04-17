/* ─── Rex Command Zone — Monitoring Data Model & Mock Data ─── */

// ── Types ───────────────────────────────────────────────────────

export type HealthLevel = 'optimal' | 'stable' | 'watch' | 'degraded' | 'critical' | 'unknown' | 'paused' | 'maintenance';
export type Beat = 'u' | 'd' | 'e' | 'p' | 'm';
export type ConnectionType = 'https' | 'http' | 'tcp' | 'ping' | 'heartbeat' | 'docker' | 'dns' | 'ssl' | 'push';
export type Environment = 'prod' | 'staging' | 'dev';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ActionId = 'refresh' | 'health-check' | 'retry' | 'reconnect' | 'restart' | 'mute' | 'incident' | 'ask-rex' | 'run-diagnostics' | 'test-heartbeat' | 'verify-ssl' | 'verify-dns' | 'inspect-logs';

export interface Connection {
  id: string;
  name: string;
  groupId: string;
  type: ConnectionType;
  endpoint: string;
  environment: Environment;
  uptime: number;
  responseTime: number | null;
  lastCheck: string;
  lastSuccess: string | null;
  lastFailure: string | null;
  heartbeatPct: number | null;
  beats: Beat[];
  tags: string[];
  failureReason?: string;
  incidentCount: number;
  owner?: string;
}

export interface MonitorGroup {
  id: string;
  name: string;
  displayName: string;
  icon: string;
  connections: Connection[];
  uptime: number;
  health: HealthLevel;
  total: number;
  healthy: number;
  degraded: number;
  down: number;
  alerts: number;
  avgResponseTime: number | null;
  lastIncident: string | null;
}

export interface Incident {
  id: string;
  connectionId: string;
  groupId: string;
  connectionName: string;
  title: string;
  severity: IncidentSeverity;
  status: 'open' | 'acknowledged' | 'resolved';
  startTime: string;
  duration: string;
  description: string;
  suggestedActions: string[];
  rexNote: string;
}

export interface Alert {
  id: string;
  type: 'down' | 'degraded' | 'heartbeat_miss' | 'ssl_expiry' | 'latency_spike';
  connectionId: string;
  connectionName: string;
  groupId: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  timestamp: string;
}

export interface HeartbeatJob {
  id: string;
  connectionId: string;
  name: string;
  expectedIntervalMin: number;
  lastReceived: string | null;
  consecutiveMisses: number;
  successRate24h: number;
  schedule: string;
  workerNode: string | null;
  status: 'active' | 'missed' | 'critical' | 'unknown';
  failureReason: string;
  suggestedFix: string;
}

export interface RexMessage {
  id: string;
  role: 'rex' | 'user';
  content: string;
  timestamp: string;
}

export interface DiagResult {
  check: string;
  status: 'pass' | 'fail' | 'warn' | 'running';
  detail: string;
}

// Keep old types exported so the old pages-monitoring.tsx imports don't break at module level
// (they will be replaced entirely, but this prevents cascade errors during transition)
export type ServiceStatus = 'healthy' | 'warning' | 'degraded' | 'down' | 'unknown' | 'reconnecting' | 'stale';
export type ServicePriority = 'P0' | 'P1' | 'P2' | 'P3';
export type ConnectionState = 'connected' | 'disconnected' | 'unstable' | 'reconnecting' | 'stale' | 'unknown';
export type ActionState = 'idle' | 'running' | 'success' | 'failed';
export type ServiceGroup = string;
export interface MonitoredService { id: string; name: string; group: ServiceGroup; status: ServiceStatus; [k: string]: unknown; }
export const MOCK_SERVICES: MonitoredService[] = [];
export const SERVICE_GROUPS: ServiceGroup[] = [];
export function getServiceById(id: string): MonitoredService | undefined { return MOCK_SERVICES.find(s => s.id === id); }

// ── Helpers ─────────────────────────────────────────────────────

export function calcHealth(uptime: number): HealthLevel {
  if (uptime >= 99.5) return 'optimal';
  if (uptime >= 98.0) return 'stable';
  if (uptime >= 95.0) return 'watch';
  if (uptime >= 80.0) return 'degraded';
  if (uptime > 0)     return 'critical';
  return 'critical';
}

export function healthLabel(h: HealthLevel): string {
  switch (h) {
    case 'optimal':     return 'Optimal';
    case 'stable':      return 'Stable';
    case 'watch':       return 'Watch';
    case 'degraded':    return 'Degraded';
    case 'critical':    return 'Critical';
    case 'paused':      return 'Paused';
    case 'maintenance': return 'Maintenance';
    default:            return 'Unknown';
  }
}

export function healthColor(h: HealthLevel): string {
  switch (h) {
    case 'optimal':     return 'optimal';
    case 'stable':      return 'stable';
    case 'watch':       return 'watch';
    case 'degraded':    return 'degraded';
    case 'critical':    return 'critical';
    case 'paused':      return 'paused';
    case 'maintenance': return 'watch';
    default:            return 'unknown';
  }
}

function mkBeats(pattern: string): Beat[] {
  return Array.from(pattern) as Beat[];
}

function ago(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60 * 1000);
  return d.toISOString();
}

// ── Raw Connection Data ──────────────────────────────────────────

const RAW_CONNECTIONS: Connection[] = [
  // GROUP: apis
  {
    id: 'api-openai',
    name: 'OpenAI API Gateway',
    groupId: 'apis',
    type: 'https',
    endpoint: 'https://api.openai.com/v1/models',
    environment: 'prod',
    uptime: 99.12,
    responseTime: 187,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(720),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['ai', 'external', 'llm'],
    incidentCount: 1,
    owner: 'rex',
  },
  {
    id: 'api-anthropic',
    name: 'Anthropic Claude API',
    groupId: 'apis',
    type: 'https',
    endpoint: 'https://api.anthropic.com/v1/messages',
    environment: 'prod',
    uptime: 98.54,
    responseTime: 211,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(1440),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['ai', 'external', 'claude'],
    incidentCount: 2,
    owner: 'rex',
  },
  {
    id: 'api-notion',
    name: 'Notion API',
    groupId: 'apis',
    type: 'https',
    endpoint: 'https://api.notion.com/v1/users/me',
    environment: 'prod',
    uptime: 94.30,
    responseTime: 445,
    lastCheck: ago(2),
    lastSuccess: ago(2),
    lastFailure: ago(180),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuupuuuuuuuuu'),
    tags: ['productivity', 'external'],
    failureReason: 'Latency spike detected: 445ms (+312% above 108ms baseline). Rate limit headers present.',
    incidentCount: 3,
    owner: 'rex',
  },
  {
    id: 'api-github',
    name: 'GitHub API',
    groupId: 'apis',
    type: 'https',
    endpoint: 'https://api.github.com/user',
    environment: 'prod',
    uptime: 99.89,
    responseTime: 143,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(4320),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['vcs', 'external'],
    incidentCount: 0,
    owner: 'rex',
  },

  // GROUP: automation
  {
    id: 'n8n-main',
    name: 'n8n Workflow Engine',
    groupId: 'automation',
    type: 'https',
    endpoint: 'https://n8n.internal/healthz',
    environment: 'prod',
    uptime: 99.92,
    responseTime: 34,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(10080),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['automation', 'internal'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'n8n-webhooks',
    name: 'n8n Webhook Listener',
    groupId: 'automation',
    type: 'https',
    endpoint: 'https://n8n.internal/webhook-test',
    environment: 'prod',
    uptime: 99.71,
    responseTime: 51,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(2880),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['automation', 'webhooks'],
    incidentCount: 1,
    owner: 'rex',
  },
  {
    id: 'n8n-scheduler',
    name: 'n8n Job Scheduler',
    groupId: 'automation',
    type: 'https',
    endpoint: 'https://n8n.internal/healthz/scheduler',
    environment: 'prod',
    uptime: 99.74,
    responseTime: 28,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(5760),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['automation', 'scheduler'],
    incidentCount: 0,
    owner: 'rex',
  },

  // GROUP: command-center
  {
    id: 'cc-main',
    name: 'Command Center UI',
    groupId: 'command-center',
    type: 'https',
    endpoint: 'https://cc.internal',
    environment: 'prod',
    uptime: 99.12,
    responseTime: 77,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(720),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['ui', 'internal'],
    incidentCount: 1,
    owner: 'rex',
  },
  {
    id: 'cc-openclaw',
    name: 'OpenClaw Gateway',
    groupId: 'command-center',
    type: 'https',
    endpoint: 'https://openclaw.internal/health',
    environment: 'prod',
    uptime: 94.18,
    responseTime: 321,
    lastCheck: ago(3),
    lastSuccess: ago(3),
    lastFailure: ago(90),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuupuuuuuuuuuuuuuuuuu'),
    tags: ['gateway', 'mcp'],
    failureReason: 'Response time elevated: 321ms. WebSocket reconnection loop detected in last 90 minutes.',
    incidentCount: 2,
    owner: 'rex',
  },
  {
    id: 'cc-desktop-relay',
    name: 'Desktop Relay',
    groupId: 'command-center',
    type: 'tcp',
    endpoint: 'localhost:9999',
    environment: 'prod',
    uptime: 98.47,
    responseTime: 445,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(360),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuupuuuuuuuuuuuu'),
    tags: ['relay', 'local'],
    failureReason: 'Latency spike: 445ms (+312% above 107ms baseline). Possible local network congestion.',
    incidentCount: 1,
    owner: 'rex',
  },

  // GROUP: docker
  {
    id: 'docker-postgres',
    name: 'PostgreSQL Container',
    groupId: 'docker',
    type: 'docker',
    endpoint: 'docker://postgres-prod',
    environment: 'prod',
    uptime: 100,
    responseTime: 4,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['database', 'docker'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'docker-redis',
    name: 'Redis Cache Container',
    groupId: 'docker',
    type: 'docker',
    endpoint: 'docker://redis-prod',
    environment: 'prod',
    uptime: 100,
    responseTime: 2,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['cache', 'docker'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'docker-n8n',
    name: 'n8n Docker Container',
    groupId: 'docker',
    type: 'docker',
    endpoint: 'docker://n8n',
    environment: 'prod',
    uptime: 100,
    responseTime: 8,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['automation', 'docker'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'docker-uptime-kuma',
    name: 'Uptime Kuma Container',
    groupId: 'docker',
    type: 'docker',
    endpoint: 'docker://uptime-kuma',
    environment: 'prod',
    uptime: 100,
    responseTime: 6,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['monitoring', 'docker'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'docker-traefik',
    name: 'Traefik Reverse Proxy',
    groupId: 'docker',
    type: 'docker',
    endpoint: 'docker://traefik',
    environment: 'prod',
    uptime: 100,
    responseTime: 3,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['proxy', 'docker'],
    incidentCount: 0,
    owner: 'rex',
  },

  // GROUP: experimental
  {
    id: 'exp-codex-dev',
    name: 'Codex Dev Server',
    groupId: 'experimental',
    type: 'https',
    endpoint: 'https://codex-dev.internal',
    environment: 'dev',
    uptime: 97.12,
    responseTime: 312,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(240),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuduuuuuuuuu'),
    tags: ['dev', 'experimental'],
    failureReason: 'Intermittent 502 errors from backend service restart.',
    incidentCount: 2,
    owner: 'dev-team',
  },
  {
    id: 'exp-voice-beta',
    name: 'Voice Agent Beta',
    groupId: 'experimental',
    type: 'https',
    endpoint: 'https://voice-beta.internal/ping',
    environment: 'dev',
    uptime: 94.80,
    responseTime: 189,
    lastCheck: ago(3),
    lastSuccess: ago(3),
    lastFailure: ago(120),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuduuuuuuuu'),
    tags: ['voice', 'experimental'],
    failureReason: 'WebRTC signaling timeout on 2 of last 20 checks.',
    incidentCount: 1,
    owner: 'dev-team',
  },
  {
    id: 'exp-memory-v2',
    name: 'Memory Engine v2',
    groupId: 'experimental',
    type: 'https',
    endpoint: 'https://memory-v2.internal/health',
    environment: 'staging',
    uptime: 96.70,
    responseTime: 224,
    lastCheck: ago(2),
    lastSuccess: ago(2),
    lastFailure: ago(480),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['memory', 'experimental'],
    incidentCount: 1,
    owner: 'dev-team',
  },

  // GROUP: heartbeat-jobs
  {
    id: 'hb-project2-strike',
    name: 'HEARTBEAT - Project2 Strike Run',
    groupId: 'heartbeat-jobs',
    type: 'heartbeat',
    endpoint: 'push://kuma/heartbeat/project2-strike',
    environment: 'prod',
    uptime: 0,
    responseTime: null,
    lastCheck: ago(263),
    lastSuccess: ago(263),
    lastFailure: ago(5),
    heartbeatPct: 0,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuudddddddddddddddd'),
    tags: ['heartbeat', 'project2', 'critical'],
    failureReason: 'No heartbeat received in 4h 23m. Expected every 30 minutes. Worker node \'strike-runner\' unresponsive. Job scheduler DB entry: LOCKED state since 04:12 UTC.',
    incidentCount: 4,
    owner: 'project2',
  },
  {
    id: 'hb-daily-backup',
    name: 'HEARTBEAT - Daily Backup Job',
    groupId: 'heartbeat-jobs',
    type: 'heartbeat',
    endpoint: 'push://kuma/heartbeat/daily-backup',
    environment: 'prod',
    uptime: 0,
    responseTime: null,
    lastCheck: ago(1560),
    lastSuccess: ago(1560),
    lastFailure: ago(10),
    heartbeatPct: 0,
    beats: mkBeats('uuuuuuuuuuuudddddddddddddddddddddddddddddd'),
    tags: ['heartbeat', 'backup', 'critical'],
    failureReason: 'Daily backup job has not reported in 26 hours. Expected every 24h. Last successful run: yesterday 02:00 UTC. Disk space check pending.',
    incidentCount: 2,
    owner: 'ops',
  },
  {
    id: 'hb-notion-sync',
    name: 'HEARTBEAT - Notion Sync',
    groupId: 'heartbeat-jobs',
    type: 'heartbeat',
    endpoint: 'push://kuma/heartbeat/notion-sync',
    environment: 'prod',
    uptime: 45.20,
    responseTime: null,
    lastCheck: ago(35),
    lastSuccess: ago(35),
    lastFailure: ago(65),
    heartbeatPct: 45.20,
    beats: mkBeats('ududuududududuuuuduuddududududuududduuduuuu'),
    tags: ['heartbeat', 'notion'],
    failureReason: 'Intermittent failures. Missing 11 of 20 expected heartbeats in last 24h. Notion API rate limiting suspected.',
    incidentCount: 3,
    owner: 'rex',
  },
  {
    id: 'hb-memory-index',
    name: 'HEARTBEAT - Memory Indexer',
    groupId: 'heartbeat-jobs',
    type: 'heartbeat',
    endpoint: 'push://kuma/heartbeat/memory-index',
    environment: 'prod',
    uptime: 78.40,
    responseTime: null,
    lastCheck: ago(12),
    lastSuccess: ago(12),
    lastFailure: ago(180),
    heartbeatPct: 78.40,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuduuuuduuuuuu'),
    tags: ['heartbeat', 'memory'],
    failureReason: 'Degraded: 4 missed heartbeats in last 24h. Worker appears healthy; scheduler timing drift suspected.',
    incidentCount: 1,
    owner: 'rex',
  },

  // GROUP: mcp-services
  {
    id: 'mcp-codex',
    name: 'Codex MCP Server',
    groupId: 'mcp-services',
    type: 'https',
    endpoint: 'http://localhost:3001/health',
    environment: 'prod',
    uptime: 99.12,
    responseTime: 22,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(720),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['mcp', 'codex'],
    incidentCount: 1,
    owner: 'rex',
  },
  {
    id: 'mcp-memory',
    name: 'Memory MCP Service',
    groupId: 'mcp-services',
    type: 'https',
    endpoint: 'http://localhost:3002/health',
    environment: 'prod',
    uptime: 97.26,
    responseTime: 31,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(480),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['mcp', 'memory'],
    incidentCount: 1,
    owner: 'rex',
  },
  {
    id: 'mcp-tools-gateway',
    name: 'Tools Gateway MCP',
    groupId: 'mcp-services',
    type: 'https',
    endpoint: 'http://localhost:3003/health',
    environment: 'prod',
    uptime: 95.40,
    responseTime: 44,
    lastCheck: ago(2),
    lastSuccess: ago(2),
    lastFailure: ago(120),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuupuuuuuuuuuu'),
    tags: ['mcp', 'tools'],
    failureReason: 'Periodic timeout on tool schema validation endpoint. Non-critical path.',
    incidentCount: 2,
    owner: 'rex',
  },

  // GROUP: ports-tcp
  {
    id: 'port-postgres',
    name: 'PostgreSQL Port 5432',
    groupId: 'ports-tcp',
    type: 'tcp',
    endpoint: 'localhost:5432',
    environment: 'prod',
    uptime: 100,
    responseTime: 1,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['tcp', 'database'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'port-redis',
    name: 'Redis Port 6379',
    groupId: 'ports-tcp',
    type: 'tcp',
    endpoint: 'localhost:6379',
    environment: 'prod',
    uptime: 100,
    responseTime: 1,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['tcp', 'cache'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'port-mcp',
    name: 'MCP HTTP Port 3001',
    groupId: 'ports-tcp',
    type: 'tcp',
    endpoint: 'localhost:3001',
    environment: 'prod',
    uptime: 91.80,
    responseTime: 2,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(240),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuduuduuuuuuu'),
    tags: ['tcp', 'mcp'],
    failureReason: 'Port briefly unresponsive during MCP server restart cycles. Auto-recovered.',
    incidentCount: 2,
    owner: 'rex',
  },

  // GROUP: security
  {
    id: 'sec-ssl-main',
    name: 'SSL Certificate — Main Domain',
    groupId: 'security',
    type: 'ssl',
    endpoint: 'https://rex.internal',
    environment: 'prod',
    uptime: 100,
    responseTime: 45,
    lastCheck: ago(30),
    lastSuccess: ago(30),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['ssl', 'security'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'sec-dns-check',
    name: 'DNS Resolution Check',
    groupId: 'security',
    type: 'dns',
    endpoint: 'rex.internal',
    environment: 'prod',
    uptime: 100,
    responseTime: 12,
    lastCheck: ago(15),
    lastSuccess: ago(15),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['dns', 'security'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'sec-auth-endpoint',
    name: 'Auth Service Endpoint',
    groupId: 'security',
    type: 'https',
    endpoint: 'https://auth.internal/health',
    environment: 'prod',
    uptime: 100,
    responseTime: 67,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['auth', 'security'],
    incidentCount: 0,
    owner: 'rex',
  },

  // GROUP: servers
  {
    id: 'srv-main',
    name: 'Main VPS Host',
    groupId: 'servers',
    type: 'ping',
    endpoint: '192.168.1.100',
    environment: 'prod',
    uptime: 100,
    responseTime: 8,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['server', 'vps'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'srv-worker',
    name: 'Worker Node (strike-runner)',
    groupId: 'servers',
    type: 'ping',
    endpoint: '192.168.1.101',
    environment: 'prod',
    uptime: 100,
    responseTime: 6,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['server', 'worker'],
    incidentCount: 0,
    owner: 'rex',
  },
];

// ── Group Definitions ────────────────────────────────────────────

interface GroupDef {
  id: string;
  name: string;
  displayName: string;
  icon: string;
}

const GROUP_DEFS: GroupDef[] = [
  { id: 'apis',            name: 'GROUP - APIs',                          displayName: 'APIs',                     icon: '⬡' },
  { id: 'automation',      name: 'GROUP - Automation / n8n',              displayName: 'Automation / n8n',         icon: '⚙' },
  { id: 'command-center',  name: 'GROUP - Command Center / OpenClaw',     displayName: 'Command Center',           icon: '◈' },
  { id: 'docker',          name: 'GROUP - Docker / Containers',           displayName: 'Docker / Containers',      icon: '▣' },
  { id: 'experimental',    name: 'GROUP - Experimental / Dev',            displayName: 'Experimental / Dev',       icon: '⚗' },
  { id: 'heartbeat-jobs',  name: 'GROUP - Heartbeat Jobs',                displayName: 'Heartbeat Jobs',           icon: '♡' },
  { id: 'mcp-services',    name: 'GROUP - MCP Services',                  displayName: 'MCP Services',             icon: '◉' },
  { id: 'ports-tcp',       name: 'GROUP - Ports / TCP',                   displayName: 'Ports / TCP',              icon: '⇄' },
  { id: 'security',        name: 'GROUP - Security / Reliability',        displayName: 'Security / Reliability',   icon: '⊕' },
  { id: 'servers',         name: 'GROUP - Servers / Hosts',               displayName: 'Servers / Hosts',          icon: '▤' },
];

function buildGroups(): MonitorGroup[] {
  return GROUP_DEFS.map(def => {
    const conns = RAW_CONNECTIONS.filter(c => c.groupId === def.id);
    const total = conns.length;
    const uptimes = conns.map(c => c.uptime);
    const avgUptime = total > 0 ? uptimes.reduce((a, b) => a + b, 0) / total : 100;
    const healthy = conns.filter(c => c.uptime >= 98).length;
    const degraded = conns.filter(c => c.uptime >= 50 && c.uptime < 98).length;
    const down = conns.filter(c => c.uptime < 50).length;
    const alerts = conns.filter(c => c.failureReason).length;
    const rtConns = conns.filter(c => c.responseTime !== null);
    const avgResponseTime = rtConns.length > 0
      ? Math.round(rtConns.reduce((a, c) => a + (c.responseTime as number), 0) / rtConns.length)
      : null;
    const failures = conns.filter(c => c.lastFailure).sort((a, b) =>
      new Date(b.lastFailure!).getTime() - new Date(a.lastFailure!).getTime()
    );
    const lastIncident = failures.length > 0 ? failures[0].lastFailure : null;

    return {
      id: def.id,
      name: def.name,
      displayName: def.displayName,
      icon: def.icon,
      connections: conns,
      uptime: Math.round(avgUptime * 100) / 100,
      health: calcHealth(avgUptime),
      total,
      healthy,
      degraded,
      down,
      alerts,
      avgResponseTime,
      lastIncident,
    };
  });
}

export const GROUPS: MonitorGroup[] = buildGroups();

// ── Incidents ────────────────────────────────────────────────────

export const INCIDENTS: Incident[] = [
  {
    id: 'inc-001',
    connectionId: 'hb-project2-strike',
    groupId: 'heartbeat-jobs',
    connectionName: 'HEARTBEAT - Project2 Strike Run',
    title: 'Project2 Strike Run — Heartbeat DEAD',
    severity: 'critical',
    status: 'open',
    startTime: ago(263),
    duration: '4h 23m',
    description: 'The Project2 Strike Run heartbeat job has not reported since 04:12 UTC. The worker node "strike-runner" is reachable via ping but shows no active job processes. Scheduler DB shows a LOCKED state entry that was not released after the previous run at 02:42 UTC.',
    suggestedActions: [
      'SSH into strike-runner and check ps aux | grep strike',
      'Inspect scheduler DB: SELECT * FROM jobs WHERE status=\'LOCKED\'',
      'Force-release lock and re-trigger: ./run-job strike-run --force',
      'Monitor next 3 heartbeat cycles before closing',
    ],
    rexNote: 'This is the same scheduler lock pattern seen in incident inc-004 (2025-12-14). Root cause was an OOM kill mid-job. Check dmesg on strike-runner for OOM events.',
  },
  {
    id: 'inc-002',
    connectionId: 'hb-daily-backup',
    groupId: 'heartbeat-jobs',
    connectionName: 'HEARTBEAT - Daily Backup Job',
    title: 'Daily Backup — 26h Overdue',
    severity: 'critical',
    status: 'open',
    startTime: ago(1560),
    duration: '26h 0m',
    description: 'The daily backup cron job has not reported a heartbeat in over 26 hours. The last successful run was yesterday at 02:00 UTC. This is a data integrity risk.',
    suggestedActions: [
      'Verify backup cron entry: crontab -l | grep backup',
      'Check cron daemon logs: journalctl -u cron --since yesterday',
      'Manually trigger backup and confirm heartbeat delivery',
    ],
    rexNote: 'If backup data from yesterday is missing, priority is to run an emergency backup immediately before investigating the scheduler.',
  },
  {
    id: 'inc-003',
    connectionId: 'api-notion',
    groupId: 'apis',
    connectionName: 'Notion API',
    title: 'Notion API Latency Spike',
    severity: 'high',
    status: 'acknowledged',
    startTime: ago(180),
    duration: '3h 0m',
    description: 'Notion API response time has risen from 108ms baseline to 445ms (+312%). Rate limit headers are present in responses, suggesting approaching quota limits.',
    suggestedActions: [
      'Review Notion API usage dashboard',
      'Reduce polling frequency in n8n Notion sync workflow',
      'Consider implementing request caching',
    ],
    rexNote: 'Notion has a 3 requests/second limit per integration. Current n8n workflows may be hitting this during peak automation runs.',
  },
];

// ── Alerts ───────────────────────────────────────────────────────

export const ALERTS: Alert[] = [
  {
    id: 'alert-001',
    type: 'heartbeat_miss',
    connectionId: 'hb-project2-strike',
    connectionName: 'Project2 Strike Run',
    groupId: 'heartbeat-jobs',
    message: 'No heartbeat in 4h 23m. Expected every 30 min. Worker node unresponsive.',
    severity: 'critical',
    timestamp: ago(263),
  },
  {
    id: 'alert-002',
    type: 'heartbeat_miss',
    connectionId: 'hb-daily-backup',
    connectionName: 'Daily Backup Job',
    groupId: 'heartbeat-jobs',
    message: 'Backup job 26h overdue. Last run: yesterday 02:00 UTC. Possible data loss.',
    severity: 'critical',
    timestamp: ago(1560),
  },
  {
    id: 'alert-003',
    type: 'latency_spike',
    connectionId: 'api-notion',
    connectionName: 'Notion API',
    groupId: 'apis',
    message: 'Latency 445ms (+312% above 108ms baseline). Rate limiting suspected.',
    severity: 'high',
    timestamp: ago(180),
  },
  {
    id: 'alert-004',
    type: 'latency_spike',
    connectionId: 'cc-desktop-relay',
    connectionName: 'Desktop Relay',
    groupId: 'command-center',
    message: 'Response time 445ms (+312% above 107ms baseline). Local network congestion.',
    severity: 'high',
    timestamp: ago(60),
  },
  {
    id: 'alert-005',
    type: 'degraded',
    connectionId: 'hb-notion-sync',
    connectionName: 'Notion Sync Heartbeat',
    groupId: 'heartbeat-jobs',
    message: 'Heartbeat success rate: 45.2%. Missing 11 of 20 expected beats in 24h.',
    severity: 'medium',
    timestamp: ago(35),
  },
];

// ── Heartbeat Jobs ───────────────────────────────────────────────

export const HEARTBEAT_JOBS: HeartbeatJob[] = [
  {
    id: 'hbjob-001',
    connectionId: 'hb-project2-strike',
    name: 'Project2 Strike Run',
    expectedIntervalMin: 30,
    lastReceived: ago(263),
    consecutiveMisses: 8,
    successRate24h: 0,
    schedule: 'Every 30 minutes',
    workerNode: 'strike-runner',
    status: 'critical',
    failureReason: 'No heartbeat received in 4h 23m. Expected every 30 minutes. Worker node \'strike-runner\' unresponsive. Scheduler DB entry locked since 04:12 UTC.',
    suggestedFix: 'SSH to strike-runner → check ps aux | grep strike → inspect scheduler DB for LOCKED state → force-release and re-trigger job.',
  },
  {
    id: 'hbjob-002',
    connectionId: 'hb-daily-backup',
    name: 'Daily Backup Job',
    expectedIntervalMin: 1440,
    lastReceived: ago(1560),
    consecutiveMisses: 1,
    successRate24h: 0,
    schedule: 'Daily at 02:00 UTC',
    workerNode: null,
    status: 'critical',
    failureReason: 'Daily backup job has not reported in 26 hours. Expected every 24h. Last successful run: yesterday 02:00 UTC.',
    suggestedFix: 'Check crontab -l | grep backup and journalctl -u cron. Manually trigger backup immediately to prevent data gap.',
  },
  {
    id: 'hbjob-003',
    connectionId: 'hb-notion-sync',
    name: 'Notion Sync',
    expectedIntervalMin: 60,
    lastReceived: ago(35),
    consecutiveMisses: 0,
    successRate24h: 45.2,
    schedule: 'Every 60 minutes',
    workerNode: 'main-server',
    status: 'missed',
    failureReason: 'Intermittent failures. 11 of 20 expected heartbeats missing in 24h. Notion API rate limiting suspected.',
    suggestedFix: 'Review Notion API rate limits. Reduce n8n workflow polling frequency. Consider implementing exponential backoff.',
  },
  {
    id: 'hbjob-004',
    connectionId: 'hb-memory-index',
    name: 'Memory Indexer',
    expectedIntervalMin: 120,
    lastReceived: ago(12),
    consecutiveMisses: 0,
    successRate24h: 78.4,
    schedule: 'Every 2 hours',
    workerNode: 'main-server',
    status: 'missed',
    failureReason: 'Degraded: 4 missed heartbeats in last 24h. Scheduler timing drift suspected.',
    suggestedFix: 'Check scheduler timing drift. Consider adding ±5min tolerance window. Monitor for next 3 cycles.',
  },
];
