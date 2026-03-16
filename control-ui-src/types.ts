import type { ReactNode } from "react";

export type PageKey =
  | "home"
  | "overview"
  | "agents"
  | "content"
  | "approvals"
  | "voice"
  | "models"
  | "openclaw"
  | "mcp"
  | "mcp-tools"
  | "tool-store"
  | "protocols"
  | "projects"
  | "memories"
  | "docs"
  | "team"
  | "office"
  | "notes"
  | "calendar"
  | "tasks"
  | "logs"
  | "integrations"
  | "settings";

export type Tone = "info" | "warning" | "error";

export type ContextState = {
  type: string;
  item: any;
} | null;

export type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  route: string;
  tone?: string;
  item: any;
};

export type PageProps = {
  data: any;
  context: ContextState;
  focus: (type: string, item: any) => void;
  openRoute: (route: string, nextContext?: ContextState) => void;
  actions: any;
};

export type PanelProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/* ─── Navigation ─── */

export type NavItem = {
  key: PageKey;
  route: string;
  label: string;
  section: string;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "home",         route: "/",             label: "Home",         section: "" },
  { key: "agents",       route: "/agents",       label: "Agents",       section: "" },
  { key: "voice",        route: "/voice",        label: "Voice",        section: "" },
  { key: "models",       route: "/models",       label: "Models",       section: "" },

  { key: "mcp",          route: "/mcp",          label: "MCP",          section: "Infrastructure" },
  { key: "mcp-tools",    route: "/mcp-tools",    label: "MCP Tools",    section: "Infrastructure" },
  { key: "tool-store",   route: "/tool-store",   label: "Tool Store",   section: "Infrastructure" },
  { key: "openclaw",     route: "/openclaw",     label: "OpenClaw",     section: "Infrastructure" },
  { key: "protocols",    route: "/protocols",     label: "Protocols",    section: "Infrastructure" },

  { key: "projects",     route: "/projects",     label: "Projects",     section: "Workspace" },
  { key: "tasks",        route: "/tasks",        label: "Tasks",        section: "Workspace" },
  { key: "notes",        route: "/notes",        label: "Notes",        section: "Workspace" },
  { key: "calendar",     route: "/calendar",     label: "Calendar",     section: "Workspace" },
  { key: "docs",         route: "/docs",         label: "Docs",         section: "Workspace" },

  { key: "logs",         route: "/logs",         label: "Logs",         section: "System" },
  { key: "integrations", route: "/integrations",  label: "Integrations", section: "System" },
  { key: "settings",     route: "/settings",     label: "Settings",     section: "System" },
];

export const PAGE_META: Record<PageKey, { title: string; description: string }> = {
  home:         { title: "Home",            description: "Your daily workspace." },
  overview:     { title: "Overview",        description: "Global system status." },
  agents:       { title: "Agents",          description: "Manage your AI agent fleet." },
  content:      { title: "Content",         description: "Files and project artifacts." },
  approvals:    { title: "Approvals",       description: "Tasks pending review." },
  voice:        { title: "Voice",           description: "Talk with your agents." },
  models:       { title: "Models",          description: "Model routing and assignments." },
  openclaw:     { title: "OpenClaw",        description: "Runtime and gateway control." },
  mcp:          { title: "MCP",             description: "Server health, transports, and tool exposure." },
  "mcp-tools":  { title: "MCP Tools",       description: "Installed tools across your system." },
  "tool-store": { title: "Tool Store",      description: "Browse and install new MCP tools." },
  protocols:    { title: "Protocols",       description: "Transport layer monitoring." },
  projects:     { title: "Projects",        description: "Active workstreams and execution." },
  memories:     { title: "Memories",        description: "Agent memory and recall." },
  docs:         { title: "Docs",            description: "Reference documentation." },
  team:         { title: "Team",            description: "Organizational structure." },
  office:       { title: "Office",          description: "HQ visualization." },
  notes:        { title: "Notes",           description: "Write and capture." },
  calendar:     { title: "Calendar",        description: "Schedule and events." },
  tasks:        { title: "Tasks",           description: "Execution board." },
  logs:         { title: "Logs",            description: "System telemetry and event trace." },
  integrations: { title: "Integrations",    description: "Connected services." },
  settings:     { title: "Settings",        description: "Workspace preferences." },
};

/* ─── Helpers ─── */

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function routeForPage(page: PageKey) {
  return NAV_ITEMS.find((item) => item.key === page)?.route || "/";
}

export function pageFromPath(pathname: string): PageKey {
  const clean = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return NAV_ITEMS.find((item) => item.route === clean)?.key || "home";
}

export function formatStamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function labelForContext(type: string, item: any) {
  return item?.name || item?.title || item?.label || item?.tool || item?.summary || item?.agent || type;
}

export function badgeTone(value?: string): string {
  const v = (value || "").toLowerCase();
  if (["online", "ok", "healthy", "ready", "enabled", "completed", "verified", "connected", "mounted", "indexed", "configured"].some((t) => v.includes(t))) return "badge-green";
  if (["active", "live", "listening"].some((t) => v.includes(t))) return "badge-red";
  if (["warning", "queued", "standby", "idle", "pending", "recommended", "available", "monitored"].some((t) => v.includes(t))) return "badge-yellow";
  if (["offline", "failed", "error", "missing", "disabled", "degraded", "credentials-required", "not-configured"].some((t) => v.includes(t))) return "badge-red";
  return "badge-neutral";
}

