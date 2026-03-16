import { z } from "zod";
import { AgentRegistry } from "../registry/agents";
import { AgentService } from "../services/agent-service";
import { RESTART_ALLOWLIST } from "../config";
import { LogService } from "../services/log-service";

export const toolName = "restart_agent";
export const toolDescription = "Restart an approved agent (restricted)";
export const inputSchema = z.object({
  name: z.string().describe("Agent name"),
});

export interface RestartAgentInput {
  name: string;
}

export interface RestartAgentOutput {
  agent: string;
  status: "ok" | "error";
  message: string;
  timestamp: string;
}

export async function handler(input: unknown): Promise<RestartAgentOutput> {
  const parsed = inputSchema.parse(input);
  const { name } = parsed;

  const agent = AgentRegistry.find(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

  // CRITICAL SAFETY CHECK: Only approved agents can be restarted
  if (!RESTART_ALLOWLIST.includes(agent.name)) {
    const error = `Agent ${agent.name} is not in restart allowlist. Only these agents can be restarted: ${RESTART_ALLOWLIST.join(", ")}`;
    LogService.appendLog(name, `RESTART DENIED: ${error}`);
    throw new Error(error);
  }

  // Check if agent supports restart
  if (!agent.allowedActions.includes("restart")) {
    throw new Error(`Agent ${agent.name} does not support restart action`);
  }

  // Route through service layer
  const response = await AgentService.restart(name);
  LogService.appendLog(name, `RESTART REQUESTED: ${response.message}`);

  return response;
}
