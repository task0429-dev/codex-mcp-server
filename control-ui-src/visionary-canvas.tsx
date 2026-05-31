import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { REGISTRY, REGISTRY_MAP } from "./visionary-registry";
import { NAMED_FLOWS, CROSS_EDGES } from "./visionary-connections";
import { LAYOUT, getPos, arcEdgePath, flowPath, fitCameraOrbital, UNIVERSE_RADIUS, UNIVERSE_DIAMETER } from "./visionary-layout";
import { InspectorPanel, GapsOverlay, SystemExplorer } from "./visionary-inspector";
import { AgentAvatar, agentColor, AGENT_ORDER } from "./agent-constants";
import { LandmarkNode, DistrictTerritories, DistrictConnectors, PerimeterShield, StructuralConduits, Starfield, WorldBackground } from "./visionary-world";
import type { EcosystemNode, CameraState } from "./visionary-types";

// ── System Data Model ─────────────────────────────────────────────────────────

type SystemStatus = "live" | "planned" | "gap" | "broken" | "warning" | "improving" | "local" | "external";

interface SystemNode {
  id: string;
  name: string;
  category: string;
  layer: string;
  status: SystemStatus;
  health?: number;
  priority?: "low" | "medium" | "high" | "critical";
  ownerAgent?: "Claude" | "Codex" | "C2" | "Manual" | "Unassigned" | "Abdi" | "Ayub" | "Rex" | "Sygma" | "Ahmed" | "Prime" | "Dame" | "Atlas";
  description: string;
  dependencies: string[];
  connectedTo: string[];
  gaps: string[];
  nextActions: string[];
  routes?: string[];
  services?: string[];
  repoPaths?: string[];
  deploymentStatus?: string;
  port?: string;
}

interface Cluster {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  angle: number;
  systems: SystemNode[];
}

// ── 10 Clusters ───────────────────────────────────────────────────────────────

