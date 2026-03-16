import { z } from "zod";
import { AgentRegistry } from "../registry/agents";
import { MemoryService } from "../services/memory-service";

export const toolName = "search_agent_memory";
export const toolDescription = "Search an agent's memory files for a query";
export const inputSchema = z.object({
  name: z.string().describe("Agent name"),
  query: z.string().describe("Search query"),
});

export interface SearchAgentMemoryInput {
  name: string;
  query: string;
}

export interface SearchAgentMemoryOutput {
  agent: string;
  query: string;
  results: Array<{
    file: string;
    snippet: string;
  }>;
  resultCount: number;
  timestamp: string;
}

export async function handler(input: unknown): Promise<SearchAgentMemoryOutput> {
  const parsed = inputSchema.parse(input);
  const { name, query } = parsed;

  const agent = AgentRegistry.find(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

  const results = MemoryService.searchMemory(name, query);

  return {
    agent: agent.name,
    query,
    results: results.map((r) => ({
      file: r.file,
      snippet: r.snippet,
    })),
    resultCount: results.length,
    timestamp: new Date().toISOString(),
  };
}
