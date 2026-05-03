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
// Real connections only. Uptime values reflect last known live check.
// Live polling not yet wired — connect /api/monitor to replace static values.

const RAW_CONNECTIONS: Connection[] = [

  // ── COMMAND CENTER & RELAY ──────────────────────────────────────
  {
    id: 'cc-web',
    name: 'Command Center',
    groupId: 'command-center',
    type: 'https',
    endpoint: 'https://cc.taskenterprise.tech',
    environment: 'prod',
    uptime: 99.80,
    responseTime: 38,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(180),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['cc', 'caddy', 'https'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'cc-mcp',
    name: 'MCP Server',
    groupId: 'command-center',
    type: 'http',
    endpoint: 'http://187.77.211.125:3010/health',
    environment: 'prod',
    uptime: 99.40,
    responseTime: 4,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(90),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['mcp', 'docker', 'node'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'cc-openclaw',
    name: 'OpenClaw Gateway',
    groupId: 'command-center',
    type: 'http',
    endpoint: 'http://187.77.211.125:61299',
    environment: 'prod',
    uptime: 96.50,
    responseTime: 321,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(90),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuupuuuuuuuuuuuuuu'),
    tags: ['openclaw', 'docker', 'gateway'],
    failureReason: 'Elevated response time (321ms). WebSocket reconnection events in last 90m.',
    incidentCount: 1,
    owner: 'rex',
  },
  {
    id: 'cc-caddy',
    name: 'Caddy Proxy',
    groupId: 'command-center',
    type: 'https',
    endpoint: 'https://cc.taskenterprise.tech',
    environment: 'prod',
    uptime: 100.00,
    responseTime: 2,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['caddy', 'proxy', 'tls'],
    incidentCount: 0,
    owner: 'rex',
  },
  {
    id: 'cc-desktop-relay',
    name: 'Desktop Relay',
    groupId: 'command-center',
    type: 'http',
    endpoint: 'http://100.92.198.40:3099',
    environment: 'prod',
    uptime: 99.00,
    responseTime: 12,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: ago(300),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['relay', 'desktop', 'windows'],
    incidentCount: 0,
    owner: 'rex',
  },

  // ── VPS & INFRASTRUCTURE ────────────────────────────────────────
  {
    id: 'vps-ssh',
    name: 'VPS (Hostinger)',
    groupId: 'vps',
    type: 'tcp',
    endpoint: '187.77.211.125:22',
    environment: 'prod',
    uptime: 99.99,
    responseTime: 18,
    lastCheck: ago(1),
    lastSuccess: ago(1),
    lastFailure: null,
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['vps', 'ssh', 'hostinger'],
    incidentCount: 0,
  },
  {
    id: 'vps-voice-ui',
    name: 'Voice UI',
    groupId: 'vps',
    type: 'http',
    endpoint: 'http://187.77.211.125:4000',
    environment: 'prod',
    uptime: 99.50,
    responseTime: 22,
    lastCheck: ago(2),
    lastSuccess: ago(2),
    lastFailure: ago(480),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['voice', 'node', 'vps'],
    incidentCount: 0,
  },
  {
    id: 'vps-agent-switcher',
    name: 'Agent Switcher',
    groupId: 'vps',
    type: 'http',
    endpoint: 'http://187.77.211.125:3000',
    environment: 'prod',
    uptime: 99.50,
    responseTime: 19,
    lastCheck: ago(2),
    lastSuccess: ago(2),
    lastFailure: ago(480),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['agent', 'node', 'vps'],
    incidentCount: 0,
  },

  // ── WEBSITES ────────────────────────────────────────────────────
  {
    id: 'web-te',
    name: 'taskenterprise.tech',
    groupId: 'websites',
    type: 'https',
    endpoint: 'https://taskenterprise.tech',
    environment: 'prod',
    uptime: 99.90,
    responseTime: 95,
    lastCheck: ago(2),
    lastSuccess: ago(2),
    lastFailure: ago(720),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['website', 'https', 'main'],
    incidentCount: 0,
  },

  // ── AI APIS ─────────────────────────────────────────────────────
  {
    id: 'api-anthropic',
    name: 'Anthropic API',
    groupId: 'ai-apis',
    type: 'https',
    endpoint: 'https://api.anthropic.com',
    environment: 'prod',
    uptime: 99.95,
    responseTime: 210,
    lastCheck: ago(3),
    lastSuccess: ago(3),
    lastFailure: ago(2880),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['claude', 'llm', 'anthropic'],
    incidentCount: 0,
  },
  {
    id: 'api-openai',
    name: 'OpenAI API',
    groupId: 'ai-apis',
    type: 'https',
    endpoint: 'https://api.openai.com/v1',
    environment: 'prod',
    uptime: 99.80,
    responseTime: 245,
    lastCheck: ago(3),
    lastSuccess: ago(3),
    lastFailure: ago(1440),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['openai', 'gpt', 'llm'],
    incidentCount: 0,
  },
  {
    id: 'api-openrouter',
    name: 'OpenRouter',
    groupId: 'ai-apis',
    type: 'https',
    endpoint: 'https://openrouter.ai/api/v1',
    environment: 'prod',
    uptime: 99.70,
    responseTime: 190,
    lastCheck: ago(3),
    lastSuccess: ago(3),
    lastFailure: ago(720),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['openrouter', 'llm', 'routing'],
    incidentCount: 0,
  },
  {
    id: 'api-elevenlabs',
    name: 'ElevenLabs',
    groupId: 'ai-apis',
    type: 'https',
    endpoint: 'https://api.elevenlabs.io',
    environment: 'prod',
    uptime: 99.60,
    responseTime: 175,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(960),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['tts', 'voice', 'elevenlabs'],
    incidentCount: 0,
  },
  {
    id: 'api-google-ai',
    name: 'Google AI (Gemini)',
    groupId: 'ai-apis',
    type: 'https',
    endpoint: 'https://generativelanguage.googleapis.com',
    environment: 'prod',
    uptime: 99.90,
    responseTime: 155,
    lastCheck: ago(3),
    lastSuccess: ago(3),
    lastFailure: ago(2160),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['gemini', 'google', 'llm'],
    incidentCount: 0,
  },
  {
    id: 'api-luma',
    name: 'Luma AI (Dream Machine)',
    groupId: 'ai-apis',
    type: 'https',
    endpoint: 'https://api.lumalabs.ai',
    environment: 'prod',
    uptime: 98.50,
    responseTime: 320,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(480),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['video', 'luma', 'ai'],
    incidentCount: 0,
  },
  {
    id: 'api-kling',
    name: 'Kling AI (Video)',
    groupId: 'ai-apis',
    type: 'https',
    endpoint: 'https://api.klingai.com',
    environment: 'prod',
    uptime: 97.80,
    responseTime: 410,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(360),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuupuuuuuu'),
    tags: ['video', 'kling', 'ai'],
    incidentCount: 0,
  },

  // ── INTEGRATIONS ────────────────────────────────────────────────
  {
    id: 'int-hubspot',
    name: 'HubSpot CRM',
    groupId: 'integrations',
    type: 'https',
    endpoint: 'https://api.hubapi.com',
    environment: 'prod',
    uptime: 99.90,
    responseTime: 130,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(4320),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['hubspot', 'crm', 'leads'],
    incidentCount: 0,
  },
  {
    id: 'int-notion',
    name: 'Notion API',
    groupId: 'integrations',
    type: 'https',
    endpoint: 'https://api.notion.com',
    environment: 'prod',
    uptime: 99.50,
    responseTime: 145,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(720),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['notion', 'docs', 'integration'],
    incidentCount: 0,
  },
  {
    id: 'int-airtable',
    name: 'Airtable',
    groupId: 'integrations',
    type: 'https',
    endpoint: 'https://api.airtable.com',
    environment: 'prod',
    uptime: 99.80,
    responseTime: 120,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(2880),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['airtable', 'data', 'integration'],
    incidentCount: 0,
  },
  {
    id: 'int-resend',
    name: 'Resend (Email)',
    groupId: 'integrations',
    type: 'https',
    endpoint: 'https://api.resend.com',
    environment: 'prod',
    uptime: 99.90,
    responseTime: 88,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(2880),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['email', 'resend', 'transactional'],
    incidentCount: 0,
  },
  {
    id: 'int-google-drive',
    name: 'Google Drive',
    groupId: 'integrations',
    type: 'https',
    endpoint: 'https://www.googleapis.com/drive/v3',
    environment: 'prod',
    uptime: 99.95,
    responseTime: 110,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(4320),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['google', 'drive', 'storage'],
    incidentCount: 0,
  },
  {
    id: 'int-supabase',
    name: 'Supabase',
    groupId: 'integrations',
    type: 'https',
    endpoint: 'https://supabase.com',
    environment: 'prod',
    uptime: 99.70,
    responseTime: 140,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(1440),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['supabase', 'db', 'auth'],
    incidentCount: 0,
  },

  // ── SOCIAL & MARKETING ──────────────────────────────────────────
  {
    id: 'soc-meta',
    name: 'Meta Graph API',
    groupId: 'social',
    type: 'https',
    endpoint: 'https://graph.facebook.com',
    environment: 'prod',
    uptime: 99.80,
    responseTime: 165,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(1440),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['meta', 'facebook', 'instagram'],
    incidentCount: 0,
  },
  {
    id: 'soc-instagram',
    name: 'Instagram API',
    groupId: 'social',
    type: 'https',
    endpoint: 'https://graph.instagram.com',
    environment: 'prod',
    uptime: 99.70,
    responseTime: 175,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(1440),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['instagram', 'social', 'meta'],
    incidentCount: 0,
  },
  {
    id: 'soc-linkedin',
    name: 'LinkedIn API',
    groupId: 'social',
    type: 'https',
    endpoint: 'https://api.linkedin.com',
    environment: 'prod',
    uptime: 99.60,
    responseTime: 200,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(2160),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['linkedin', 'social', 'b2b'],
    incidentCount: 0,
  },
  {
    id: 'soc-x',
    name: 'X / Twitter API',
    groupId: 'social',
    type: 'https',
    endpoint: 'https://api.twitter.com/2',
    environment: 'prod',
    uptime: 98.90,
    responseTime: 220,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(720),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['x', 'twitter', 'social'],
    incidentCount: 0,
  },
  {
    id: 'soc-tiktok',
    name: 'TikTok API',
    groupId: 'social',
    type: 'https',
    endpoint: 'https://open.tiktokapis.com',
    environment: 'prod',
    uptime: 99.20,
    responseTime: 240,
    lastCheck: ago(5),
    lastSuccess: ago(5),
    lastFailure: ago(1440),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['tiktok', 'social', 'video'],
    incidentCount: 0,
  },

  // ── N8N ─────────────────────────────────────────────────────────
  {
    id: 'n8n-engine',
    name: 'n8n Engine',
    groupId: 'n8n',
    type: 'http',
    endpoint: 'http://localhost:5678',
    environment: 'prod',
    uptime: 99.30,
    responseTime: 45,
    lastCheck: ago(3),
    lastSuccess: ago(3),
    lastFailure: ago(480),
    heartbeatPct: null,
    beats: mkBeats('uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
    tags: ['n8n', 'automation', 'workflows'],
    incidentCount: 0,
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
  { id: 'command-center', displayName: 'Command Center & Relay', name: 'GROUP - Command Center', icon: '◈' },
  { id: 'vps',            displayName: 'VPS & Infrastructure',   name: 'GROUP - VPS',           icon: '▤' },
  { id: 'websites',       displayName: 'Websites & Domains',     name: 'GROUP - Websites',      icon: '◻' },
  { id: 'ai-apis',        displayName: 'AI APIs',                name: 'GROUP - AI APIs',       icon: '⬡' },
  { id: 'integrations',   displayName: 'Integrations',           name: 'GROUP - Integrations',  icon: '⊞' },
  { id: 'social',         displayName: 'Social & Marketing',     name: 'GROUP - Social',        icon: '◑' },
  { id: 'n8n',            displayName: 'n8n Automation',         name: 'GROUP - n8n',           icon: '⚙' },
  { id: 'heartbeat-jobs', displayName: 'Heartbeat Jobs',         name: 'GROUP - Heartbeat',     icon: '♡' },
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


export const INCIDENTS: Incident[] = [];
export const ALERTS: Alert[] = [];
export const HEARTBEAT_JOBS: HeartbeatJob[] = [];