const CLUSTERS: Cluster[] = [
  {
    id: "revenue",
    label: "BUSINESS & GROWTH",
    sublabel: "Revenue & Output",
    icon: "💰",
    color: "#f59e0b",
    angle: 270,
    systems: [
      {
        id: "biz.revenue", name: "Revenue Delivery", category: "revenue", layer: "output",
        status: "live", health: 85, priority: "critical", ownerAgent: "Abdi",
        description: "Paid services delivered — Tech Rescue + AI Packages + Sygma House → client output",
        dependencies: ["portal.billing", "auto.n8n"], connectedTo: ["website", "portal"],
        gaps: ["No automated billing tracking", "Client feedback loop missing"],
        nextActions: ["Wire Stripe to client portal", "Set up revenue dashboard"],
        deploymentStatus: "Active — manual tracking",
      },
      {
        id: "biz.tech-rescue", name: "Tech Rescue", category: "revenue", layer: "service",
        status: "live", health: 90, priority: "high", ownerAgent: "Sygma",
        description: "Emergency tech support · hourly/project · entry-point lead capture",
        dependencies: ["public.lead-capture"], connectedTo: ["portal.dashboard"],
        gaps: ["No automated intake form routing"],
        nextActions: ["Connect Calendly → n8n → Supabase"],
      },
      {
        id: "biz.sygma-house", name: "Sygma House", category: "revenue", layer: "service",
        status: "live", health: 80, priority: "high", ownerAgent: "Sygma",
        description: "Assisted-living care management · recurring care contract revenue",
        dependencies: [], connectedTo: ["auto.n8n"],
        gaps: ["Care scheduling not automated"],
        nextActions: ["Build care schedule workflow in n8n"],
      },
      {
        id: "biz.ai-packages", name: "AI Service Packages", category: "revenue", layer: "product",
        status: "live", health: 75, priority: "critical", ownerAgent: "Abdi",
        description: "Starter / Growth / Enterprise tiers · primary MRR model",
        dependencies: ["portal.billing", "portal.dashboard"], connectedTo: ["portal"],
        gaps: ["No self-service portal", "Stripe billing not connected"],
        nextActions: ["Build portal auth", "Connect Stripe webhooks"],
      },
      {
        id: "biz.trading", name: "Trading Systems", category: "revenue", layer: "automation",
        status: "local", health: 60, priority: "medium", ownerAgent: "Prime",
        description: "Desktop automation on broker windows · Prime agent + OpenClaw bridge",
        dependencies: ["mcp.openclaw"], connectedTo: ["agents.prime"],
        gaps: ["Local only — not deployable to VPS"],
        nextActions: ["Research VPS-compatible trading setup"],
      },
    ],
  },
  {
    id: "website",
    label: "WEBSITE & MARKETING",
    sublabel: "Public Presence",
    icon: "🌐",
    color: "#ec4899",
    angle: 302,
    systems: [
      {
        id: "public.site", name: "taskenterprise.tech", category: "website", layer: "frontend",
        status: "live", health: 95, priority: "high", ownerAgent: "Atlas",
        description: "Vercel · Next.js · brand + services + agent showcase + WebGL atmosphere",
        dependencies: ["vps.vercel", "vps.cloudflare"], connectedTo: ["portal", "revenue"],
        gaps: ["WebGL atmosphere visibility unconfirmed on some devices"],
        nextActions: ["Verify atmosphere on mobile", "Add case study page"],
        deploymentStatus: "Vercel auto-deploy from GitHub main",
        routes: ["taskenterprise.tech"],
      },
      {
        id: "public.services", name: "Services Pages", category: "website", layer: "frontend",
        status: "live", health: 90, priority: "high", ownerAgent: "Atlas",
        description: "Tech Rescue / AI consulting / packages · conversion pages → Calendly",
        dependencies: ["public.site"], connectedTo: ["public.lead-capture"],
        gaps: ["No A/B testing", "CTA conversion not tracked"],
        nextActions: ["Add conversion tracking", "Build trust/social proof page"],
      },
      {
        id: "public.lead-capture", name: "Lead Capture", category: "website", layer: "integration",
        status: "planned", health: 0, priority: "critical", ownerAgent: "Abdi",
        description: "Intake forms + Calendly embed → n8n webhook → Supabase leads table (NOT YET BUILT)",
        dependencies: ["auto.n8n", "data.supabase"], connectedTo: ["auto.leads"],
        gaps: ["Supabase leads table not created", "n8n webhook not wired", "Calendly integration pending"],
        nextActions: ["Create leads table in Supabase", "Wire Calendly → n8n webhook", "Test end-to-end flow"],
      },
      {
        id: "public.cloudflare", name: "Cloudflare DNS/CDN", category: "website", layer: "infra",
        status: "external", health: 99, priority: "high", ownerAgent: "Rex",
        description: "DNS + DDoS + Cloudflare Tunnel · routes cc.taskenterprise.tech without exposing VPS IP",
        dependencies: [], connectedTo: ["vps.caddy"],
        gaps: [],
        nextActions: [],
      },
    ],
  },
  {
    id: "portal",
    label: "CLIENT PORTAL / SaaS",
    sublabel: "Self-Service Access",
    icon: "🏛️",
    color: "#06b6d4",
    angle: 334,
    systems: [
      {
        id: "portal.auth", name: "Portal Auth", category: "portal", layer: "backend",
        status: "planned", health: 0, priority: "critical", ownerAgent: "Ayub",
        description: "Supabase Auth · JWT middleware · RBAC · client vs admin roles — NOT YET BUILT",
        dependencies: ["data.supabase"], connectedTo: ["portal.billing", "portal.dashboard"],
        gaps: ["Auth system not built", "No RBAC defined", "No JWT middleware"],
        nextActions: ["Spec auth flow", "Build Supabase Auth integration", "Define role schema"],
      },
      {
        id: "portal.billing", name: "Stripe Billing", category: "portal", layer: "backend",
        status: "planned", health: 0, priority: "critical", ownerAgent: "Ayub",
        description: "Subscription tiers + feature gates · Stripe webhook → VPS endpoint — NOT YET BUILT",
        dependencies: ["portal.auth", "c2.runtime"], connectedTo: ["biz.ai-packages"],
        gaps: ["Stripe not connected", "No webhook endpoint", "No feature gating"],
        nextActions: ["Create Stripe account + products", "Build webhook handler", "Implement tier gating"],
      },
      {
        id: "portal.dashboard", name: "Client Dashboard", category: "portal", layer: "frontend",
        status: "planned", health: 0, priority: "high", ownerAgent: "Ayub",
        description: "Project status + request tracking + AI tool access — NOT YET BUILT",
        dependencies: ["portal.auth", "portal.billing"], connectedTo: ["biz.revenue"],
        gaps: ["Entire dashboard not built"],
        nextActions: ["Design wireframes", "Build React dashboard", "Connect to Supabase"],
      },
    ],
  },
  {
    id: "c2",
    label: "C2 COMMAND CENTER",
    sublabel: "Command & Control",
    icon: "🎛️",
    color: "#dc2626",
    angle: 6,
    systems: [
      {
        id: "c2.runtime", name: "C2 Runtime :3000", category: "c2", layer: "backend",
        status: "live", health: 92, priority: "critical", ownerAgent: "Ayub",
        description: "Express server · serves all C2 UI tabs + 48 /api routes · Docker container task-command-center",
        dependencies: ["vps.docker", "c2.redis"], connectedTo: ["mcp.server", "agents"],
        gaps: ["No health endpoint monitoring", "No graceful shutdown"],
        nextActions: ["Add /health endpoint", "Wire to Kuma monitor"],
        deploymentStatus: "Docker: task-command-center",
        port: ":3000",
        routes: ["cc.taskenterprise.tech"],
      },
      {
        id: "c2.redis", name: "Redis Cache :6379", category: "c2", layer: "backend",
        status: "warning", health: 70, priority: "high", ownerAgent: "Rex",
        description: "In-memory sessions + agent state + queue locks · no AOF persistence → data lost on restart",
        dependencies: ["vps.docker"], connectedTo: ["c2.runtime"],
        gaps: ["AOF persistence OFF — all sessions lost on restart"],
        nextActions: ["Enable Redis AOF persistence", "Configure max memory policy"],
        port: ":6379",
      },
      {
        id: "c2.voice", name: "Voice Interface", category: "c2", layer: "feature",
        status: "live", health: 88, priority: "high", ownerAgent: "Claude",
        description: "Web Speech API STT + gpt-4o-transcribe + ElevenLabs TTS · live at /visionary",
        dependencies: ["c2.runtime", "mcp.openrouter"], connectedTo: ["agents"],
        gaps: ["No conversation persistence beyond session"],
        nextActions: ["Store conversations to Supabase"],
      },
      {
        id: "c2.visionary", name: "Visionary Board", category: "c2", layer: "feature",
        status: "live", health: 95, priority: "medium", ownerAgent: "Claude",
        description: "THIS board · full Task Enterprise Systems Universe · hub-and-spoke ecosystem map",
        dependencies: ["c2.runtime"], connectedTo: ["cortex.registry"],
        gaps: ["No live health polling — registry-based only"],
        nextActions: ["Add live health polling to node status"],
      },
      {
        id: "c2.projects", name: "Projects Tab", category: "c2", layer: "feature",
        status: "live", health: 85, priority: "medium", ownerAgent: "Sygma",
        description: "C2 projects view — plan/resources/process/status per project",
        dependencies: ["c2.runtime"], connectedTo: ["data.supabase"],
        gaps: ["Supabase table not yet wired"],
        nextActions: ["Create projects table", "Wire to Projects tab API"],
      },
      {
        id: "c2.memory-tab", name: "Memory Tab", category: "c2", layer: "feature",
        status: "live", health: 80, priority: "medium", ownerAgent: "Ahmed",
        description: "Claude + Codex memory vaults · Notion sync view · ~/.claude/projects on VPS",
        dependencies: ["cortex.memory", "data.notion"], connectedTo: ["agents.ahmed"],
        gaps: ["Codex memory not synced to VPS"],
        nextActions: ["Sync Codex memory to VPS path"],
      },
    ],
  },
  {
    id: "ai",
    label: "AI & AUTOMATION",
    sublabel: "Agent Workforce",
    icon: "🤖",
    color: "#f97316",
    angle: 38,
    systems: [
      {
        id: "agents.abdi", name: "Abdi — CEO/Strategist", category: "agent", layer: "ai",
        status: "live", health: 95, priority: "critical", ownerAgent: "Abdi",
        description: "openai/gpt-5.4 · strategy + prioritization + delegation + voice tab primary",
        dependencies: ["mcp.server", "mcp.openrouter"], connectedTo: ["c2.voice", "agents"],
        gaps: [],
        nextActions: ["Improve delegation routing logic"],
      },
      {
        id: "agents.ayub", name: "Ayub — Builder", category: "agent", layer: "ai",
        status: "live", health: 95, priority: "critical", ownerAgent: "Ayub",
        description: "openai/gpt-5.3-codex · all production code · MCP filesystem + git + build tools",
        dependencies: ["mcp.server", "mcp.relay"], connectedTo: ["c2.runtime", "vps.github"],
        gaps: [],
        nextActions: ["Wire to CI/CD pipeline when built"],
      },
      {
        id: "agents.claude", name: "Claude — Primary AI", category: "agent", layer: "ai",
        status: "live", health: 98, priority: "critical", ownerAgent: "Claude",
        description: "Anthropic claude-sonnet-4-6 · full board access + voice + memory + planning",
        dependencies: ["mcp.server"], connectedTo: ["cortex.memory", "c2.voice"],
        gaps: [],
        nextActions: [],
      },
      {
        id: "agents.codex", name: "Codex — CLI Execution", category: "agent", layer: "ai",
        status: "local", health: 85, priority: "high", ownerAgent: "Codex",
        description: "OpenAI o1/GPT-4o · CLI-native · 319+ skills · MCP via relay · technical execution",
        dependencies: ["mcp.relay"], connectedTo: ["cortex.codex-lib"],
        gaps: ["Local only — not available from VPS C2"],
        nextActions: ["Evaluate remote Codex agent deployment"],
      },
      {
        id: "agents.dame", name: "Dame — Local Ops", category: "agent", layer: "ai",
        status: "local", health: 80, priority: "medium", ownerAgent: "Dame",
        description: "openai/gpt-5.3-codex · terminal + Docker + desktop + filesystem · Windows local",
        dependencies: ["mcp.openclaw"], connectedTo: ["vps.docker"],
        gaps: ["Local Windows only"],
        nextActions: [],
      },
      {
        id: "agents.rex", name: "Rex — Infra/Security", category: "agent", layer: "ai",
        status: "live", health: 90, priority: "high", ownerAgent: "Rex",
        description: "openai/gpt-5.4 · container recovery + VPS health + Kuma alerts + Docker + SSH",
        dependencies: ["mcp.server", "mon.kuma"], connectedTo: ["vps.docker"],
        gaps: [],
        nextActions: ["Wire to auto-restart on Kuma alert"],
      },
      {
        id: "agents.atlas", name: "Atlas — Marketing/SEO", category: "agent", layer: "ai",
        status: "live", health: 85, priority: "medium", ownerAgent: "Atlas",
        description: "openai/gpt-5.4 · public content + growth strategy + social + Notion content",
        dependencies: ["mcp.server", "data.notion"], connectedTo: ["public.site"],
        gaps: ["No content publishing pipeline"],
        nextActions: ["Build content → Notion → site pipeline"],
      },
      {
        id: "agents.ahmed", name: "Ahmed — Memory/Docs", category: "agent", layer: "ai",
        status: "live", health: 88, priority: "high", ownerAgent: "Ahmed",
        description: "openai/gpt-5.4-mini · Claude/Codex memory vaults + Notion + SOPs",
        dependencies: ["cortex.memory", "data.notion"], connectedTo: ["c2.memory-tab"],
        gaps: [],
        nextActions: [],
      },
      {
        id: "agents.sygma", name: "Sygma — Ops/Compliance", category: "agent", layer: "ai",
        status: "live", health: 82, priority: "high", ownerAgent: "Sygma",
        description: "openai/gpt-5.4-mini · projects tab owner + Sygma House + n8n workflow triggers",
        dependencies: ["auto.n8n"], connectedTo: ["c2.projects"],
        gaps: [],
        nextActions: [],
      },
      {
        id: "agents.prime", name: "Prime — Trading", category: "agent", layer: "ai",
        status: "local", health: 70, priority: "medium", ownerAgent: "Prime",
        description: "openai/gpt-5.4 · desktop control of broker windows · local Windows + OpenClaw",
        dependencies: ["mcp.openclaw"], connectedTo: ["biz.trading"],
        gaps: ["Local only — VPS deployment not feasible yet"],
        nextActions: [],
      },
    ],
  },
  {
    id: "tools",
    label: "TOOLS & INTEGRATIONS",
    sublabel: "MCP & APIs",
    icon: "🔧",
    color: "#3b82f6",
    angle: 70,
    systems: [
      {
        id: "mcp.server", name: "MCP Server :3000", category: "mcp", layer: "backend",
        status: "live", health: 94, priority: "critical", ownerAgent: "Ayub",
        description: "Model Context Protocol · 111+ tools across 15+ groups · all agents route here",
        dependencies: ["vps.docker", "c2.runtime"], connectedTo: ["agents", "cortex.registry"],
        gaps: ["No tool usage analytics", "No rate limiting per agent"],
        nextActions: ["Add tool usage metrics", "Per-agent rate limits"],
        port: ":3000",
        deploymentStatus: "Docker: task-command-center",
      },
      {
        id: "mcp.relay", name: "MCP Relay :3099", category: "mcp", layer: "backend",
        status: "live", health: 88, priority: "high", ownerAgent: "Ayub",
        description: "Bridges stdio agents (Codex CLI) to HTTP MCP transport on port 3099",
        dependencies: ["mcp.server", "vps.docker"], connectedTo: ["agents.codex"],
        gaps: [],
        nextActions: [],
        port: ":3099",
      },
      {
        id: "mcp.openclaw", name: "OpenClaw Gateway :61299", category: "mcp", layer: "backend",
        status: "live", health: 85, priority: "medium", ownerAgent: "Dame",
        description: "Desktop bridge → browser/file/window automation · Port 61299",
        dependencies: [], connectedTo: ["agents.dame", "agents.prime"],
        gaps: ["Windows local only"],
        nextActions: [],
        port: ":61299",
      },
      {
        id: "mcp.openrouter", name: "OpenRouter LLM API", category: "integration", layer: "external",
        status: "external", health: 99, priority: "critical", ownerAgent: "Manual",
        description: "Single API key for all model access · each agent has own key + model ID",
        dependencies: [], connectedTo: ["agents"],
        gaps: ["No spend cap per agent"],
        nextActions: ["Configure per-agent spend limits"],
      },
      {
        id: "cortex.registry", name: "System Registry", category: "cortex", layer: "core",
        status: "live", health: 90, priority: "high", ownerAgent: "Ahmed",
        description: "Runtime registry of all systems + tools + agents + health states · file-based",
        dependencies: [], connectedTo: ["c2.visionary", "mcp.server"],
        gaps: ["No live polling — static file only"],
        nextActions: ["Add live health polling endpoint"],
      },
    ],
  },
  {
    id: "data",
    label: "DATA & INFRASTRUCTURE",
    sublabel: "Storage & DevOps",
    icon: "🗄️",
    color: "#22c55e",
    angle: 102,
    systems: [
      {
        id: "data.supabase", name: "Supabase / Postgres", category: "data", layer: "database",
        status: "warning", health: 55, priority: "critical", ownerAgent: "Ayub",
        description: "Primary DB · hosted on supabase.com · leads/clients/projects tables NOT YET CREATED",
        dependencies: [], connectedTo: ["portal.auth", "auto.n8n", "public.lead-capture"],
        gaps: ["leads table missing", "clients table missing", "projects table missing"],
        nextActions: ["Create core tables", "Wire n8n to Supabase", "Set up Row Level Security"],
      },
      {
        id: "data.notion", name: "Notion Workspace", category: "data", layer: "docs",
        status: "external", health: 95, priority: "medium", ownerAgent: "Ahmed",
        description: "Docs + SOPs + memory dumps + project notes · @notionhq/client v5.12.0",
        dependencies: [], connectedTo: ["agents.ahmed", "agents.atlas"],
        gaps: ["No two-way sync with C2"],
        nextActions: ["Build Notion ↔ C2 sync endpoint"],
      },
      {
        id: "vps.docker", name: "Docker Engine (VPS)", category: "infra", layer: "infra",
        status: "live", health: 90, priority: "critical", ownerAgent: "Rex",
        description: "187.77.211.125 · Hostinger VPS · runs all production containers",
        dependencies: [], connectedTo: ["c2.runtime", "auto.n8n", "mon.kuma"],
        gaps: ["Docker crash = EVERYTHING down", "No container health alerts"],
        nextActions: ["Configure Docker restart policies", "Wire Rex to auto-recover"],
        deploymentStatus: "Hostinger VPS 187.77.211.125",
      },
      {
        id: "vps.caddy", name: "Caddy Proxy :443", category: "infra", layer: "infra",
        status: "live", health: 98, priority: "critical", ownerAgent: "Rex",
        description: "HTTPS reverse proxy · cc.taskenterprise.tech → :3000 · auto-SSL",
        dependencies: ["vps.docker", "public.cloudflare"], connectedTo: ["c2.runtime"],
        gaps: [],
        nextActions: [],
        port: ":443",
        deploymentStatus: "Docker: caddy",
      },
      {
        id: "vps.github", name: "GitHub (codex-mcp-server)", category: "infra", layer: "devops",
        status: "external", health: 95, priority: "high", ownerAgent: "Ayub",
        description: "Source control + manual deploy · no CI/CD · build → scp app.js → docker restart",
        dependencies: [], connectedTo: ["vps.docker"],
        gaps: ["No CI/CD pipeline"],
        nextActions: ["Set up GitHub Actions for auto-deploy"],
      },
      {
        id: "data.claude-memory", name: "Claude Memory", category: "data", layer: "memory",
        status: "live", health: 85, priority: "high", ownerAgent: "Claude",
        description: "~/.claude/projects/c--Users-offic-Sync/memory/ · user/feedback/project/reference",
        dependencies: [], connectedTo: ["agents.claude", "c2.memory-tab"],
        gaps: ["Local filesystem — not backed up to VPS"],
        nextActions: ["Sync memory to VPS or Supabase"],
      },
    ],
  },
  {
    id: "security",
    label: "SECURITY & COMPLIANCE",
    sublabel: "Trust & Safety",
    icon: "🔐",
    color: "#84cc16",
    angle: 150,
    systems: [
      {
        id: "vps.cloudflared", name: "Cloudflare Tunnel", category: "security", layer: "network",
        status: "live", health: 99, priority: "critical", ownerAgent: "Rex",
        description: "cloudflared daemon · exposes VPS via cc.taskenterprise.tech · VPS IP never exposed",
        dependencies: ["vps.docker", "public.cloudflare"], connectedTo: ["vps.caddy"],
        gaps: [],
        nextActions: [],
        deploymentStatus: "Docker: task-cloudflared",
      },
      {
        id: "sec.secrets", name: "Secrets Management", category: "security", layer: "ops",
        status: "warning", health: 40, priority: "critical", ownerAgent: "Rex",
        description: "API keys in plaintext files · no vault · no rotation · manual distribution",
        dependencies: [], connectedTo: ["mcp.openrouter", "data.supabase"],
        gaps: ["No secrets vault", "Keys in plaintext files", "No rotation policy"],
        nextActions: ["Evaluate HashiCorp Vault or Doppler", "Rotate all API keys", "Audit key exposure"],
      },
      {
        id: "sec.backups", name: "Backup Strategy", category: "security", layer: "ops",
        status: "gap", health: 10, priority: "critical", ownerAgent: "Rex",
        description: "No automated backups of VPS data, Postgres, Redis, or Claude memory",
        dependencies: [], connectedTo: ["vps.docker", "data.supabase"],
        gaps: ["No VPS snapshot schedule", "No Postgres backup", "No Redis AOF"],
        nextActions: ["Configure daily VPS snapshots", "Enable Supabase PITR", "Redis AOF persistence"],
      },
      {
        id: "sec.compliance", name: "Legal & Compliance", category: "security", layer: "policy",
        status: "planned", health: 0, priority: "high", ownerAgent: "Sygma",
        description: "GDPR/privacy policy · terms of service · data handling for client portal",
        dependencies: [], connectedTo: ["portal.auth"],
        gaps: ["No privacy policy", "No terms of service", "No data retention policy"],
        nextActions: ["Draft privacy policy", "Add cookie consent", "Define data retention"],
      },
    ],
  },
  {
    id: "automation",
    label: "REVENUE ENGINE",
    sublabel: "Workflows & Automation",
    icon: "⚡",
    color: "#eab308",
    angle: 198,
    systems: [
      {
        id: "auto.n8n", name: "n8n Engine :3001", category: "automation", layer: "workflow",
        status: "live", health: 82, priority: "critical", ownerAgent: "Sygma",
        description: "Self-hosted · Postgres-backed · lead flows + CRM + email + SMS + cron jobs",
        dependencies: ["vps.docker", "auto.postgres"], connectedTo: ["data.supabase", "auto.leads"],
        gaps: ["Lead workflows not wired to Supabase", "Email SMTP not configured"],
        nextActions: ["Wire leads table", "Configure SMTP/SendGrid", "Build onboarding sequence"],
        port: ":3001",
        deploymentStatus: "Docker: n8n",
      },
      {
        id: "auto.leads", name: "Lead Workflows", category: "automation", layer: "workflow",
        status: "planned", health: 0, priority: "critical", ownerAgent: "Abdi",
        description: "site form → n8n → Supabase leads table → email notify → assign agent",
        dependencies: ["auto.n8n", "data.supabase", "public.lead-capture"], connectedTo: ["biz.revenue"],
        gaps: ["Supabase leads table missing", "n8n workflow not built", "No email notify"],
        nextActions: ["Create leads table", "Build n8n trigger", "Set up email notification"],
      },
      {
        id: "auto.crm", name: "CRM Workflows", category: "automation", layer: "workflow",
        status: "planned", health: 0, priority: "high", ownerAgent: "Sygma",
        description: "Client onboarding + project status updates + recurring check-ins",
        dependencies: ["auto.n8n", "data.supabase"], connectedTo: ["portal.dashboard"],
        gaps: ["Entire CRM workflow not built", "No clients table"],
        nextActions: ["Create clients table", "Build onboarding flow"],
      },
      {
        id: "auto.email", name: "Email Workflows", category: "automation", layer: "workflow",
        status: "planned", health: 0, priority: "high", ownerAgent: "Atlas",
        description: "Welcome sequences + reply handling + digest sends via n8n",
        dependencies: ["auto.n8n"], connectedTo: [],
        gaps: ["SMTP/SendGrid not configured"],
        nextActions: ["Configure SendGrid", "Build welcome sequence"],
      },
      {
        id: "auto.scheduled", name: "Scheduled Jobs", category: "automation", layer: "workflow",
        status: "live", health: 78, priority: "medium", ownerAgent: "Sygma",
        description: "Health checks + report generation + memory sync + daily digests · n8n cron",
        dependencies: ["auto.n8n"], connectedTo: ["mon.kuma"],
        gaps: ["Some jobs not yet scheduled"],
        nextActions: ["Add daily digest job", "Add memory sync cron"],
      },
    ],
  },
  {
    id: "monitoring",
    label: "VISIONARY INTELLIGENCE",
    sublabel: "Monitoring & Observability",
    icon: "👁️",
    color: "#14b8a6",
    angle: 230,
    systems: [
      {
        id: "mon.kuma", name: "Uptime Kuma :3011", category: "monitoring", layer: "observability",
        status: "live", health: 88, priority: "high", ownerAgent: "Rex",
        description: "Self-hosted uptime monitor · heartbeat checks on all services",
        dependencies: ["vps.docker"], connectedTo: ["c2.runtime", "auto.n8n"],
        gaps: ["No external SMS/email alert", "Not monitoring all services"],
        nextActions: ["Add all service endpoints", "Configure PagerDuty or email alert"],
        port: ":3011",
        deploymentStatus: "Docker: task-project-monitor",
      },
      {
        id: "mon.logs", name: "Container Logs", category: "monitoring", layer: "observability",
        status: "warning", health: 45, priority: "high", ownerAgent: "Rex",
        description: "docker logs --tail N · all services log to stdout · Rex triages manually",
        dependencies: ["vps.docker"], connectedTo: [],
        gaps: ["No centralised log aggregation", "Logs lost on container restart"],
        nextActions: ["Evaluate Loki or Datadog", "Set up log forwarding"],
      },
      {
        id: "mon.graphify", name: "Graphify Code Graph", category: "monitoring", layer: "dev",
        status: "local", health: 80, priority: "low", ownerAgent: "Claude",
        description: "Local code graph at :8765 · indexes codebase · query symbols + call paths",
        dependencies: [], connectedTo: [],
        gaps: ["Local only — not accessible from C2"],
        nextActions: ["Evaluate hosting Graphify on VPS"],
        port: ":8765",
      },
      {
        id: "cortex.core", name: "Command Brain", category: "cortex", layer: "core",
        status: "live", health: 85, priority: "critical", ownerAgent: "C2",
        description: "Central routing brain · receives C2 commands · dispatches agents · tracks state",
        dependencies: ["c2.runtime", "c2.redis"], connectedTo: ["agents", "mcp.server"],
        gaps: ["State is session-based — not persisted"],
        nextActions: ["Persist agent state to Redis with AOF"],
      },
      {
        id: "cortex.memory", name: "Intelligence Layer", category: "cortex", layer: "core",
        status: "live", health: 80, priority: "high", ownerAgent: "Ahmed",
        description: "Claude memory + Codex 319+ skills · drives agent decision making",
        dependencies: ["data.claude-memory"], connectedTo: ["agents.ahmed", "agents.claude"],
        gaps: ["Codex skills not synced to VPS"],
        nextActions: ["Sync Codex skills to VPS", "Build memory search API"],
      },
    ],
  },
];

