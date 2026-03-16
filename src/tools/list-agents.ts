import { z } from "zod";
import { AgentRegistry } from "../registry/agents";

export const toolName = "list_agents";
export const toolDescription = "List all available agents with metadata";
export const inputSchema = z.object({});

export interface ListAgentsInput {
  // No input required
}

export interface ListAgentsOutput {
  agents: Array<{
    name: string;
    role: string;
    description: string;
    allowedActions: string[];
    supportedTransports: string[];
  }>;
  count: number;
}

export async function handler(_input: unknown): Promise<ListAgentsOutput> {
  const agents = AgentRegistry.list();
  return {
    agents: agents.map((a) => ({
      name: a.name,
      role: a.role,
      description: a.description,
      allowedActions: a.allowedActions,
      supportedTransports: a.supportedTransports,
    })),
    count: agents.length,
  };
}
