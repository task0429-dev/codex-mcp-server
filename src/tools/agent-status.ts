import { z } from "zod";
import { AgentRegistry } from "../registry/agents";
import { AgentService } from "../services/agent-service";

export const toolName = "agent_status";
export const toolDescription = "Get current status of a specific agent";
export const inputSchema = z.object({
  name: z.string().describe("Agent name"),
});

export interface AgentStatusInput {
  name: string;
}

export interface AgentStatusOutput {
  agent: string;
  health: string;
  lastHeartbeat: string;
  transport: string;
  allowedActions: string[];
  message: string;
}

export async function handler(input: unknown): Promise<AgentStatusOutput> {
  const parsed = inputSchema.parse(input);
  const { name } = parsed;

  const agent = AgentRegistry.find(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

  const status = await AgentService.status(name);

  return {
    agent: agent.name,
    health: status.health,
    lastHeartbeat: status.lastHeartbeat,
    transport: agent.supportedTransports?.join(",") || "unknown",
    allowedActions: agent.allowedActions,
    message: status.message,
  };
}