// Cross-cluster connections with status
interface ClusterEdge {
  from: string;  // cluster id
  to: string;    // cluster id
  label: string;
  status: "live" | "warning" | "planned" | "broken";
}

const CLUSTER_EDGES: ClusterEdge[] = [
  { from: "website",    to: "automation",  label: "LEAD PIPELINE",    status: "planned" },
  { from: "c2",         to: "ai",          label: "COMMAND CHAIN",    status: "live" },
  { from: "ai",         to: "tools",       label: "TOOL DISPATCH",    status: "live" },
  { from: "tools",      to: "data",        label: "DATA ACCESS",      status: "live" },
  { from: "data",       to: "c2",          label: "STATE SYNC",       status: "live" },
  { from: "automation", to: "revenue",     label: "REVENUE FLOW",     status: "planned" },
  { from: "security",   to: "data",        label: "COMPLIANCE",       status: "warning" },
  { from: "monitoring", to: "c2",          label: "HEALTH ALERTS",    status: "warning" },
  { from: "portal",     to: "revenue",     label: "BILLING",          status: "planned" },
  { from: "website",    to: "revenue",     label: "CONVERSION",       status: "live" },
];

function edgeStatusColor(s: ClusterEdge["status"]): string {
  if (s === "live")    return "#22c55e";
  if (s === "warning") return "#f59e0b";
  if (s === "planned") return "#8b5cf6";
  if (s === "broken")  return "#ef4444";
  return "#475569";
}

