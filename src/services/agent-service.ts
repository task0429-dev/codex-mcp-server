import { AgentRegistry } from "../registry/agents";
import { AgentRuntimeRegistry } from "../agents/runtime-profiles";
import {
  OPENROUTER_BASE_URL,
  GATEWAY_API_KEY,
  GATEWAY_AUTH_HEADER,
  GATEWAY_CHAT_PATH,
  GATEWAY_ENABLED,
  GATEWAY_LOGIN_PATH,
  GATEWAY_URL,
  GATEWAY_WS_ORIGIN,
  GATEWAY_WS_URL,
} from "../config/config";
import { askOpenClawGateway } from "./openclaw-gateway-service";
import { getAllTools, ToolDefinition } from "../tools";
import { AccessPolicy } from "../policies/policies";
import { AgentPermissions, PermissionLevel } from "../types/permissions";

const GATEWAY_REQUEST_TIMEOUT_MS = 12_000;

export interface AgentResponse {
  agent: string;
  status: "ok" | "error";
  message: string;
  timestamp: string;
}

interface ProviderResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  content?: string | Array<{ type?: string; text?: string }>;
  output_text?: string;
  response?: string;
  message?: string;
  error?: {
    message?: string;
  };
}

export class AgentService {
  private static async fetchWithTimeout(input: string, init: RequestInit, timeoutMs = GATEWAY_REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  static async ask(name: string, task: string): Promise<AgentResponse> {
    const agent = AgentRegistry.find(name);
    if (!agent) {
      return { agent: name, status: "error", message: `Unknown agent: ${name}`, timestamp: new Date().toISOString() };
    }

    const runtimeProfile = AgentRuntimeRegistry.find(name);
    if (runtimeProfile) {
      if (runtimeProfile.provider === "gateway") {
        return this.askViaGateway(runtimeProfile, task);
      }
      return this.askViaRuntime(runtimeProfile, task);
    }

    return this.askStub(name, task);
  }

  private static buildGatewayUrl(pathTemplate: string, runtimeProfile?: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>): string {
    const resolvedPath = pathTemplate.split("{agent}").join((runtimeProfile?.agentName || "").toLowerCase());
    if (/^https?:\/\//i.test(resolvedPath)) {
      return resolvedPath;
    }

    const normalizedBase = GATEWAY_URL.endsWith("/") ? GATEWAY_URL : `${GATEWAY_URL}/`;
    const normalizedPath = resolvedPath.startsWith("/") ? resolvedPath.slice(1) : resolvedPath;
    return new URL(normalizedPath, normalizedBase).toString();
  }

  private static extractMessage(payload: ProviderResponse | undefined): string {
    if (!payload) return "";

    if (typeof payload.output_text === "string" && payload.output_text.trim()) {
      return payload.output_text.trim();
    }

    if (typeof payload.response === "string" && payload.response.trim()) {
      return payload.response.trim();
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }

    const choiceContent = payload.choices?.[0]?.message?.content;
    if (Array.isArray(choiceContent)) {
      const text = choiceContent.map((part) => part.text || "").join("\n").trim();
      if (text) return text;
    }

    if (typeof choiceContent === "string" && choiceContent.trim()) {
      return choiceContent.trim();
    }

    if (Array.isArray(payload.content)) {
      const text = payload.content.map((part) => part.text || "").join("\n").trim();
      if (text) return text;
    }

    if (typeof payload.content === "string" && payload.content.trim()) {
      return payload.content.trim();
    }

    return "";
  }

  private static parseSseTranscript(body: string): string {
    let eventType = "";
    let full = "";

    for (const line of body.split(/\r?\n/)) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
        continue;
      }

      if (!line.startsWith("data: ")) {
        continue;
      }

      const raw = line.slice(6).trim();
      if (!raw) {
        eventType = "";
        continue;
      }

      try {
        const payload = JSON.parse(raw) as { text?: string; message?: string };
        if (eventType === "chunk" && payload.text) {
          full += payload.text;
        } else if (eventType === "done" && payload.text) {
          full = payload.text;
        } else if (eventType === "error" && payload.message) {
          throw new Error(payload.message);
        }
      } catch (error) {
        if (error instanceof Error && error.message && !error.message.startsWith("Unexpected token")) {
          throw error;
        }
      }

      eventType = "";
    }

