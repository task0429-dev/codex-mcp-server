import WebSocket from "ws";
import { randomUUID } from "crypto";

const CONNECT_DELAY_MS = 750;
const DEFAULT_TIMEOUT_MS = 45_000;
const OPENCLAW_CLIENT_ID = "openclaw-control-ui";
const OPENCLAW_CLIENT_VERSION = "control-ui";
const OPENCLAW_ROLE = "operator";
const OPENCLAW_SCOPES = ["operator.admin", "operator.approvals", "operator.pairing"];
const OPENCLAW_CAPS = ["tool-events"];

type GatewayErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

type GatewayResponseMessage = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: any;
  error?: GatewayErrorPayload;
};

type GatewayEventMessage = {
  type: "event";
  event: string;
  payload?: any;
  seq?: number;
};

type GatewayMessage = GatewayResponseMessage | GatewayEventMessage;

export interface OpenClawGatewayOptions {
  gatewayUrl: string;
  wsUrl?: string;
  origin?: string;
  token?: string;
  password?: string;
  sessionKey?: string;
  timeoutMs?: number;
}

function normalizeGatewayWsUrl(gatewayUrl: string, explicitWsUrl?: string): string {
  const raw = (explicitWsUrl || gatewayUrl).trim();
  const url = new URL(raw);

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }

  return url.toString();
}

function normalizeGatewayOrigin(gatewayUrl: string, explicitOrigin?: string): string {
  if (explicitOrigin?.trim()) {
    return explicitOrigin.trim();
  }

  const url = new URL(gatewayUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  }

  return url.origin;
}

function makeRequestId(): string {
  return typeof randomUUID === "function" ? randomUUID() : `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return String((part as { text: string }).text);
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function extractChatMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  const candidate = message as { content?: unknown; text?: unknown };
  if (typeof candidate.text === "string" && candidate.text.trim()) {
    return candidate.text.trim();
  }

  return extractTextFromContent(candidate.content);
}

function stringifyGatewayError(error: GatewayErrorPayload | undefined): string {
  if (!error) {
    return "request failed";
  }

  if (error.message?.trim()) {
    return error.message.trim();
  }

  if (error.code?.trim()) {
    return error.code.trim();
  }

  return "request failed";
}

export async function askOpenClawGateway(task: string, options: OpenClawGatewayOptions): Promise<string> {
  const wsUrl = normalizeGatewayWsUrl(options.gatewayUrl, options.wsUrl);
  const origin = normalizeGatewayOrigin(options.gatewayUrl, options.origin);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const sessionKey = options.sessionKey || "main";
  const runId = makeRequestId();

  return new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { origin });
    const pending = new Map<string, string>();
    let connectSent = false;
    let closed = false;
    let latestText = "";
    let timeoutHandle: NodeJS.Timeout | null = null;
    let connectTimer: NodeJS.Timeout | null = null;

    const clearState = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }

      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    };

    const cleanup = () => {
      clearState();
      if (!closed) {
        closed = true;
        try {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.terminate();
          } else if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
            ws.close();
          } else {
            ws.terminate();
          }
        } catch {
          // Swallow cleanup errors to avoid crashing the caller on transport teardown.
        }
      }
    };

    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    const succeed = (message: string) => {
      cleanup();
      resolve(message);
    };

    const sendRequest = (method: string, params: unknown) => {
      const id = makeRequestId();
      pending.set(id, method);
      ws.send(JSON.stringify({ type: "req", id, method, params }));
    };

    const sendConnect = () => {
      if (connectSent || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      connectSent = true;
      sendRequest("connect", {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: OPENCLAW_CLIENT_ID,
          version: OPENCLAW_CLIENT_VERSION,
          platform: process.platform,
          mode: "webchat",
          instanceId: makeRequestId(),
        },
        role: OPENCLAW_ROLE,
        scopes: OPENCLAW_SCOPES,
        caps: OPENCLAW_CAPS,
        auth: options.token || options.password ? { token: options.token, password: options.password } : undefined,
        userAgent: `codex-mcp-server/${OPENCLAW_CLIENT_VERSION}`,
        locale: "en-US",
      });
    };

    timeoutHandle = setTimeout(() => {
      fail(`OpenClaw gateway timed out after ${timeoutMs}ms.`);
    }, timeoutMs);

    ws.on("open", () => {
      connectTimer = setTimeout(sendConnect, CONNECT_DELAY_MS);
    });

    ws.on("message", (raw) => {
      let message: GatewayMessage;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (message.type === "event") {
        if (message.event !== "chat") {
          return;
        }

        const payload = message.payload || {};
        const payloadRunId = typeof payload.runId === "string" ? payload.runId : undefined;
        if (payloadRunId && payloadRunId !== runId) {
          return;
        }

        const text = extractChatMessageText(payload.message);
        if (text) {
          latestText = text;
        }

        if (payload.state === "final") {
          succeed(latestText || "OpenClaw gateway returned an empty response.");
          return;
        }

        if (payload.state === "error") {
          fail(payload.errorMessage || latestText || "OpenClaw chat error.");
          return;
        }

        if (payload.state === "aborted") {
          fail(latestText || "OpenClaw chat was aborted.");
        }

        return;
      }

      const method = pending.get(message.id);
      pending.delete(message.id);

      if (!message.ok) {
        fail(stringifyGatewayError(message.error));
        return;
      }

      if (method === "connect") {
        sendRequest("chat.send", {
          sessionKey,
          message: task,
          deliver: false,
          idempotencyKey: runId,
        });
      }
    });

    ws.on("close", (code, reason) => {
      if (closed) {
        return;
      }

      closed = true;
      clearState();
      const text = String(reason || "").trim();
      if (latestText) {
        resolve(latestText);
        return;
      }

      reject(new Error(text ? `OpenClaw gateway closed (${code}): ${text}` : `OpenClaw gateway closed (${code}).`));
    });

    ws.on("error", (error) => {
      if (closed) {
        return;
      }
      fail(`Unable to reach the OpenClaw gateway at ${wsUrl}: ${String(error)}`);
    });
  });
}