function systemStatusColor(s: SystemStatus): string {
  if (s === "live")      return "#22c55e";
  if (s === "planned")   return "#f59e0b";
  if (s === "gap")       return "#ef4444";
  if (s === "broken")    return "#ef4444";
  if (s === "warning")   return "#f59e0b";
  if (s === "improving") return "#06b6d4";
  if (s === "local")     return "#8b5cf6";
  if (s === "external")  return "#475569";
  return "#475569";
}

function statusLabel(s: SystemStatus): string {
  if (s === "live")      return "LIVE";
  if (s === "planned")   return "PLANNED";
  if (s === "gap")       return "GAP";
  if (s === "broken")    return "BROKEN";
  if (s === "warning")   return "WARNING";
  if (s === "improving") return "IMPROVING";
  if (s === "local")     return "LOCAL";
  if (s === "external")  return "EXTERNAL";
  return "UNKNOWN";
}

// ── Voice overlay ─────────────────────────────────────────────────────────────

const VOICE_PLAYBACK_RATE: Record<string, number> = {
  abdi: 1.16, ahmed: 1.18, dame: 1.20, rex: 1.18, ayub: 1.22,
  prime: 1.18, atlas: 1.18, sygma: 1.17, codex: 1.15, claude: 1.16,
};

function normalizeVoiceText(text: string) {
  return String(text || "").toLowerCase().replace(/[^\w\s']/g, " ").replace(/\s+/g, " ").trim();
}

function isLikelyVisionarySttNoise(text: string) {
  const normalized = normalizeVoiceText(text);
  if (normalized.includes("task is speaking naturally") && normalized.includes("visionary tab")) return true;
  return new Set([
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "like and subscribe",
    "subtitles by",
    "transcribed by",
    "task is speaking naturally to c2 agents in the visionary tab",
  ]).has(normalized);
}

function chooseBestTranscript(serverText: string, browserText: string) {
  const server = String(serverText || "").trim();
  const browser = String(browserText || "").replace(/\s+/g, " ").trim();
  if (browser && isLikelyVisionarySttNoise(browser)) return server;
  if (server && isLikelyVisionarySttNoise(server)) return browser;
  if (!server) return browser;
  if (!browser) return server;
  const serverNorm = normalizeVoiceText(server);
  const browserNorm = normalizeVoiceText(browser);
  const serverWords = serverNorm.split(/\s+/).filter(Boolean).length;
  const browserWords = browserNorm.split(/\s+/).filter(Boolean).length;
  if ((serverNorm === "hello" || serverNorm === "thank you") && browserWords > serverWords) return browser;
  if (browser.length > server.length * 1.6 && browserWords >= serverWords) return browser;
  return server;
}

const ALL_VOICE_AGENTS: Array<{ id: string; name: string; color: string }> = [
  { id: "abdi",   name: "Abdi",   color: "#ef4444" },
  { id: "dame",   name: "Dame",   color: "#f59e0b" },
  { id: "ayub",   name: "Ayub",   color: "#3b82f6" },
  { id: "ahmed",  name: "Ahmed",  color: "#84cc16" },
  { id: "atlas",  name: "Atlas",  color: "#06b6d4" },
  { id: "rex",    name: "Rex",    color: "#22c55e" },
  { id: "prime",  name: "Prime",  color: "#8b5cf6" },
  { id: "sygma",  name: "Sygma",  color: "#ec4899" },
  { id: "codex",  name: "Codex",  color: "#e2e8f0" },
  { id: "claude", name: "Claude", color: "#f97316" },
];

function stripMd(t: string): string {
  return t
    .replace(/#{1,6}\s+/g, "").replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1").replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function condenseToWords(text: string, max = 6): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ") + "…";
}

function useVoice() {
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(["abdi"]));
  const activeIdsRef = useRef(activeIds);
  useEffect(() => { activeIdsRef.current = activeIds; }, [activeIds]);

  const toggleAgent = useCallback((id: string) => {
    setActiveIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const [phase, setPhase] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [interim, setInterim]   = useState("");
  const [finalText, setFinalText] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [msgs, setMsgs] = useState<Array<{ role: "user" | "agent"; text: string; agent?: string; color?: string }>>([]);

  const phaseRef  = useRef(phase);
  const finalRef  = useRef("");
  const recogRef  = useRef<any>(null);
  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const sendRef   = useRef<((t: string) => void) | null>(null);
  const latchedRef = useRef(false);
  const startedAtRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const setP = useCallback((p: typeof phase) => { phaseRef.current = p; setPhase(p); }, []);

  const stopAudio = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
  }, []);

  const sendToAgents = useCallback(async (text: string) => {
    if (!text.trim()) { setP("idle"); return; }
    const agents = ALL_VOICE_AGENTS.filter(a => activeIdsRef.current.has(a.id));
    if (!agents.length) { setP("idle"); return; }

    setMsgs(m => [...m, { role: "user", text }]);
    setInterim("");
    setFinalText("");
    finalRef.current = "";
    setP("thinking");

    const results = await Promise.all(agents.map(async a => {
      try {
        const res = await fetch("/api/voice/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: a.id, message: text }),
        });
        const json = await res.json();
        const reply = stripMd((json.reply || json.text || "").trim());
        return { agent: a, reply };
      } catch {
        return { agent: a, reply: "" };
      }
    }));

    const valid = results.filter(r => r.reply);
    if (!valid.length) { setP("idle"); setErrMsg("No agents responded"); return; }

    const agentReplies = valid.map(r => ({ role: "agent" as const, text: r.reply, agent: r.agent.name, color: r.agent.color }));
    setMsgs(m => [...m, ...agentReplies]);
    setP("speaking");

    try {
      fetch("/api/voice/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ts: new Date().toISOString(),
          userText: text,
          replies: valid.map(r => ({ agent: r.agent.name, agentId: r.agent.id, text: r.reply })),
        }),
      }).catch(() => {});
    } catch { /**/ }

    const playNext = async (i: number) => {
      if (i >= valid.length) { setP("idle"); return; }
      const { agent: a, reply } = valid[i];
      const rate = VOICE_PLAYBACK_RATE[a.id] ?? 1.0;
      try {
        const ttsUrl = `/api/voice/tts?agentId=${encodeURIComponent(a.id)}&text=${encodeURIComponent(reply)}&t=${Date.now()}`;
        if (!audioRef.current) audioRef.current = new Audio();
        const el = audioRef.current;
        el.playbackRate = rate;
        el.src = ttsUrl;
        await new Promise<void>((resolve) => {
          el.onended = () => resolve();
          el.onerror = () => resolve();
          el.play().catch(() => resolve());
        });
      } catch { /**/ }
      await playNext(i + 1);
    };
    await playNext(0);
  }, [setP, stopAudio]);

  useEffect(() => { sendRef.current = sendToAgents; }, [sendToAgents]);

  const startListening = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    setErrMsg("");
    setP("listening");
    setInterim("Listening… press S to send");
    setFinalText("");
    finalRef.current = "";
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } }).then(stream => {
      const isSupported = (m: string) => (MediaRecorder as any).isTypeSupported?.(m) ?? false;
      const mime = isSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : isSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus"
        : isSupported("audio/webm") ? "audio/webm"
        : "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }) : new MediaRecorder(stream);
      mrRef.current = mr;
      mr.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recogRef.current) { try { recogRef.current.abort(); } catch { /**/ } recogRef.current = null; }
        const chunks = chunksRef.current; chunksRef.current = [];
        if (!chunks.length) { setP("idle"); setInterim(""); setErrMsg("Nothing recorded — try again"); return; }
        setP("thinking");
        setInterim("Transcribing…");
        try {
          const blobMime = (chunks[0] instanceof Blob && (chunks[0] as Blob).type) || mime;
          const blob = new Blob(chunks, { type: blobMime });
          const res = await fetch("/api/voice/stt", {
            method: "POST", headers: { "Content-Type": blobMime }, body: blob,
          });
          if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`STT ${res.status} ${t}`); }
          const { text } = await res.json();
          const t = chooseBestTranscript(text || "", finalRef.current);
          setInterim("");
          if (t && !isLikelyVisionarySttNoise(t)) { setErrMsg(""); sendRef.current?.(t); }
          else { setP("idle"); setErrMsg("Nothing heard — try again"); }
        } catch (e: any) {
          setInterim(""); setP("idle");
          setErrMsg(`Transcription failed: ${e?.message ?? "check server"}`);
        }
      };
      mr.start(250);

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        try {
          const recog = new SR();
          recogRef.current = recog;
          recog.continuous = true; recog.interimResults = true; recog.lang = "en-US";
          recog.onresult = (e: any) => {
            let live = "";
            let final = "";
            for (let i = 0; i < e.results.length; i++) {
              if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
              else live += e.results[i][0].transcript + " ";
            }
            const cleanFinal = final.replace(/\s+/g, " ").trim();
            if (cleanFinal) {
              finalRef.current = cleanFinal;
              setFinalText(cleanFinal);
            }
            setInterim(live.trim() || cleanFinal || "Listening…");
          };
          recog.onerror = () => { recogRef.current = null; };
          recog.onend   = () => { recogRef.current = null; };
          recog.start();
        } catch { /**/ }
      }
    }).catch((e: Error) => {
      setP("idle"); setInterim("");
      setErrMsg(`Mic blocked: ${e.message} — check browser mic permission`);
    });
  }, [setP]);

  const stopListening = useCallback(() => {
    if (phaseRef.current !== "listening") return;
    const mr = mrRef.current; mrRef.current = null;
    const elapsed = Date.now() - startedAtRef.current;
    if (mr && mr.state !== "inactive") {
      setTimeout(() => {
        try { if (mr.state !== "inactive") mr.stop(); } catch { /**/ }
      }, Math.max(0, 450 - elapsed));
    }
    else setP("idle");
  }, [setP]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift" && phaseRef.current === "listening") {
        latchedRef.current = true;
        setInterim(finalRef.current || "Listening locked — press S again to send");
        return;
      }
      if (e.key.toLowerCase() !== "s") return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.repeat) return;
      e.preventDefault();
      const p = phaseRef.current;
      if (e.shiftKey && p === "listening") {
        latchedRef.current = true;
        setInterim(finalRef.current || "Listening locked — press S again to send");
        return;
      }
      if (p === "idle") {
        latchedRef.current = Boolean(e.shiftKey);
        startListening();
      } else if (p === "listening" && latchedRef.current && !e.shiftKey) {
        latchedRef.current = false;
        stopListening();
      } else if (p === "speaking")  { stopAudio(); setP("idle"); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "s") return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      e.preventDefault();
      if (phaseRef.current === "listening" && !latchedRef.current) stopListening();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startListening, stopListening, stopAudio, setP]);

  return { phase, interim, finalText, errMsg, msgs, activeIds, toggleAgent, startListening, stopListening, stopAudio, setP };
}

