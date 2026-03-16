import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { ToolDefinition } from "../../types/tool";
import { ToolError } from "../../utils/errors";

const group = "web";

const MetadataSchema = z.object({
  url: z.string().url(),
});

const HealthCheckSchema = z.object({
  url: z.string().url(),
  expected_status: z.number().int().min(100).max(599).optional(),
});

const JsonTransformSchema = z.object({
  input: z.string().describe("JSON string to format."),
  operation: z.enum(["pretty", "minify"]).default("pretty"),
});

function assertHostAllowed(rawUrl: string) {
  if (hubConfig.web.allowedHosts.length === 0) {
    return;
  }

  const hostname = new URL(rawUrl).hostname;
  if (!hubConfig.web.allowedHosts.includes(hostname)) {
    throw new ToolError(`Host is not allowlisted: ${hostname}`, {
      code: "permission_denied",
      statusCode: 403,
    });
  }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hubConfig.web.requestTimeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const webTools: ToolDefinition[] = [
  {
    name: "web_fetch_metadata",
    description: "Fetch URL metadata and a compact preview for a page.",
    inputSchema: MetadataSchema,
    group,
    handler: async (input) => {
      assertHostAllowed(input.url);
      const response = await fetchWithTimeout(input.url);
      const body = await response.text();
      const title = body.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() || null;
      const description =
        body.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] ||
        body.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] ||
        null;
      return {
        url: input.url,
        status: response.status,
        content_type: response.headers.get("content-type"),
        title,
        description,
      };
    },
  },
  {
    name: "web_service_health_check",
    description: "Run a simple HTTP health check against a URL.",
    inputSchema: HealthCheckSchema,
    group,
    handler: async (input) => {
      assertHostAllowed(input.url);
      const startedAt = Date.now();
      const response = await fetchWithTimeout(input.url);
      return {
        url: input.url,
        status: response.status,
        ok: input.expected_status ? response.status === input.expected_status : response.ok,
        response_time_ms: Date.now() - startedAt,
      };
    },
  },
  {
    name: "web_json_transform",
    description: "Pretty-print or minify JSON data.",
    inputSchema: JsonTransformSchema,
    group,
    handler: async (input) => {
      const parsed = JSON.parse(input.input);
      return {
        operation: input.operation,
        output: input.operation === "pretty" ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed),
      };
    },
  },
];
