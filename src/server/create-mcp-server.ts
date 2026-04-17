import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { MCP_HTTP_BACKEND_TIMEOUT_MS, MCP_HTTP_BACKEND_URL } from "../config";
import { logger } from "../core/logger";
import { getAllTools, getStartupSummary, getTool } from "./tool-registry";
import { toToolError } from "../utils/errors";
import { memoryIngestionService } from "../memory/ingestion-service";

type BackendTool = {
  name: string;
  description: string;
  schema?: unknown;
};

function getLocalToolDefinitions() {
  return getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema as any).toJSON?.() || {},
  }));
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_HTTP_BACKEND_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const payload: any = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload?.error || `HTTP ${response.status} ${response.statusText}`.trim();
      throw new Error(message);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function listToolsFromBackend(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
  const baseUrl = MCP_HTTP_BACKEND_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("MCP_HTTP_BACKEND_URL is not configured");
  }

  const payload = await fetchJson(`${baseUrl}/api/tools`);
  const backendTools = Array.isArray(payload?.tools) ? (payload.tools as BackendTool[]) : [];

  return backendTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.schema || {},
  }));
}

async function callToolOnBackend(name: string, args: unknown): Promise<any> {
  const baseUrl = MCP_HTTP_BACKEND_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("MCP_HTTP_BACKEND_URL is not configured");
  }

  const payload = await fetchJson(`${baseUrl}/api/tools/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      arguments: args || {},
    }),
  });

  if (payload?.success === false) {
    throw new Error(payload.error || `Backend tool failed: ${name}`);
  }

  return payload.result;
}

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "codex-mcp-server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const toolsListSchema = z.object({ method: z.literal("tools/list") });
  const toolsCallSchema = z.object({
    method: z.literal("tools/call"),
    params: z.object({
      name: z.string(),
      arguments: z.any().optional(),
    }),
  });

  server.setRequestHandler(toolsListSchema, async () => {
    if (MCP_HTTP_BACKEND_URL) {
      try {
        return {
          tools: await listToolsFromBackend(),
        };
      } catch (error) {
        logger.warn("HTTP backend unavailable for tools/list; falling back to local tools.", { error: String(error) });
      }
    }

    return {
      tools: getLocalToolDefinitions(),
    };
  });

  server.setRequestHandler(toolsCallSchema, async (request: any) => {
    const name = request.params.name;
    const args = request.params.arguments || {};
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (MCP_HTTP_BACKEND_URL) {
      try {
        const proxiedResult = await callToolOnBackend(name, args);
        void memoryIngestionService.captureMcpToolCall("stdio", name, args, "success", requestId);
        return {
          content: [{ type: "text", text: JSON.stringify(proxiedResult, null, 2) }],
        };
      } catch (error) {
        logger.warn("HTTP backend unavailable for tools/call; falling back to local execution.", {
          tool: name,
          error: String(error),
        });
      }
    }

    const tool = getTool(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    logger.info("tool_call_started", { requestId, tool: name, group: tool.group });
    try {
      const validated = tool.inputSchema.parse(args);
      const result = await tool.handler(validated, { requestId });
      void memoryIngestionService.captureMcpToolCall("stdio", name, args, "success", requestId);
      logger.info("tool_call_completed", { requestId, tool: name, group: tool.group });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      void memoryIngestionService.captureMcpToolCall("stdio", name, args, "error", requestId, (error as any)?.message || String(error));
      const toolError = toToolError(error);
      logger.error("tool_call_failed", {
        requestId,
        tool: name,
        group: tool.group,
        code: toolError.code,
        details: toolError.details,
        error: toolError.message,
      });
      throw new Error(toolError.message);
    }
  });

  logger.info("mcp_server_initialized", {
    toolGroups: getStartupSummary(),
  });

  return server;
}

