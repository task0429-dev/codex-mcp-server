import { AgentRuntimeRegistry } from "../runtime-profiles";
import { GATEWAY_API_KEY, GATEWAY_AUTH_HEADER, GATEWAY_CHAT_PATH, GATEWAY_URL } from "../../config/config";
import { consumeOpenAiCompatibleStream } from "../../streaming/llm-stream-handler";

function resolveApiKey(agentName: string, runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>): string | undefined {
  if (runtimeProfile.apiKeyEnvVar && process.env[runtimeProfile.apiKeyEnvVar]) {
    return process.env[runtimeProfile.apiKeyEnvVar];
  }

  if (runtimeProfile.provider === "gateway" && GATEWAY_API_KEY) {
    return GATEWAY_API_KEY;
  }

  return undefined;
}

function resolveEndpoint(runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>): string {
  if (runtimeProfile.provider === "gateway" && GATEWAY_URL) {
    const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL : `${GATEWAY_URL}/`;
    const path = GATEWAY_CHAT_PATH.startsWith("/") ? GATEWAY_CHAT_PATH.slice(1) : GATEWAY_CHAT_PATH;
    return new URL(path, base).toString();
  }

  return `${runtimeProfile.baseUrl}/chat/completions`;
}

function resolveHeaders(runtimeProfile: NonNullable<ReturnType<typeof AgentRuntimeRegistry.find>>, apiKey: string): Record<string, string> {
  if (runtimeProfile.provider === "gateway") {
    if (GATEWAY_AUTH_HEADER.toLowerCase() === "authorization") {
      return {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
    }

    return {
      [GATEWAY_AUTH_HEADER]: apiKey,
      "Content-Type": "application/json",
    };
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export interface StreamAgentTurnOptions {
  agentName: string;
  prompt: string;
  signal: AbortSignal;
  onToken: (token: string) => void;
}

export async function streamAgentTurn(options: StreamAgentTurnOptions): Promise<{ fullText: string; firstTokenLatencyMs: number | null }> {
  const runtimeProfile = AgentRuntimeRegistry.find(options.agentName);
  if (!runtimeProfile) {
    throw new Error(`Unknown runtime profile for ${options.agentName}.`);
  }

  const apiKey = resolveApiKey(options.agentName, runtimeProfile);
  if (!apiKey) {
    throw new Error(`Missing API key for ${options.agentName}.`);
  }

  const endpoint = resolveEndpoint(runtimeProfile);
  const startedAt = Date.now();
  let firstTokenLatencyMs: number | null = null;
  let fullText = "";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: resolveHeaders(runtimeProfile, apiKey),
    signal: options.signal,
    body: JSON.stringify({
      model: runtimeProfile.modelId,
      stream: true,
      temperature: 0.7,
      max_tokens: 140,
      messages: [
        { role: "system", content: runtimeProfile.systemPrompt },
        { role: "user", content: options.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Streaming request failed with status ${response.status}.`);
  }

  await consumeOpenAiCompatibleStream(response, {
    onText: ({ text }) => {
      if (!text) {
        return;
      }

      if (firstTokenLatencyMs === null) {
        firstTokenLatencyMs = Date.now() - startedAt;
      }

      fullText += text;
      options.onToken(text);
    },
    onDone: () => undefined,
  });

  return {
    fullText: fullText.trim(),
    firstTokenLatencyMs,
  };
}
