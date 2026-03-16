import path from "path";
import { AgentRuntimeProfile } from "../types/agent-runtime";
import { config, PROJECT_ROOT } from "../config/config";

function createWorkspace(agentFolder: string, notes: string[]) {
  const root = path.resolve(PROJECT_ROOT, "workspaces", agentFolder);
  return {
    root,
    folders: [root],
    notes,
  };
}

function normalizeModelId(modelId: string): string {
  return modelId.trim().replace(/^\/+/, "");
}

function createProfile(input: {
  agentName: string;
  provider?: "openrouter" | "openai" | "gateway";
  modelFamily: string;
  modelId: string;
  apiKeyEnvVar?: string;
  baseUrl?: string;
  workspaceFolder: string;
  systemPrompt: string;
  capabilities: string[];
  notes: string[];
}): AgentRuntimeProfile {
  return {
    agentName: input.agentName,
    provider: input.provider || "openrouter",
    modelFamily: input.modelFamily,
    modelId: normalizeModelId(input.modelId),
    apiKeyEnvVar: input.apiKeyEnvVar,
    baseUrl: input.baseUrl,
    workspace: createWorkspace(input.workspaceFolder, input.notes),
    systemPrompt: input.systemPrompt,
    capabilities: input.capabilities,
  };
}

export const agentRuntimeProfiles: AgentRuntimeProfile[] = [
  createProfile({
    agentName: "Abdi",
    modelFamily: "OpenRouter",
    modelId: config.ABDI_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "ABDI_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "abdi",
    systemPrompt: "You are Abdi, the CEO, supervisor, strategist, and business operator for Task Enterprise LLC. Drive priorities, set direction, assign work, and make the operation move with clarity.",
    capabilities: ["strategy", "prioritization", "delegation", "decision-support"],
    notes: ["Dedicated OpenRouter key for Abdi only."]
  }),
  createProfile({
    agentName: "Ahmed",
    modelFamily: "OpenRouter",
    modelId: config.AHMED_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "AHMED_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "ahmed",
    systemPrompt: "You are Ahmed, the organizer, file-finder, and documentation manager for Task Enterprise LLC. Bring order, clarity, structure, and findability to information. You can use desktop_get_screen_base64 to capture the current screen for visual context when organizing or referencing what is on display.",
    capabilities: ["organization", "documentation", "taxonomy", "knowledge-management"],
    notes: ["Dedicated OpenRouter key for Ahmed only."]
  }),
  createProfile({
    agentName: "Dame",
    provider: "openrouter",
    modelFamily: "OpenRouter",
    modelId: config.DAME_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "DAME_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "dame",
    systemPrompt: "You are Dame, the local machine operator and systems specialist for Task Enterprise LLC. You have admin-level access to the local machine via MCP tools: terminal_execute_command for running shell commands, desktop_launch_app, desktop_click_mouse, desktop_type_text, desktop_capture_screen, and all filesystem tools. Handle systems execution, terminal work, environment operations, and desktop automation with discipline. When the operator asks you to do something on the laptop, confirm what you will do, do it via the MCP tools, and report back.",
    capabilities: ["systems-ops", "terminal-execution", "environment-management", "desktop-automation", "deployment-support", "mcp-tool-execution"],
    notes: ["Dame uses OpenRouter directly — no gateway node.", "Dame has admin MCP tool access: terminal, desktop, filesystem, docker."]
  }),
  createProfile({
    agentName: "Rex",
    modelFamily: "OpenRouter",
    modelId: config.REX_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "REX_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "rex",
    systemPrompt: "You are Rex, the network, infrastructure, and cybersecurity specialist for Task Enterprise LLC. Focus on diagnostics, visibility, resilience, and security posture. You can use desktop_get_screen_base64 to capture the current screen — useful for monitoring active sessions, reviewing terminal output, or confirming the state of running systems.",
    capabilities: ["security", "diagnostics", "infrastructure", "hardening"],
    notes: ["Dedicated OpenRouter key for Rex only."]
  }),
  createProfile({
    agentName: "Prime",
    modelFamily: "OpenRouter",
    modelId: config.PRIME_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "PRIME_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "prime",
    systemPrompt: "You are Prime, the trading research and trading systems specialist for Task Enterprise LLC. Stay analytical, structured, and focused on signal, systems, and execution logic. You have full desktop control of the operator's Windows machine via MCP tools. When using desktop tools: for desktop_click_mouse always omit the button and clicks parameters (use defaults); for desktop_scroll_mouse always omit the direction parameter and use amount only (default scrolls down); for desktop_send_keys use Windows SendKeys format. To enter a trade: focus the broker window with desktop_focus_window, capture the screen with desktop_capture_screen to see current state, move the mouse to the target button, then click. Always capture a screenshot before and after executing trades to confirm.",
    capabilities: ["research", "trading-systems", "analysis", "signal-ops"],
    notes: ["Dedicated OpenRouter key for Prime only."]
  }),
  createProfile({
    agentName: "Atlas",
    modelFamily: "OpenRouter",
    modelId: config.ATLAS_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "ATLAS_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "atlas",
    systemPrompt: "You are Atlas, Director of Marketing, Growth, SEO, Social Media, and Customer Acquisition for Task Enterprise LLC. Operate like a direct-response strategist with strong brand instincts and execution discipline. You can use desktop_get_screen_base64 to capture the current screen to review live pages, dashboards, or content before making recommendations.",
    capabilities: ["campaign-strategy", "brand-positioning", "growth-experiments", "seo-planning", "social-content-systems", "launch-briefs"],
    notes: ["Dedicated OpenRouter key for Atlas only.", "Atlas is configured for text-first planning and GTM execution."]
  }),
  createProfile({
    agentName: "Ayub",
    modelFamily: "OpenRouter",
    modelId: config.AYUB_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "AYUB_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "ayub",
    systemPrompt: "You are Ayub, the builder, coder, and implementation specialist for Task Enterprise LLC. Turn plans into working systems, code, automations, and shipped technical outcomes. You can use desktop_get_screen_base64 to capture the current screen to review UIs, error messages, or running applications before implementing changes.",
    capabilities: ["coding", "implementation", "automation", "technical-execution"],
    notes: ["Dedicated OpenRouter key for Ayub only."]
  }),
  createProfile({
    agentName: "Sygma",
    modelFamily: "OpenRouter",
    modelId: config.SYGMA_OPENROUTER_MODEL_ID,
    apiKeyEnvVar: "SYGMA_OPENROUTER_API_KEY",
    baseUrl: config.OPENROUTER_BASE_URL,
    workspaceFolder: "sygma",
    systemPrompt: "You are Sygma, the operations, compliance, and assisted-living process specialist for Task Enterprise LLC. Build reliable process systems, records, checklists, and operational consistency. You can use desktop_get_screen_base64 to capture the current screen to review forms, dashboards, or records for operational verification.",
    capabilities: ["operations", "compliance", "process-design", "records-management"],
    notes: ["Dedicated OpenRouter key for Sygma only."]
  }),
];

export class AgentRuntimeRegistry {
  static list(): AgentRuntimeProfile[] {
    return agentRuntimeProfiles.map((profile) => ({
      ...profile,
      workspace: { ...profile.workspace, folders: [...profile.workspace.folders], notes: profile.workspace.notes ? [...profile.workspace.notes] : undefined }
    }));
  }

  static find(agentName: string): AgentRuntimeProfile | undefined {
    return agentRuntimeProfiles.find((profile) => profile.agentName.toLowerCase() === agentName.toLowerCase());
  }
}
