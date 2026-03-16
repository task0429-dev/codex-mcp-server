import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./create-server";

/**
 * Set up stdio transport for local Codex connection
 * This allows the Codex Windows app to invoke MCP tools via stdio JSON-RPC
 */
export async function createStdioTransport(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Log startup (to stderr so it doesn't interfere with JSON-RPC on stdout)
  console.error(`[${new Date().toISOString()}] Codex MCP server (stdio) started`);
  console.error(`[${new Date().toISOString()}] Listening for JSON-RPC on stdio`);
}
