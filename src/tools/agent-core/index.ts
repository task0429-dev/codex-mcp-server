import * as agentStatus from "../agent-status";
import * as askAgent from "../ask-agent";
import * as getRecentLogs from "../get-recent-logs";
import * as listAgents from "../list-agents";
import * as listSessions from "../list-sessions";
import * as restartAgent from "../restart-agent";
import * as searchAgentMemory from "../search-agent-memory";
import * as unlockSession from "../unlock-session";
import { ToolDefinition } from "../../types/tool";

const group = "agent-core";

const wrap = (tool: { toolName: string; toolDescription: string; inputSchema: any; handler: (input: any) => Promise<any> }): ToolDefinition => ({
  name: tool.toolName,
  description: tool.toolDescription,
  inputSchema: tool.inputSchema,
  group,
  handler: async (input) => tool.handler(input),
});

export const agentCoreTools: ToolDefinition[] = [
  wrap(listAgents),
  wrap(agentStatus),
  wrap(askAgent),
  wrap(restartAgent),
  wrap(getRecentLogs),
  wrap(searchAgentMemory),
  wrap(listSessions),
  wrap(unlockSession),
];
