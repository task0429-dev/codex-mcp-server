import { z } from "zod";
import { AgentRegistry } from "../registry/agents";
import { AgentService } from "../services/agent-service";
import { LogService } from "../services/log-service";

export const toolName = "ask_agent";
export const toolDescription = "Send a task to an agent through the service layer";
export const inputSchema = z.object({
  name: z.string().describe("Agent name"),
  task: z.string().describe("Task description"),
});

export interface AskAgentInput {
  name: string;
  task: string;
}

export interface AskAgentOutput {
  agent: string;
  status: "ok" | "error";
  message: string;
  timestamp: string;
}

export async function handler(input: unknown): Promise<AskAgentOutput> {
  const parsed = inputSchema.parse(input);
  const { name, task } = parsed;

  const agent = AgentRegistry.find(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

  // Check if agent has "ask" action
  if (!agent.allowedActions.includes("ask")) {
    throw new Error(`Agent ${name} does not support ask action`);
  }

  // Route through service layer (which can use gateway if enabled)
  const response = await AgentService.ask(name, task);

  // Log the request
  LogService.appendLog(name, `TASK: ${task}`);
  LogService.appendLog(name, `RESPONSE: ${response.message}`);

  return response;
}
