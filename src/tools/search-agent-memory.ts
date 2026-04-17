import { z } from "zod";
import { MemoryService } from "../services/memory-service";

export const toolName = "search_agent_memory";
export const toolDescription = "Search an agent or namespace memory files for a query";
export const inputSchema = z.object({
  name: z.string().describe("Agent name or memory namespace"),
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

  const results = MemoryService.searchMemory(name, query);

  return {
    agent: name,
    query,
    results: results.map((r) => ({
      file: r.file,
      snippet: r.snippet,
    })),
    resultCount: results.length,
    timestamp: new Date().toISOString(),
  };
}
