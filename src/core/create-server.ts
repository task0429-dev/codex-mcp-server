import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { tools } from "../tools/index";

/**
 * Creates and configures an MCP server with all tools registered
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "codex-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools
  // const tools = getAllTools();

  // Define request schemas for tools endpoint
  const toolsListSchema = z.object({ method: z.literal("tools/list") });
  const toolsCallSchema = z.object({
    method: z.literal("tools/call"),
    params: z.object({
      name: z.string(),
      arguments: z.any().optional(),
    }),
  });

  // List tools endpoint
  server.setRequestHandler(toolsListSchema, async () => {
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema.toJSON?.() || {},
      })),
    };
  });

  // Call tool endpoint
  server.setRequestHandler(toolsCallSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find((t) => t.name === name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      const validated = tool.inputSchema.parse(args || {});
      const result = await tool.handler(validated);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      throw new Error(err.message || String(err));
    }
  });

  return server;
}