// ── Cluster Diagram ───────────────────────────────────────────────────────────

const SVG_SIZE = 2400;

function spokeXY(angleDeg: number, r: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}

function ClusterDiagram({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string, clusterId: string) => void }) {
  const HUB_R     = 56;
  const CARD_W    = 148;
  const CARD_H    = 18;
  const CARD_GAP  = 2;
  const COL_SEP   = 6;
  const HDR_H     = 20;
  const PAD       = 7;
  const PANEL_MARGIN = 16;
  const N = CLUSTERS.length;

  const uv = (angleDeg: number) => {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { dx: Math.cos(rad), dy: Math.sin(rad) };
  };

  // Compute panel sizes per cluster
  const panelSizes = CLUSTERS.map(cl => {
    const n = cl.systems.length;
    // Use 2 columns for clusters with 5+ systems, 1 for fewer
    const cols = n >= 5 ? 2 : 1;
    const rows = Math.ceil(n / cols);
    const innerW = cols * CARD_W + (cols - 1) * COL_SEP;
    const w = innerW + PAD * 2;
    const h = HDR_H + PAD + rows * CARD_H + (rows - 1) * CARD_GAP + PAD;
    return { w, h, halfDiag: Math.sqrt(w * w + h * h) / 2, cols, rows };
  });

  // Per-arm gap is 360/10 = 36°
  const ARM_GAP_DEG = 360 / N;
  const CHORD_FACTOR = 2 * Math.sin((ARM_GAP_DEG / 2) * Math.PI / 180);

  const safeRadii = panelSizes.map((ps, i) => {
    const prev = panelSizes[(i - 1 + N) % N];
    const next = panelSizes[(i + 1) % N];
    const rFromPrev = (ps.halfDiag + prev.halfDiag + PANEL_MARGIN) / CHORD_FACTOR;
    const rFromNext = (ps.halfDiag + next.halfDiag + PANEL_MARGIN) / CHORD_FACTOR;
    return Math.max(rFromPrev, rFromNext, HUB_R + 90);
  });

  type CardEntry = { sys: SystemNode; cx: number; cy: number };
  type ArmData = {
    cl: Cluster;
    panelX: number; panelY: number;
    panelW: number; panelH: number;
    panelCx: number; panelCy: number;
    spokeX: number; spokeY: number;
    anchorX: number; anchorY: number;
    cards: CardEntry[];
  };

  const arms: ArmData[] = CLUSTERS.map((cl, i) => {
    const { dx, dy } = uv(cl.angle);
    const { w: panelW, h: panelH, cols } = panelSizes[i];
    const R = safeRadii[i];

    const panelCx = dx * R;
    const panelCy = dy * R;
    const panelX = panelCx - panelW / 2;
    const panelY = panelCy - panelH / 2;

    const halfAlong = Math.abs(dx) > Math.abs(dy) ? panelW / 2 : panelH / 2;
    const spokeX = panelCx - dx * halfAlong;
    const spokeY = panelCy - dy * halfAlong;

    const ANCHOR_R = (HUB_R + Math.sqrt(spokeX * spokeX + spokeY * spokeY)) / 2;
    const anchorX = dx * ANCHOR_R;
    const anchorY = dy * ANCHOR_R;

    const cardStartX = panelX + PAD;
    const cardStartY = panelY + HDR_H + PAD;

    const cards: CardEntry[] = cl.systems.map((sys, j) => {
      const col = j % cols;
      const row = Math.floor(j / cols);
      return {
        sys,
        cx: cardStartX + col * (CARD_W + COL_SEP) + CARD_W / 2,
        cy: cardStartY + row * (CARD_H + CARD_GAP) + CARD_H / 2,
      };
    });

    return { cl, panelX, panelY, panelW, panelH, panelCx, panelCy, spokeX, spokeY, anchorX, anchorY, cards };
  });

  // Build lookup: cluster id → arm data
  const armMap = new Map(arms.map(a => [a.cl.id, a]));

  // Compute viewBox
  const allX = arms.flatMap(a => [a.panelX, a.panelX + a.panelW]);
  const allY = arms.flatMap(a => [a.panelY, a.panelY + a.panelH]);
  const minX = Math.min(...allX) - 24;
  const minY = Math.min(...allY) - 24;
  const maxX = Math.max(...allX) + 24;
  const maxY = Math.max(...allY) + 24;
  const vbW = maxX - minX;
  const vbH = maxY - minY;

  // Overall health counts
  const allSystems = CLUSTERS.flatMap(c => c.systems);
  const liveCnt = allSystems.filter(s => s.status === "live").length;
  const totalSys = allSystems.length;
  const healthPct = Math.round((liveCnt / totalSys) * 100);

  return (
    <svg
      viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
      style={{ width: SVG_SIZE, height: SVG_SIZE, display: "block", overflow: "visible" }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="hub-glow-v3" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#8b5cf6" stopOpacity="0.30" />
          <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bg-glow-v3" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#0a0a14" stopOpacity="1" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <filter id="node-sel-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="hub-filter-v3" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx={0} cy={0} r={Math.max(vbW, vbH)} fill="url(#bg-glow-v3)" />

      {/* Orbit rings */}
      {[...new Set(safeRadii)].map(r => (
        <circle key={r} cx={0} cy={0} r={r} fill="none"
          stroke="#ffffff" strokeWidth={0.2} strokeDasharray="2 14" strokeOpacity={0.04} />
      ))}

      {/* ── Cross-cluster connection lines ── */}
      {CLUSTER_EDGES.map((edge, i) => {
        const a = armMap.get(edge.from);
        const b = armMap.get(edge.to);
        if (!a || !b) return null;
        const color = edgeStatusColor(edge.status);
        const isDashed = edge.status === "planned";
        // Midpoint for label
        const mx = (a.panelCx + b.panelCx) / 2;
        const my = (a.panelCy + b.panelCy) / 2;
        // Slight curve via quadratic bezier through a point pushed toward center
        const cx0 = mx * 0.6;
        const cy0 = my * 0.6;
        const d = `M${a.panelCx},${a.panelCy} Q${cx0},${cy0} ${b.panelCx},${b.panelCy}`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={color} strokeWidth={isDashed ? 0.8 : 1.0}
              strokeOpacity={isDashed ? 0.25 : 0.35}
              strokeDasharray={isDashed ? "4 6" : undefined} />
          </g>
        );
      })}

      {/* ── Spokes ── */}
      {arms.map(({ cl, anchorX, anchorY, spokeX, spokeY }) => {
        const { dx, dy } = uv(cl.angle);
        return (
          <g key={cl.id + "-spoke"}>
            <line
              x1={dx * (HUB_R + 3)} y1={dy * (HUB_R + 3)}
              x2={anchorX} y2={anchorY}
              stroke={cl.color} strokeWidth={0.6} strokeOpacity={0.18} strokeDasharray="3 5"
            />
            <line
              x1={anchorX} y1={anchorY}
              x2={spokeX} y2={spokeY}
              stroke={cl.color} strokeWidth={0.9} strokeOpacity={0.38}
            />
            <circle cx={anchorX} cy={anchorY} r={3} fill={cl.color} opacity={0.7} />
          </g>
        );
      })}

      {/* ── Cluster panels ── */}
      {arms.map(({ cl, panelX, panelY, panelW, panelH, cards }) => {
        // Count statuses for header badge
        const liveSys = cl.systems.filter(s => s.status === "live").length;
        const gapSys  = cl.systems.filter(s => s.status === "planned" || s.status === "gap").length;

        return (
          <g key={cl.id + "-panel"}>
            {/* Panel body */}
            <rect x={panelX} y={panelY} width={panelW} height={panelH} rx={7}
              fill="#06060a" stroke={cl.color} strokeWidth={0.9} strokeOpacity={0.5} />
            {/* Header tint */}
            <rect x={panelX + 0.5} y={panelY + 0.5} width={panelW - 1} height={HDR_H - 0.5} rx={6}
              fill={cl.color + "1e"} stroke="none" />
            {/* Icon */}
            <text x={panelX + 10} y={panelY + HDR_H / 2}
              dominantBaseline="middle" fontSize={9}>{cl.icon}</text>
            {/* Label */}
            <text x={panelX + 22} y={panelY + HDR_H / 2}
              dominantBaseline="middle"
              fill={cl.color} fontSize={6} fontWeight="800"
              letterSpacing="0.10em" fontFamily="monospace">{cl.label}</text>
            {/* Live/gap count badges */}
            <text x={panelX + panelW - 6} y={panelY + HDR_H / 2}
              textAnchor="end" dominantBaseline="middle"
              fill="#22c55e" fontSize={5.5} fontFamily="monospace" opacity={0.8}>{liveSys}↑</text>
            {gapSys > 0 && (
              <text x={panelX + panelW - 18} y={panelY + HDR_H / 2}
                textAnchor="end" dominantBaseline="middle"
                fill="#f59e0b" fontSize={5.5} fontFamily="monospace" opacity={0.8}>{gapSys}⌛</text>
            )}
            {/* Divider */}
            <line x1={panelX + 5} y1={panelY + HDR_H} x2={panelX + panelW - 5} y2={panelY + HDR_H}
              stroke={cl.color} strokeWidth={0.3} strokeOpacity={0.2} />

            {/* System cards */}
            {cards.map(({ sys, cx, cy }) => {
              const isSelected = selectedId === sys.id;
              const sc = systemStatusColor(sys.status);
              return (
                <g key={sys.id} style={{ cursor: "pointer" }} onClick={() => onSelect(sys.id, cl.id)}>
                  <rect x={cx - CARD_W / 2} y={cy - CARD_H / 2}
                    width={CARD_W} height={CARD_H} rx={3}
                    fill={isSelected ? cl.color + "28" : "#0c0c12"}
                    stroke={isSelected ? cl.color : cl.color + "28"}
                    strokeWidth={isSelected ? 1.1 : 0.4}
                    filter={isSelected ? "url(#node-sel-glow)" : undefined} />
                  {/* Status bar */}
                  <rect x={cx - CARD_W / 2 + 0.5} y={cy - CARD_H / 2 + 3}
                    width={2.5} height={CARD_H - 6} rx={1}
                    fill={sc} opacity={0.9} />
                  {/* Name */}
                  <text x={cx - CARD_W / 2 + 9} y={cy}
                    dominantBaseline="middle"
                    fill={isSelected ? cl.color : "#a8b8c8"}
                    fontSize={6.5} fontFamily="system-ui, sans-serif"
                    fontWeight={isSelected ? "700" : "400"}>{sys.name}</text>
                  {/* Status dot — right edge */}
                  <circle cx={cx + CARD_W / 2 - 6} cy={cy} r={2.5} fill={sc} opacity={0.85} />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* ── Hub centre ── */}
      <circle cx={0} cy={0} r={HUB_R + 18} fill="url(#hub-glow-v3)" />
      <circle cx={0} cy={0} r={HUB_R + 3}  fill="none" stroke="#8b5cf6" strokeWidth={0.5} strokeOpacity={0.2} strokeDasharray="3 5" />
      <circle cx={0} cy={0} r={HUB_R}       fill="#050508" stroke="#8b5cf6" strokeWidth={1.5} strokeOpacity={0.85} filter="url(#hub-filter-v3)" />
      <text x={0} y={-18} textAnchor="middle" dominantBaseline="middle"
        fill="#8b5cf6" fontSize={6.5} fontWeight="900" letterSpacing="0.25em" fontFamily="monospace">TASK</text>
      <text x={0} y={-3} textAnchor="middle" dominantBaseline="middle"
        fill="#e2e8f0" fontSize={16} fontWeight="900" letterSpacing="0.08em" fontFamily="monospace">C2</text>
      <text x={0} y={12} textAnchor="middle" dominantBaseline="middle"
        fill="#3a4a5a" fontSize={5} letterSpacing="0.16em" fontFamily="monospace">ENTERPRISE</text>
      <text x={0} y={24} textAnchor="middle" dominantBaseline="middle"
        fill="#22c55e" fontSize={8} fontWeight="800" fontFamily="monospace">{healthPct}%</text>
    </svg>
  );
}

// ── Agent Dock ─────────────────────────────────────────────────────────────────

const DOCK_AGENTS = AGENT_ORDER.map(id => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  color: ALL_VOICE_AGENTS.find(a => a.id === id)?.color ?? "#475569",
}));

function AgentDock() {
  const { phase, interim, msgs, activeIds, toggleAgent,
          startListening, stopListening, stopAudio, setP } = useVoice();
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const handleDockClick = (id: string) => {
    const p = phaseRef.current;
    if (p === "idle")           toggleAgent(id);
    else if (p === "listening") stopListening();
    else if (p === "speaking")  { stopAudio(); setP("idle"); }
  };

  const lastMsg = msgs[msgs.length - 1];
  const transcriptLine = (() => {
    if (phase === "listening") return interim ? condenseToWords(interim, 5) : "listening…";
    if (phase === "thinking")  return "thinking…";
    if (phase === "speaking" && lastMsg?.role === "agent")
      return condenseToWords(lastMsg.text, 6);
    if (lastMsg) return condenseToWords(lastMsg.text, 6);
    return "";
  })();
  const transcriptColor = phase === "listening" ? "#ef4444"
    : phase === "thinking" ? "#8b5cf6"
    : phase === "speaking" ? (lastMsg?.color ?? "#e2e8f0")
    : "#475569";

  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16,
      zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
      pointerEvents: "none",
    }}>
      <div style={{
        fontSize: 9.5, color: transcriptColor, fontFamily: "monospace",
        letterSpacing: "0.04em", opacity: transcriptLine ? 1 : 0,
        transition: "opacity 0.2s, color 0.2s",
        textShadow: `0 0 10px ${transcriptColor}88`,
        maxWidth: 260, textAlign: "right", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {transcriptLine}
      </div>
      <div style={{
        display: "flex", gap: 6, alignItems: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 40, padding: "5px 10px",
        pointerEvents: "auto",
      }}>
        {DOCK_AGENTS.map(da => {
          const isActive    = activeIds.has(da.id);
          const isListening = isActive && phase === "listening";
          const isSpeaking  = isActive && phase === "speaking";
          const ringColor   = isListening ? "#ef4444" : da.color;
          return (
            <div key={da.id} onClick={() => handleDockClick(da.id)}
              title={`${da.name}${isActive ? " (active)" : ""}`}
              style={{
                position: "relative", cursor: "pointer",
                filter: isActive ? "none" : "brightness(0.3) saturate(0.2)",
                transition: "filter 0.15s, transform 0.1s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            >
              {isActive && (
                <div style={{
                  position: "absolute", inset: -3, borderRadius: "50%",
                  border: `1.5px solid ${ringColor}`,
                  boxShadow: `0 0 8px ${ringColor}99`,
                  animation: isListening ? "pulse-ring 1s ease-in-out infinite" : "none",
                  pointerEvents: "none",
                }} />
              )}
              <AgentAvatar agentId={da.id} name={da.name} size={22} />
              {isActive && (
                <span style={{
                  position: "absolute", bottom: -1, right: -1,
                  width: 6, height: 6, borderRadius: "50%",
                  background: isListening ? "#ef4444" : isSpeaking ? da.color : "#22c55e",
                  border: "1px solid #000",
                  animation: isListening ? "pulse-dot 1s ease-in-out infinite" : "none",
                }} />
              )}
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes pulse-ring {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
        @keyframes pulse-dot {
          0%,100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ systemId, clusterId, onClose }: {
  systemId: string | null;
  clusterId: string | null;
  onClose: () => void;
}) {
  if (!systemId || !clusterId) return null;
  const cluster = CLUSTERS.find(c => c.id === clusterId);
  const sys = cluster?.systems.find(s => s.id === systemId);
  if (!sys || !cluster) return null;

  const registryNode = REGISTRY_MAP.get(systemId);
  const sc = systemStatusColor(sys.status);

  const agentActions = [
    { label: "Ask Claude", color: "#f97316", icon: "🤖", action: () => {
      const msg = `Tell me about ${sys.name}: status, gaps, and what I should do next.`;
      console.log("Claude action:", msg);
    }},
    { label: "Ask Codex", color: "#e2e8f0", icon: "⚡", action: () => {} },
    { label: "Generate POA", color: "#8b5cf6", icon: "📋", action: () => {} },
    { label: "Validate Build", color: "#22c55e", icon: "✅", action: () => {} },
    { label: "Create Task", color: "#06b6d4", icon: "➕", action: () => {} },
  ];

  return (
    <div
      data-scroll-panel="1"
      style={{
        position: "absolute", top: 14, left: 14, zIndex: 50,
        background: "#060609", border: `1px solid ${cluster.color}50`,
        borderRadius: 10, padding: "14px 16px", width: 308,
        maxHeight: "calc(100vh - 80px)", overflowY: "auto",
        boxShadow: `0 0 40px ${cluster.color}18`,
      }}
    >
      {/* Close */}
      <button onClick={onClose} style={{
        position: "absolute", top: 8, right: 10,
        background: "none", border: "none", color: "#475569",
        cursor: "pointer", fontSize: 16, lineHeight: 1,
      }}>×</button>

      {/* Cluster tag */}
      <div style={{ fontSize: 8, color: cluster.color, letterSpacing: "0.1em",
        fontFamily: "monospace", fontWeight: 700, marginBottom: 3 }}>
        {cluster.icon} {cluster.label}
      </div>

      {/* System name */}
      <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", marginBottom: 4, lineHeight: 1.2, paddingRight: 20 }}>
        {sys.name}
      </div>

      {/* Status + owner row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4,
          background: sc + "15", border: `1px solid ${sc}40`, borderRadius: 4, padding: "2px 7px" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc }} />
          <span style={{ fontSize: 8.5, color: sc, fontFamily: "monospace", letterSpacing: "0.07em" }}>
            {statusLabel(sys.status)}
          </span>
        </div>
        {sys.ownerAgent && (
          <div style={{ fontSize: 8.5, color: "#475569", fontFamily: "monospace" }}>
            owned by {sys.ownerAgent}
          </div>
        )}
        {sys.port && (
          <div style={{ fontSize: 8.5, color: cluster.color, fontFamily: "monospace" }}>{sys.port}</div>
        )}
      </div>

      {/* Description */}
      <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
        {sys.description}
      </div>

      {/* Deployment status */}
      {sys.deploymentStatus && (
        <div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace",
          marginBottom: 10, background: "#0a0f1e", borderRadius: 4, padding: "4px 8px" }}>
          {sys.deploymentStatus}
        </div>
      )}

      {/* Connected to */}
      {sys.connectedTo.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 8.5, color: "#475569", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 5 }}>CONNECTED TO</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {sys.connectedTo.map(cid => (
              <span key={cid} style={{
                fontSize: 8, color: "#64748b", background: "#0a0f1e",
                border: "1px solid #1e293b", borderRadius: 3, padding: "1px 6px",
                fontFamily: "monospace",
              }}>{cid}</span>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {sys.gaps.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 8.5, color: "#ef4444", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 5 }}>
            ⚠ GAPS / MISSING
          </div>
          {sys.gaps.map((g, i) => (
            <div key={i} style={{ fontSize: 9.5, color: "#64748b", borderLeft: "2px solid #ef444440",
              paddingLeft: 7, marginBottom: 4, lineHeight: 1.5 }}>{g}</div>
          ))}
        </div>
      )}

      {/* Next actions */}
      {sys.nextActions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 8.5, color: "#22c55e", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 5 }}>
            → NEXT ACTIONS
          </div>
          {sys.nextActions.map((a, i) => (
            <div key={i} style={{ fontSize: 9.5, color: "#64748b", borderLeft: "2px solid #22c55e40",
              paddingLeft: 7, marginBottom: 4, lineHeight: 1.5 }}>{a}</div>
          ))}
        </div>
      )}

      {/* Registry gaps if available */}
      {registryNode?.missingPieces?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 8.5, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 5 }}>
            REGISTRY GAPS
          </div>
          {registryNode.missingPieces.slice(0, 3).map((g: string, i: number) => (
            <div key={i} style={{ fontSize: 9, color: "#475569", borderLeft: `2px solid ${cluster.color}30`,
              paddingLeft: 7, marginBottom: 3, lineHeight: 1.5 }}>{g}</div>
          ))}
        </div>
      )}

      {/* Agent action buttons */}
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 10, marginTop: 4 }}>
        <div style={{ fontSize: 8.5, color: "#334155", letterSpacing: "0.08em", marginBottom: 7 }}>AGENT ACTIONS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {agentActions.map(act => (
            <button key={act.label} onClick={act.action} style={{
              background: act.color + "12", border: `1px solid ${act.color}30`,
              borderRadius: 5, color: act.color, fontSize: 9,
              padding: "4px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: "system-ui, sans-serif", letterSpacing: "0.02em",
              transition: "background 0.15s",
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = act.color + "22"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = act.color + "12"; }}
            >
              <span>{act.icon}</span> {act.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Intelligence Panel (right sidebar) ────────────────────────────────────────

function IntelligencePanel({ onClose }: { onClose: () => void }) {
  const allSystems = useMemo(() => CLUSTERS.flatMap(c => c.systems), []);
  const live     = allSystems.filter(s => s.status === "live").length;
  const planned  = allSystems.filter(s => s.status === "planned" || s.status === "gap").length;
  const local    = allSystems.filter(s => s.status === "local").length;
  const external = allSystems.filter(s => s.status === "external").length;
  const warning  = allSystems.filter(s => s.status === "warning").length;
  const total    = allSystems.length;
  const healthPct = Math.round((live / total) * 100);

  const criticalGaps = [
    { label: "Client Portal (auth + billing + dashboard)", impact: "Blocks all self-service MRR", color: "#ef4444", priority: "CRITICAL" },
    { label: "Supabase: leads/clients/projects tables missing", impact: "All lead data being lost", color: "#ef4444", priority: "CRITICAL" },
    { label: "Secrets in plaintext — no vault", impact: "Security exposure on key leak", color: "#ef4444", priority: "CRITICAL" },
    { label: "No backups: VPS / Postgres / Redis", impact: "Single outage = total data loss", color: "#ef4444", priority: "CRITICAL" },
    { label: "Redis AOF persistence OFF", impact: "Sessions lost on every restart", color: "#f59e0b", priority: "HIGH" },
    { label: "No CI/CD — manual scp deploy", impact: "Each deploy takes 5+ minutes manually", color: "#f59e0b", priority: "HIGH" },
    { label: "Lead capture not wired end-to-end", impact: "Marketing spend has zero capture ROI", color: "#f59e0b", priority: "HIGH" },
  ];

  const topRecommendations = [
    { label: "Build Portal Auth + Stripe billing", impact: "Unlocks MRR", effort: "HIGH", cluster: "portal" },
    { label: "Create Supabase leads/clients tables", impact: "Fix lead loss", effort: "LOW", cluster: "data" },
    { label: "Wire Calendly → n8n → Supabase leads", impact: "Capture pipeline", effort: "MED", cluster: "automation" },
    { label: "Enable Redis AOF + VPS snapshots", impact: "Data safety", effort: "LOW", cluster: "security" },
    { label: "Set up GitHub Actions auto-deploy", impact: "Dev velocity", effort: "MED", cluster: "data" },
  ];

  return (
    <div style={{
      width: 280, background: "#040407", borderLeft: "1px solid #1e293b",
      display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#14b8a6", letterSpacing: "0.06em" }}>VISIONARY INTELLIGENCE</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 8.5, color: "#334155", letterSpacing: "0.08em", marginTop: 2 }}>ECOSYSTEM ANALYSIS · {total} SYSTEMS</div>
      </div>

      <div data-scroll-panel="1" style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Health ring */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            width: 62, height: 62, borderRadius: "50%", flexShrink: 0,
            background: `conic-gradient(#22c55e 0% ${healthPct}%, #f59e0b ${healthPct}% ${healthPct + Math.round((warning / total) * 100)}%, #8b5cf6 ${healthPct + Math.round((warning / total) * 100)}% ${healthPct + Math.round((warning / total) * 100) + Math.round((local / total) * 100)}%, #475569 ${healthPct + Math.round((warning / total) * 100) + Math.round((local / total) * 100)}% 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#040407",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#22c55e", lineHeight: 1 }}>{healthPct}%</span>
              <span style={{ fontSize: 6, color: "#334155", letterSpacing: "0.05em" }}>LIVE</span>
            </div>
          </div>
          <div style={{ fontSize: 9, color: "#64748b", lineHeight: 2 }}>
            <div><span style={{ color: "#22c55e", fontWeight: 700 }}>{live}</span> live on VPS</div>
            <div><span style={{ color: "#f59e0b", fontWeight: 700 }}>{warning}</span> warning</div>
            <div><span style={{ color: "#8b5cf6", fontWeight: 700 }}>{local}</span> local-only</div>
            <div><span style={{ color: "#475569", fontWeight: 700 }}>{external}</span> external</div>
            <div><span style={{ color: "#334155", fontWeight: 700 }}>{planned}</span> planned/gap</div>
          </div>
        </div>

        {/* Top recommendations */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#e2e8f0", marginBottom: 8, letterSpacing: "0.05em" }}>TOP RECOMMENDATIONS</div>
          {topRecommendations.map((r, i) => (
            <div key={i} style={{ marginBottom: 7, padding: "6px 8px", borderRadius: 5,
              background: "#0a0f1e", border: "1px solid #1e293b" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 9.5, color: "#94a3b8", fontWeight: 600 }}>{r.label}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ fontSize: 8, color: "#22c55e", fontFamily: "monospace" }}>{r.impact}</span>
                <span style={{ fontSize: 8, color: r.effort === "LOW" ? "#22c55e" : r.effort === "MED" ? "#f59e0b" : "#ef4444",
                  fontFamily: "monospace" }}>·{r.effort}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Critical gaps */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#e2e8f0", marginBottom: 8, letterSpacing: "0.05em" }}>CRITICAL GAPS</div>
          {criticalGaps.map((g, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 7 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flexShrink: 0, marginTop: 2 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: g.color }} />
              </div>
              <div>
                <div style={{ fontSize: 9.5, color: "#94a3b8", lineHeight: 1.4 }}>{g.label}</div>
                <div style={{ fontSize: 8.5, color: g.color + "99", marginTop: 1 }}>{g.impact}</div>
              </div>
              <span style={{ fontSize: 7, color: g.color, fontFamily: "monospace",
                background: g.color + "18", borderRadius: 3, padding: "1px 4px",
                flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }}>{g.priority}</span>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: "#1e293b" }} />

        {/* Cluster breakdown */}
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: "#e2e8f0", marginBottom: 8, letterSpacing: "0.05em" }}>CLUSTER STATUS</div>
          {CLUSTERS.map(cl => {
            const liveCnt  = cl.systems.filter(s => s.status === "live").length;
            const warnCnt  = cl.systems.filter(s => s.status === "warning").length;
            const planCnt  = cl.systems.filter(s => s.status === "planned" || s.status === "gap").length;
            const pct = Math.round((liveCnt / cl.systems.length) * 100);
            return (
              <div key={cl.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 9 }}>{cl.icon}</span>
                <span style={{ fontSize: 8.5, color: cl.color, flex: 1, fontFamily: "monospace", letterSpacing: "0.03em" }}>{cl.label}</span>
                <span style={{ fontSize: 8, color: "#22c55e", fontFamily: "monospace" }}>{liveCnt}↑</span>
                {warnCnt > 0 && <span style={{ fontSize: 8, color: "#f59e0b", fontFamily: "monospace" }}>⚠{warnCnt}</span>}
                {planCnt > 0 && <span style={{ fontSize: 8, color: "#475569", fontFamily: "monospace" }}>{planCnt}⌛</span>}
              </div>
            );
          })}
        </div>

        {/* Agent actions */}
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 10 }}>
          <div style={{ fontSize: 8.5, color: "#334155", letterSpacing: "0.08em", marginBottom: 7 }}>QUICK INTELLIGENCE ACTIONS</div>
          {[
            ["📊 Generate System Report", "#8b5cf6"],
            ["🔍 Analyze All Gaps", "#ef4444"],
            ["🗺️ Plan Next Sprint", "#22c55e"],
            ["💡 Ask Abdi for Strategy", "#f59e0b"],
          ].map(([label, color]) => (
            <button key={label as string} style={{
              display: "block", width: "100%", textAlign: "left", marginBottom: 5,
              background: (color as string) + "10", border: `1px solid ${color as string}30`,
              borderRadius: 5, color: color as string, fontSize: 9,
              padding: "5px 10px", cursor: "pointer", fontFamily: "system-ui",
            }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main VisionaryUniverse ────────────────────────────────────────────────────

const DEFAULT_Z = 0.65;

export function VisionaryUniverse({ openRoute }: { openRoute?: (r: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [showIntelligence, setShowIntelligence] = useState(false);
  const [search, setSearch] = useState("");
  const [cam, setCam] = useState({ x: 0, y: 0, z: DEFAULT_Z });
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);

  const handleSelect = useCallback((id: string, clusterId: string) => {
    setSelectedId(id);
    setSelectedClusterId(clusterId);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedId(null);
    setSelectedClusterId(null);
  }, []);

  // Fit to viewport on mount
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const vw = el.clientWidth, vh = el.clientHeight;
    const DIAGRAM_PX = (1300 / 2400) * SVG_SIZE;
    const fit = Math.min(vw / DIAGRAM_PX, vh / DIAGRAM_PX) * 0.90;
    const z = Math.max(0.25, Math.min(2.5, fit));
    const x = vw / 2 - (SVG_SIZE / 2) * z;
    const y = vh / 2 - (SVG_SIZE / 2) * z;
    setCam({ x, y, z });
  }, []);

  // Zoom + pan
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-scroll-panel]")) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setCam(prev => {
        const factor = e.deltaY < 0 ? 1.10 : 0.91;
        const nz = Math.min(8, Math.max(0.10, prev.z * factor));
        const nx = cx - (cx - prev.x) * (nz / prev.z);
        const ny = cy - (cy - prev.y) * (nz / prev.z);
        return { x: nx, y: ny, z: nz };
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 0) {
        const target = e.target as HTMLElement;
        if (e.button === 0 && target.closest("button, a, input")) return;
        e.preventDefault();
        dragRef.current = { startX: e.clientX, startY: e.clientY, camX: 0, camY: 0 };
        setCam(prev => {
          dragRef.current = { startX: e.clientX, startY: e.clientY, camX: prev.x, camY: prev.y };
          return prev;
        });
        el.style.cursor = "grabbing";
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setCam(prev => ({ ...prev, x: dragRef.current!.camX + dx, y: dragRef.current!.camY + dy }));
    };

    const onMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      el.style.cursor = "";
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const fitBoard = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const vw = el.clientWidth, vh = el.clientHeight;
    const DIAGRAM_PX = (1300 / 2400) * SVG_SIZE;
    const fit = Math.min(vw / DIAGRAM_PX, vh / DIAGRAM_PX) * 0.90;
    const z = Math.max(0.25, Math.min(2.5, fit));
    setCam({ x: vw / 2 - (SVG_SIZE / 2) * z, y: vh / 2 - (SVG_SIZE / 2) * z, z });
  }, []);

  const allSystems = useMemo(() => CLUSTERS.flatMap(c => c.systems), []);
  const liveCount    = allSystems.filter(s => s.status === "live").length;
  const plannedCount = allSystems.filter(s => s.status === "planned" || s.status === "gap").length;
  const totalCount   = allSystems.length;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000000", overflow: "hidden" }}>

      {/* Board canvas */}
      <div ref={boardRef} style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 20%, #0a0a14 0%, #000000 70%)",
        cursor: "grab",
        userSelect: "none",
      }}>
        {/* Dot grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, #ffffff14 1px, transparent 1px)",
          backgroundSize: `${28 * cam.z}px ${28 * cam.z}px`,
          backgroundPosition: `${cam.x % (28 * cam.z)}px ${cam.y % (28 * cam.z)}px`,
        }} />

        {/* Universe canvas */}
        <div style={{
          position: "absolute", top: 0, left: 0,
          transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}>
          <div style={{ position: "relative" }}>
            <ClusterDiagram selectedId={selectedId} onSelect={handleSelect} />
          </div>
        </div>

        {/* Detail drawer */}
        <DetailDrawer systemId={selectedId} clusterId={selectedClusterId} onClose={handleCloseDrawer} />

        {/* Zoom controls */}
        <div style={{
          position: "absolute", bottom: 110, right: 16,
          display: "flex", flexDirection: "column", gap: 3, zIndex: 30,
        }}>
          <button onClick={() => setCam(prev => ({ ...prev, z: Math.min(8, prev.z * 1.25) }))} style={{
            background: "#000000bb", border: "1px solid #1e293b55", borderRadius: 5,
            color: "#475569", fontSize: 16, width: 28, height: 28, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
          }}>+</button>
          <button onClick={() => setCam(prev => ({ ...prev, z: Math.max(0.10, prev.z * 0.80) }))} style={{
            background: "#000000bb", border: "1px solid #1e293b55", borderRadius: 5,
            color: "#475569", fontSize: 16, width: 28, height: 28, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
          }}>−</button>
          <button onClick={fitBoard} style={{
            background: "#000000bb", border: "1px solid #1e293b55", borderRadius: 5,
            color: "#334155", fontSize: 9, fontFamily: "monospace", padding: "0 5px",
            height: 22, cursor: "pointer", backdropFilter: "blur(4px)", marginTop: 2,
          }}>⌂</button>
        </div>

        {/* Agent dock */}
        <AgentDock />
      </div>

      {/* Ghost top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: showIntelligence ? 280 : 0, zIndex: 40,
        height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 14px",
        background: "linear-gradient(to bottom, #000000e0 0%, transparent 100%)",
        pointerEvents: "none",
      }}>
        <span style={{ fontSize: 9, color: "#1e293b", pointerEvents: "none", fontFamily: "monospace", letterSpacing: "0.08em" }}>
          TASK ENTERPRISE · C2 VISIONARY
        </span>
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search systems…"
          style={{
            pointerEvents: "auto",
            background: "#00000099", border: "1px solid #1e293b55", borderRadius: 5,
            color: "#94a3b8", fontSize: 10, padding: "3px 10px", width: 160, outline: "none",
            backdropFilter: "blur(4px)",
          }} />
        <button onClick={() => setShowIntelligence(v => !v)} style={{
          pointerEvents: "auto",
          background: showIntelligence ? "#14b8a618" : "transparent",
          border: `1px solid ${showIntelligence ? "#14b8a655" : "#1e293b55"}`,
          borderRadius: 5, color: showIntelligence ? "#14b8a6" : "#475569",
          padding: "2px 10px", fontSize: 10, cursor: "pointer", backdropFilter: "blur(4px)",
        }}>Intelligence</button>
      </div>

      {/* System health badge */}
      <div style={{
        position: "absolute", bottom: 16, left: 16, zIndex: 40,
        display: "flex", alignItems: "center", gap: 10,
        background: "#00000088", border: "1px solid #ffffff06",
        borderRadius: 8, padding: "5px 12px", backdropFilter: "blur(6px)",
        pointerEvents: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 4px #22c55e" }} />
          <span style={{ fontSize: 9, color: "#22c55e44", fontFamily: "monospace" }}>{liveCount} live</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b" }} />
          <span style={{ fontSize: 9, color: "#f59e0b44", fontFamily: "monospace" }}>{plannedCount} planned</span>
        </div>
        <span style={{ fontSize: 9, color: "#1e293b", fontFamily: "monospace" }}>{totalCount} systems</span>
      </div>

      {/* Intelligence panel */}
      {showIntelligence && (
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 35 }}>
          <IntelligencePanel onClose={() => setShowIntelligence(false)} />
        </div>
      )}
    </div>
  );
}
