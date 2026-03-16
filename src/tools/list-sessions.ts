import { z } from "zod";
import { AgentRegistry } from "../registry/agents";
import { SessionService } from "../services/session-service";

export const toolName = "list_sessions";
export const toolDescription = "List session metadata for an agent";
export const inputSchema = z.object({
  name: z.string().describe("Agent name"),
});

export interface ListSessionsInput {
  name: string;
}

export interface ListSessionsOutput {
  agent: string;
  sessions: Array<{
    file: string;
    mtime: string;
    size: number;
    locked: boolean;
    lockAge?: number;
  }>;
  sessionCount: number;
  timestamp: string;
}

export async function handler(input: unknown): Promise<ListSessionsOutput> {
  const parsed = inputSchema.parse(input);
  const { name } = parsed;

  const agent = AgentRegistry.find(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

  const sessions = SessionService.listSessions(name);

  return {
    agent: agent.name,
    sessions,
    sessionCount: sessions.length,
    timestamp: new Date().toISOString(),
  };
}
