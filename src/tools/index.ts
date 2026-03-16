// Agent core tools
import * as listAgents from "./list-agents";
import * as agentStatus from "./agent-status";
import * as askAgent from "./ask-agent";
import * as restartAgent from "./restart-agent";
import * as getRecentLogs from "./get-recent-logs";
import * as searchAgentMemory from "./search-agent-memory";
import * as listSessions from "./list-sessions";
import * as unlockSession from "./unlock-session";
import { desktopTools } from "./desktop";

import { filesystemTools } from "../integrations/filesystem";
import { terminalTools } from "../integrations/terminal";
import { dockerTools } from "../integrations/docker";
import { githubTools } from "../integrations/github";
import { notionTools } from "../integrations/notion";
import { discordTools } from "../integrations/discord";
import { telegramTools } from "../integrations/telegram";
import { googleDriveTools } from "../integrations/google-drive";
import { supabaseTools } from "../integrations/supabase";
import { stripeTools } from "../integrations/stripe";
import { airtableTools } from "../integrations/airtable";
import { n8nTools } from "../integrations/n8n";
import { hubspotTools } from "../integrations/hubspot";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  handler: (input: any, context?: any) => Promise<any>;
}

export const tools: ToolDefinition[] = [
  {
    name: listAgents.toolName,
    description: listAgents.toolDescription,
    inputSchema: listAgents.inputSchema,
    handler: listAgents.handler,
  },
  {
    name: agentStatus.toolName,
    description: agentStatus.toolDescription,
    inputSchema: agentStatus.inputSchema,
    handler: agentStatus.handler,
  },
  {
    name: askAgent.toolName,
    description: askAgent.toolDescription,
    inputSchema: askAgent.inputSchema,
    handler: askAgent.handler,
  },
  {
    name: restartAgent.toolName,
    description: restartAgent.toolDescription,
    inputSchema: restartAgent.inputSchema,
    handler: restartAgent.handler,
  },
  {
    name: getRecentLogs.toolName,
    description: getRecentLogs.toolDescription,
    inputSchema: getRecentLogs.inputSchema,
    handler: getRecentLogs.handler,
  },
  {
    name: searchAgentMemory.toolName,
    description: searchAgentMemory.toolDescription,
    inputSchema: searchAgentMemory.inputSchema,
    handler: searchAgentMemory.handler,
  },
  {
    name: listSessions.toolName,
    description: listSessions.toolDescription,
    inputSchema: listSessions.inputSchema,
    handler: listSessions.handler,
  },
  {
    name: unlockSession.toolName,
    description: unlockSession.toolDescription,
    inputSchema: unlockSession.inputSchema,
    handler: unlockSession.handler,
  },
  ...desktopTools,
  ...filesystemTools,
  ...terminalTools,
  ...dockerTools,
  ...githubTools,
  ...notionTools,
  ...discordTools,
  ...telegramTools,
  ...googleDriveTools,
  ...supabaseTools,
  ...stripeTools,
  ...airtableTools,
  ...n8nTools,
  ...hubspotTools,
];

export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.name === name);
}

export function getAllTools(): ToolDefinition[] {
  return tools;
}