export function dotTone(value?: string): string {
  const v = (value || "").toLowerCase();
  if (["online", "ok", "healthy", "ready", "enabled", "completed", "verified", "connected"].some((t) => v.includes(t))) return "dot-online";
  if (["active", "live"].some((t) => v.includes(t))) return "dot-active";
  if (["warning", "queued", "standby", "pending", "monitored"].some((t) => v.includes(t))) return "dot-warning";
  if (["error", "failed", "offline", "disabled", "degraded"].some((t) => v.includes(t))) return "dot-error";
  return "dot-standby";
}

export function contextRoute(type: string) {
  switch (type) {
    case "agent": return "/agents";
    case "voice": return "/voice";
    case "model": return "/models";
    case "openclaw": return "/openclaw";
    case "mcp": return "/mcp";
    case "tool": return "/mcp-tools";
    case "store-tool": return "/tool-store";
    case "protocol": return "/protocols";
    case "project": return "/projects";
    case "memory": return "/memories";
    case "doc": return "/docs";
    case "team": return "/team";
    case "office": return "/office";
    case "note": return "/notes";
    case "calendar-event": return "/calendar";
    case "task": return "/tasks";
    case "log": return "/logs";
    case "integration": return "/integrations";
    case "setting-section": return "/settings";
    default: return "/";
  }
}

export function statusValue(type: string, item: any) {
  switch (type) {
    case "openclaw": return item.gatewayState;
    case "mcp": return item.serverHealth;
    case "store-tool": return item.installState;
    case "protocol": return item.state;
    case "note": return item.category;
    case "log": return item.level;
    case "setting-section": return "configured";
    case "workspace": return item.systemMode;
    case "office": return item.state;
    default: return item.status || item.state;
  }
}

export function defaultContextForPage(page: PageKey, data: any): ContextState {
  switch (page) {
    case "home":
    case "overview": return { type: "workspace", item: data.workspace };
    case "agents": return { type: "agent", item: data.agents[0] };
    case "content": return { type: "doc", item: data.docs.items[0] };
    case "approvals": return { type: "task", item: data.tasks.approvals?.[0] || data.tasks.tasks[0] };
    case "voice": return { type: "voice", item: data.voice.agents[0] };
    case "models": return { type: "model", item: data.models.catalog[0] };
    case "openclaw": return { type: "openclaw", item: data.openclaw };
    case "mcp": return { type: "mcp", item: data.mcp };
    case "mcp-tools": return { type: "tool", item: data.tools.tools[0] };
    case "tool-store": return { type: "store-tool", item: data.toolStore.featured[0] || data.toolStore.inventory[0] };
    case "protocols": return { type: "protocol", item: data.protocols[0] };
    case "projects": return { type: "project", item: data.projects.items[0] };
    case "memories": return { type: "memory", item: data.memory.vaults[0] };
    case "docs": return { type: "doc", item: data.docs.items[0] };
    case "team": return { type: "team", item: data.team.units[0] };
    case "office": return { type: "office", item: data.office.zones[0] };
    case "notes": return { type: "note", item: data.notes.items[0] };
    case "calendar": return { type: "calendar-event", item: data.calendar.upcoming[0] || data.calendar.events[0] };
    case "tasks": return { type: "task", item: data.tasks.tasks[0] };
    case "logs": return { type: "log", item: data.logs.events[0] };
    case "integrations": return { type: "integration", item: data.integrations.integrations[0] };
    case "settings": return { type: "setting-section", item: data.settings.sections[0] };
    default: return { type: "workspace", item: data.workspace };
  }
}

export function buildSearchResults(data: any, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [] as SearchResult[];

  const all: SearchResult[] = [
    ...data.agents.map((a: any) => ({ id: `a-${a.id}`, type: "agent", title: a.name, subtitle: a.role, route: "/agents", tone: a.status, item: a })),
    ...data.tools.tools.map((t: any) => ({ id: `t-${t.id}`, type: "tool", title: t.name, subtitle: t.category, route: "/mcp-tools", tone: t.status, item: t })),
    ...data.toolStore.inventory.map((t: any) => ({ id: `st-${t.id}`, type: "store-tool", title: t.name, subtitle: t.category, route: "/tool-store", tone: t.installState, item: t })),
    ...data.projects.items.map((p: any) => ({ id: `p-${p.id}`, type: "project", title: p.name, subtitle: p.owner, route: "/projects", tone: p.status, item: p })),
    ...data.notes.items.map((n: any) => ({ id: `n-${n.id}`, type: "note", title: n.title, subtitle: n.folder, route: "/notes", tone: n.category, item: n })),
    ...data.tasks.tasks.map((t: any) => ({ id: `tk-${t.id}`, type: "task", title: t.title, subtitle: t.assignedAgent, route: "/tasks", tone: t.status, item: t })),
    ...data.logs.events.map((e: any) => ({ id: `l-${e.id}`, type: "log", title: e.summary, subtitle: e.stream, route: "/logs", tone: e.level, item: e })),
    ...data.integrations.integrations.map((i: any) => ({ id: `i-${i.id}`, type: "integration", title: i.name, subtitle: i.category, route: "/integrations", tone: i.state, item: i })),
  ];

  return all.filter((e) => `${e.title} ${e.subtitle}`.toLowerCase().includes(q)).slice(0, 10);
}

export function dayKey(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value));
}

export function monthCells(events: any[]) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 35 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = dayKey(d.toISOString());
    return {
      date: d, key: k, label: `${d.getDate()}`,
      currentMonth: d.getMonth() === today.getMonth(),
      today: k === dayKey(today.toISOString()),
      events: events.filter((e) => dayKey(e.start) === k),
    };
  });
}
