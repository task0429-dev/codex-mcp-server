import { z } from "zod";
import { AgentRegistry } from "../registry/agents";
import { LogService } from "../services/log-service";

export const toolName = "get_recent_logs";
export const toolDescription = "Retrieve recent log entries for an agent";
export const inputSchema = z.object({
  name: z.string().optional().describe("Agent name (optional)"),
  lines: z.number().optional().default(100).describe("Number of recent lines"),
});

export interface GetRecentLogsInput {
  name?: string;
  lines?: number;
}

export interface GetRecentLogsOutput {
  agent?: string;
  logs: string;
  lineCount: number;
  timestamp: string;
}

export async function handler(input: unknown): Promise<GetRecentLogsOutput> {
  const parsed = inputSchema.parse(input);
  const { name, lines = 100 } = parsed;

  // Validate agent if specified
  if (name) {
    const agent = AgentRegistry.find(name);
    if (!agent) {
      throw new Error(`Unknown agent: ${name}`);
    }
  }

  const logs = LogService.getRecentLogs(name, lines);

  return {
    agent: name,
    logs,
    lineCount: lines,
    timestamp: new Date().toISOString(),
  };
}