    return full.trim();
  }

  private static async loginToOpenClaw(): Promise<string | undefined> {
    if (!GATEWAY_API_KEY) return undefined;

    const response = await this.fetchWithTimeout(this.buildGatewayUrl(GATEWAY_LOGIN_PATH), {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token: GATEWAY_API_KEY }).toString(),
    });

    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.bind(response.headers);
    const cookieParts = getSetCookie ? getSetCookie() : [];
    const singleCookie = response.headers.get("set-cookie");
    const cookieHeader = [...cookieParts, ...(singleCookie ? [singleCookie] : [])]
      .map((entry) => entry.split(";")[0])
      .filter(Boolean)
      .join("; ");

    if (!response.ok && response.status !== 302 && response.status !== 303) {
      throw new Error(`OpenClaw login failed with status ${response.status}.`);
    }

    return cookieHeader || undefined;
  }

  private static usesOpenClawSessionGateway(): boolean {
    return GATEWAY_CHAT_PATH.includes("{agent}") || GATEWAY_CHAT_PATH.startsWith("/api/chat/");
  }

  private static usesOpenClawWebSocketGateway(): boolean {
    if (GATEWAY_WS_URL) {
      return true;
    }

    return this.usesOpenClawSessionGateway();
  }

  private static async askViaGateway(runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>, task: string): Promise<AgentResponse> {
    if (!GATEWAY_ENABLED || !GATEWAY_URL) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: `Agent ${runtimeProfile.agentName} is pinned to ${runtimeProfile.modelId} through the OpenClaw gateway, but the gateway is disabled. Set GATEWAY_ENABLED=true and point GATEWAY_URL at your OpenClaw service.`,
        timestamp: new Date().toISOString(),
      };
    }

    const errors: string[] = [];

    if (this.usesOpenClawWebSocketGateway()) {
      const wsResult = await this.askViaOpenClawWebSocket(runtimeProfile, task);
      if (wsResult.status === "ok") return wsResult;
      errors.push(`WebSocket: ${wsResult.message}`);
    }

    if (this.usesOpenClawSessionGateway()) {
      const sessionResult = await this.askViaOpenClawSession(runtimeProfile, task);
      if (sessionResult.status === "ok") return sessionResult;
      errors.push(`Session API: ${sessionResult.message}`);
    }

    const compatResult = await this.askViaOpenAiCompatibleGateway(runtimeProfile, task);
    if (compatResult.status === "ok") return compatResult;
    errors.push(`OpenAI-compatible API: ${compatResult.message}`);

    const emergencyFallback = await this.askViaEmergencyOpenRouter(runtimeProfile, task);
    if (emergencyFallback?.status === "ok") {
      return emergencyFallback;
    }
    if (emergencyFallback?.status === "error") {
      errors.push(`OpenRouter emergency fallback: ${emergencyFallback.message}`);
    }

    return {
      agent: runtimeProfile.agentName,
      status: "error",
      message: `All gateway transports failed for ${runtimeProfile.agentName}. ${errors.join(" | ")}`,
      timestamp: new Date().toISOString(),
    };
  }

  private static async askViaEmergencyOpenRouter(
    runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>,
    task: string
  ): Promise<AgentResponse | null> {
    const keyEnv = `${runtimeProfile.agentName.toUpperCase()}_OPENROUTER_API_KEY`;
    const modelEnv = `${runtimeProfile.agentName.toUpperCase()}_OPENROUTER_MODEL_ID`;
    const apiKey = process.env[keyEnv];
    if (!apiKey || !OPENROUTER_BASE_URL) {
      return null;
    }

    const modelId = process.env[modelEnv] || runtimeProfile.modelId;
    try {
      const response = await this.fetchWithTimeout(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: runtimeProfile.systemPrompt },
            { role: "user", content: task },
          ],
        }),
      });

      let payload: ProviderResponse | undefined;
      try {
        payload = (await response.json()) as ProviderResponse;
      } catch {
        payload = undefined;
      }

      if (!response.ok) {
        return {
          agent: runtimeProfile.agentName,
          status: "error",
          message: payload?.error?.message || `OpenRouter fallback failed with status ${response.status}.`,
          timestamp: new Date().toISOString(),
        };
      }

      const text = this.extractMessage(payload);
      return {
        agent: runtimeProfile.agentName,
        status: text ? "ok" : "error",
        message: text
          ? `[Gateway fallback via OpenRouter] ${text}`
          : "Gateway fallback via OpenRouter returned an empty response.",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  private static async askViaOpenClawWebSocket(runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>, task: string): Promise<AgentResponse> {
    try {
      const text = await askOpenClawGateway(task, {
        gatewayUrl: GATEWAY_URL,
        wsUrl: GATEWAY_WS_URL,
        origin: GATEWAY_WS_ORIGIN,
        token: GATEWAY_API_KEY,
        sessionKey: "main",
        timeoutMs: GATEWAY_REQUEST_TIMEOUT_MS,
      });

      return {
        agent: runtimeProfile.agentName,
        status: text ? "ok" : "error",
        message: text || `Agent ${runtimeProfile.agentName} returned an empty response from the OpenClaw gateway.`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  private static async askViaOpenClawSession(runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>, task: string): Promise<AgentResponse> {
    let cookieHeader: string | undefined;
    try {
      cookieHeader = await this.loginToOpenClaw();
    } catch (error) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: `OpenClaw login failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json, text/plain",
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    let response: globalThis.Response;
    try {
      response = await this.fetchWithTimeout(this.buildGatewayUrl(GATEWAY_CHAT_PATH, runtimeProfile), {
        method: "POST",
        headers,
        body: JSON.stringify({ message: task }),
      });
    } catch (error) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: `Unable to reach the OpenClaw gateway at ${this.buildGatewayUrl(GATEWAY_CHAT_PATH, runtimeProfile)}: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }

    const raw = await response.text();
    if (!response.ok) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: raw.trim() || `OpenClaw gateway call failed with status ${response.status}.`,
        timestamp: new Date().toISOString(),
      };
    }

    let text = "";
    try {
      text = this.parseSseTranscript(raw);
    } catch (error) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }

    if (!text) {
      try {
        text = this.extractMessage(JSON.parse(raw) as ProviderResponse);
      } catch {
        text = raw.trim();
      }
    }

    return {
      agent: runtimeProfile.agentName,
      status: text ? "ok" : "error",
      message: text || `Agent ${runtimeProfile.agentName} returned an empty response from the OpenClaw gateway.`,
      timestamp: new Date().toISOString(),
    };
  }

  private static async askViaOpenAiCompatibleGateway(runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>, task: string): Promise<AgentResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (GATEWAY_API_KEY) {
      if (GATEWAY_AUTH_HEADER.toLowerCase() === "authorization") {
        headers.Authorization = `Bearer ${GATEWAY_API_KEY}`;
      } else {
        headers[GATEWAY_AUTH_HEADER] = GATEWAY_API_KEY;
      }
    }

    let response: globalThis.Response;
    try {
      response = await this.fetchWithTimeout(this.buildGatewayUrl(GATEWAY_CHAT_PATH, runtimeProfile), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: runtimeProfile.modelId,
          messages: [
            { role: "system", content: runtimeProfile.systemPrompt },
            { role: "user", content: task },
          ],
          metadata: {
            agent: runtimeProfile.agentName,
            capabilities: runtimeProfile.capabilities,
          },
        }),
      });
    } catch (error) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: `Unable to reach the OpenClaw gateway at ${this.buildGatewayUrl(GATEWAY_CHAT_PATH, runtimeProfile)}: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }

    let payload: ProviderResponse | undefined;
    try {
      payload = (await response.json()) as ProviderResponse;
    } catch {
      payload = undefined;
    }

    if (!response.ok) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: payload?.error?.message || payload?.message || `OpenClaw gateway call failed with status ${response.status}.`,
        timestamp: new Date().toISOString(),
      };
    }

    const text = this.extractMessage(payload);
    return {
      agent: runtimeProfile.agentName,
      status: text ? "ok" : "error",
      message: text || `Agent ${runtimeProfile.agentName} returned an empty response from the OpenClaw gateway.`,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Zod schema → JSON Schema (minimal, covers all tool schemas in this project) ──
  private static zodToJsonSchema(schema: any): Record<string, any> {
    if (!schema || !schema._def) return {};
    const typeName: string = schema._def.typeName ?? "";
    switch (typeName) {
      case "ZodString": return { type: "string", ...(schema._def.description ? { description: schema._def.description } : {}) };
      case "ZodNumber": return { type: "number" };
      case "ZodBoolean": return { type: "boolean" };
      case "ZodArray": return { type: "array", items: this.zodToJsonSchema(schema._def.type) };
      case "ZodEnum": return { type: "string", enum: schema._def.values };
      case "ZodOptional": return this.zodToJsonSchema(schema._def.innerType);
      case "ZodNullable": return this.zodToJsonSchema(schema._def.innerType);
      case "ZodObject": {
        const shape = typeof schema._def.shape === "function" ? schema._def.shape() : schema._def.shape ?? {};
        const properties: Record<string, any> = {};
        const required: string[] = [];
        for (const [key, val] of Object.entries(shape)) {
          const inner = val as any;
          const isOpt = inner._def?.typeName === "ZodOptional";
          properties[key] = this.zodToJsonSchema(inner);
          if (!isOpt) required.push(key);
        }
        return { type: "object", properties, ...(required.length ? { required } : {}) };
      }
      default: return {};
    }
  }

  // ── Map tool name prefix → permission integration key ──
  private static toolIntegration(toolName: string): keyof AgentPermissions | null {
    if (!toolName) return null;
    if (toolName.startsWith("terminal_")) return "terminal";
    if (toolName.startsWith("filesystem_") || toolName.startsWith("file_")) return "filesystem";
    if (toolName.startsWith("desktop_")) return "desktop";
    if (toolName.startsWith("docker_")) return "docker";
    if (toolName.startsWith("git_") || toolName.startsWith("github_")) return "github";
    if (toolName.startsWith("notion_")) return "notion";
    if (toolName.startsWith("discord_")) return "discord";
    if (toolName.startsWith("telegram_")) return "telegram";
    if (toolName.startsWith("drive_") || toolName.startsWith("google_drive_")) return "google_drive";
    if (toolName.startsWith("supabase_") || toolName.startsWith("db_") || toolName.startsWith("database_")) return "supabase";
    if (toolName.startsWith("stripe_")) return "stripe";
    if (toolName.startsWith("airtable_")) return "airtable";
    if (toolName.startsWith("n8n_")) return "n8n";
    return "agent_core";
  }

  // ── Build the tools array for an agent (only tools the agent has access to) ──
  private static buildAgentTools(agentName: string): { def: ToolDefinition; openai: any }[] {
    return getAllTools()
      .filter((tool) => {
        if (!tool?.name) return false;
        const integration = this.toolIntegration(tool.name);
        if (!integration) return false;
        const level: PermissionLevel = integration === "terminal" || integration === "desktop" ? "execute" : "read";
        return AccessPolicy.hasPermission(agentName, integration, level);
      })
      .map((tool) => ({
        def: tool,
        openai: {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: this.zodToJsonSchema(tool.inputSchema),
          },
        },
      }));
  }

  // ── Execute a single tool call from the LLM, injecting agentName automatically ──
  // Returns { text, imageUrl? } — imageUrl is set when the tool produces a vision result
  private static async executeToolCall(agentName: string, toolName: string, rawArgs: any): Promise<{ text: string; imageUrl?: string }> {
    const tool = getAllTools().find((t) => t.name === toolName);
    if (!tool) return { text: JSON.stringify({ error: `Tool "${toolName}" not found.` }) };

    // Auto-inject agentName if the schema expects it
    const args = typeof rawArgs === "object" && rawArgs !== null ? { ...rawArgs } : {};
    const shape = typeof tool.inputSchema?._def?.shape === "function"
      ? tool.inputSchema._def.shape()
      : (tool.inputSchema?._def?.shape ?? {});
    if ("agentName" in shape) args.agentName = agentName;

    try {
      const validated = tool.inputSchema.parse ? tool.inputSchema.parse(args) : args;
      const result = await tool.handler(validated, { requestId: `agent_${agentName}_${Date.now()}` });

      // Vision result: extract base64 and return as image_url for the LLM to actually see
      if (toolName === "desktop_get_screen_base64" && result?.base64) {
        const { base64, mime, width, height, format } = result as any;
        return {
          text: JSON.stringify({ width, height, format, captured: true }),
          imageUrl: `data:${mime ?? "image/jpeg"};base64,${base64}`,
        };
      }

      return { text: JSON.stringify(result ?? { ok: true }) };
    } catch (err: any) {
      return { text: JSON.stringify({ error: err?.message ?? String(err) }) };
    }
  }

  private static async askViaRuntime(runtimeProfile: ReturnType<typeof AgentRuntimeRegistry.find>, task: string): Promise<AgentResponse> {
    if (!runtimeProfile) throw new Error("Runtime profile missing.");

    const apiKey = runtimeProfile.apiKeyEnvVar ? process.env[runtimeProfile.apiKeyEnvVar] : undefined;
    if (!apiKey || apiKey.startsWith("your_")) {
      return {
        agent: runtimeProfile.agentName,
        status: "error",
        message: `Agent ${runtimeProfile.agentName} is missing a valid API key in ${runtimeProfile.apiKeyEnvVar}.`,
        timestamp: new Date().toISOString(),
      };
    }

    if (/^flux(\.1)?$/i.test(runtimeProfile.modelId.trim())) {
      return {
        agent: runtimeProfile.agentName,
        status: "ok",
        message: `${runtimeProfile.agentName} is configured on ${runtimeProfile.modelId} (image generation). Text chat is not available on this profile.`,
        timestamp: new Date().toISOString(),
      };
    }

    const agentTools = this.buildAgentTools(runtimeProfile.agentName);
    const messages: any[] = [
      { role: "system", content: runtimeProfile.systemPrompt },
      { role: "user", content: task },
    ];

    const MAX_TOOL_ROUNDS = 25;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const body: any = {
        model: runtimeProfile.modelId,
        messages,
      };
      if (agentTools.length > 0) {
        body.tools = agentTools.map((t) => t.openai);
        body.tool_choice = "auto";
      }

      const response = await this.fetchWithTimeout(`${runtimeProfile.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, 120_000);

      const payload = (await response.json()) as any;
      if (!response.ok) {
        const providerName = runtimeProfile.provider === "openai" ? "OpenAI" : "OpenRouter";
        return {
          agent: runtimeProfile.agentName,
          status: "error",
          message: payload.error?.message || `${providerName} call failed with status ${response.status}.`,
          timestamp: new Date().toISOString(),
        };
      }

      const choice = payload.choices?.[0];
      const msg = choice?.message;
      const finishReason: string = choice?.finish_reason ?? "";

      // If the LLM wants to call tools, execute them and loop
      if ((finishReason === "tool_calls" || msg?.tool_calls?.length > 0) && round < MAX_TOOL_ROUNDS) {
        messages.push(msg); // append assistant tool-call message
        for (const tc of (msg.tool_calls ?? [])) {
          let args: any = {};
          try { args = JSON.parse(tc.function.arguments ?? "{}"); } catch { /* keep {} */ }
          const toolResult = await this.executeToolCall(runtimeProfile.agentName, tc.function.name, args);
          messages.push({ role: "tool", tool_call_id: tc.id, content: toolResult.text });
          // Vision result: inject the image as a user content part so the model can see it
          if (toolResult.imageUrl) {
            messages.push({
              role: "user",
              content: [
                { type: "text", text: "Screen captured. Here is what the screen looks like right now:" },
                { type: "image_url", image_url: { url: toolResult.imageUrl } },
              ],
            });
          }
        }
        continue; // send results back to LLM
      }

      // Done — extract final text
      const text = this.extractMessage(payload as ProviderResponse);
      return {
        agent: runtimeProfile.agentName,
        status: text ? "ok" : "error",
        message: text || `Agent ${runtimeProfile.agentName} returned an empty response.`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      agent: runtimeProfile.agentName,
      status: "error",
      message: `Agent ${runtimeProfile.agentName} exceeded maximum tool-call rounds.`,
      timestamp: new Date().toISOString(),
    };
  }

  private static async askStub(name: string, task: string): Promise<AgentResponse> {
    return { agent: name, status: "ok", message: `Task received by ${name}: ${task}`, timestamp: new Date().toISOString() };
  }

  static async restart(name: string): Promise<AgentResponse> {
    const agent = AgentRegistry.find(name);
    if (!agent) {
      return { agent: name, status: "error", message: `Unknown agent: ${name}`, timestamp: new Date().toISOString() };
    }

    return { agent: name, status: "ok", message: `Restart signal sent to ${name}. Real restart logic not yet implemented.`, timestamp: new Date().toISOString() };
  }

  static async status(name: string): Promise<AgentResponse & { health: string; lastHeartbeat: string }> {
    const agent = AgentRegistry.find(name);
    if (!agent) {
      return {
        agent: name,
        status: "error",
        message: `Unknown agent: ${name}`,
        health: "unknown",
        lastHeartbeat: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };
    }

    const runtimeProfile = AgentRuntimeRegistry.find(name);
    const apiKey = runtimeProfile?.apiKeyEnvVar ? process.env[runtimeProfile.apiKeyEnvVar] : undefined;
    const health = runtimeProfile?.provider === "gateway"
      ? (GATEWAY_ENABLED && GATEWAY_URL ? "ok" : "degraded")
      : runtimeProfile && apiKey && !apiKey.startsWith("your_") ? "ok" : "degraded";
    const message = runtimeProfile ? `Agent ${name} runtime loaded with provider ${runtimeProfile.provider} and model ${runtimeProfile.modelId}` : `Agent ${name} is available`;

    return {
      agent: name,
      status: "ok",
      message,
      health,
      lastHeartbeat: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };
  }
}
