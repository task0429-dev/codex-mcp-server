import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { HTTP_PORT, HTTP_HOST, IS_PRODUCTION } from "../config";
import type { Express, Request, Response } from "express";
import { buildCommandCenterPayload, renderCommandCenterHtml } from "./command-center";
import { buildVoiceCenterPayload } from "./voice-center";
import { getAllTools, getStartupSummary, getTool } from "../server/tool-registry";
import { MissionControlStateService } from "../services/mission-control-state-service";
import { AgentService } from "../services/agent-service";
import { toToolError } from "../utils/errors";
import { screenStreamService } from "../services/screen-stream-service";

const CONTROL_UI_ROOT = path.resolve(__dirname, "../../control-ui");
const CONTROL_UI_INDEX = path.join(CONTROL_UI_ROOT, "index.html");

export async function createHttpTransport(): Promise<void> {
  const express = (await import("express")).default;
  const cors = (await import("cors")).default;

  const app: Express = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(cors({ origin: "*" }));

  const serveCommandCenter = (req: Request, res: Response) => {
    if (fs.existsSync(CONTROL_UI_INDEX)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(CONTROL_UI_INDEX);
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.type("html").send(renderCommandCenterHtml(baseUrl));
  };

  if (fs.existsSync(CONTROL_UI_INDEX)) {
    app.use(
      express.static(CONTROL_UI_ROOT, {
        etag: false,
        lastModified: false,
        setHeaders: (res) => {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        },
      })
    );
  }

  app.get(
    /^(?:\/|\/overview|\/agents|\/content|\/approvals|\/voice|\/models|\/openclaw|\/mcp|\/mcp-tools|\/tool-store|\/protocols|\/projects|\/memories|\/docs|\/team|\/office|\/notes|\/calendar|\/tasks|\/logs|\/integrations|\/settings)(?:\/.*)?$/,
    serveCommandCenter
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      tool_groups: getStartupSummary(),
    });
  });

  app.get("/api/tools", (_req: Request, res: Response) => {
    const tools = getAllTools();
    res.json({
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        schema: (tool.inputSchema as any).toJSON?.() || {},
      })),
    });
  });

  app.get("/api/command-center", (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json(buildCommandCenterPayload(baseUrl));
  });

  app.get("/api/mission-control/events", (_req: Request, res: Response) => {
    res.json({
      events: MissionControlStateService.getEvents(),
    });
  });

  app.get("/api/mission-control/events/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const writeEvent = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    writeEvent({
      type: "connected",
      timestamp: new Date().toISOString(),
    });

    const off = MissionControlStateService.onEvent((event) => writeEvent(event));
    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      off();
      res.end();
    });
  });

  app.post("/api/mission-control/actions", async (req: Request, res: Response) => {
    const action = typeof req.body?.action === "string" ? req.body.action : "";
    const payload = req.body?.payload || {};
    if (!action) {
      return res.status(400).json({ success: false, error: "Missing action." });
    }

    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const result = await MissionControlStateService.dispatch(action, payload);
      return res.json({
        success: true,
        event: result.event,
        result: result.result || null,
        payload: buildCommandCenterPayload(baseUrl),
      });
    } catch (err: any) {
      logger.error("mission_control_action_failed", {
        action,
        error: err?.message || String(err),
      });
      return res.status(500).json({
        success: false,
        error: err?.message || "Mission Control action failed.",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/api/voice-center", (req: Request, res: Response) => {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json(buildVoiceCenterPayload(baseUrl));
  });

  /* ── TTS: ElevenLabs → Polly (ttsmp3) → Google TTS → OpenAI → 503 ── */

  // ElevenLabs voice IDs — accented human neural voices per agent, all non-American
  const ELEVENLABS_VOICE_IDS: Record<string, string> = {
    abdi:  "eRcsJdPMOM0mtGC03ul7",  // Kevin — Jamaican, Neutral & Clear (not deep)
    ahmed: "DvGqn8Zp8GnW2xWcyhzt",  // Raunak M — Indian, Polite & Professional
    dame:  "MdeqL1TMyZWz86QOELK8",  // Arthur — British, Distinguished & Steady
    rex:   "M4FiuEOcSLrYgftiXoq9",  // Blake — Australian, Brand & Promo
    prime: "NOpwXiXLWfbN5KhzBTFW",  // Cameron — South African, Smooth & Deep
    atlas: "BOt7zZh6gzfWlIUYnyPz",  // Caleb O'Farrell — Irish, Warm & Clear
    ayub:  "N09NFwYJJG9VSSgdLQbT",  // Ishan — Indian, Bold & Upbeat (distinct from Ahmed)
    sygma: "tyepWYJJwJM9TTFIg5U7",  // Clara — Australian female, Warmth & Trust
  };

  // Polly fallback voices (ttsmp3.com)
  const POLLY_VOICES: Record<string, string> = {
    abdi:  "Joey", ahmed: "Geraint", dame: "Brian",  rex:  "Matthew",
    prime: "Justin", ayub: "",       atlas: "Brian", sygma: "Nicole",
  };

  // OpenAI TTS voices — last resort fallback
  const OPENAI_VOICE_IDS: Record<string, string> = {
    abdi:  "echo",  ahmed: "fable", dame:  "onyx",  rex:   "echo",
    prime: "alloy", ayub:  "alloy", atlas: "onyx",  sygma: "nova",
  };

  app.post("/api/voice/tts", async (req: Request, res: Response) => {
    const { agentId, text } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const { Readable } = await import("stream");
    const agentName = (agentId || "").toLowerCase().replace(/[^a-z]/g, "");
    const truncated = String(text).slice(0, 500);

    const relayUrl = process.env.DESKTOP_RELAY_URL;
    const elKey = process.env.ELEVENLABS_API_KEY;

    // 1. ElevenLabs via relay — best quality, accented neural voices
    if (relayUrl && elKey && ELEVENLABS_VOICE_IDS[agentName]) {
      try {
        const upstream = await fetch(`${relayUrl}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voiceId: ELEVENLABS_VOICE_IDS[agentName],
            text: truncated,
            apiKey: elKey,
          }),
        });
        if (upstream.ok) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("elevenlabs_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("elevenlabs_tts_error", { error: err?.message });
      }
    }

    // 2. ttsmp3.com Amazon Polly neural voices via relay — free fallback
    if (relayUrl && POLLY_VOICES[agentName]) {
      try {
        const upstream = await fetch(`${relayUrl}/tts-polly`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: truncated, voice: POLLY_VOICES[agentName] }),
        });
        if (upstream.ok) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("polly_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("polly_tts_error", { error: err?.message });
      }
    }

    // 3. Google TTS via relay — last free fallback
    if (relayUrl) {
      try {
        const upstream = await fetch(`${relayUrl}/tts-google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: truncated, agentId: agentName }),
        });
        if (upstream.ok) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("google_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("google_tts_error", { error: err?.message });
      }
    }

    // 3. OpenAI TTS (if key set)
    const oaiKey = process.env.OPENAI_API_KEY;
    if (oaiKey) {
      try {
        const voice = OPENAI_VOICE_IDS[agentName] || "onyx";
        const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${oaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "tts-1", input: truncated, voice, speed: 1.35 }),
        });
        if (upstream.ok) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("openai_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("openai_tts_error", { error: err?.message });
      }
    }

    // 4. No TTS provider available — browser falls back to SpeechSynthesis
    return res.status(503).json({ error: "No TTS provider available" });
  });

  /* ── Voice Chat: agent reply + optional TTS ── */
  app.post("/api/voice/chat", async (req: Request, res: Response) => {
    const { agentId, message } = req.body || {};
    if (!agentId || !message) return res.status(400).json({ error: "Missing agentId or message" });

    try {
      const result = await AgentService.ask(agentId, message);
      return res.json({ reply: result.message });
    } catch (err: any) {
      logger.error("voice_chat_failed", { agentId, error: err?.message || String(err) });
      return res.status(500).json({ error: err?.message || "Agent chat failed" });
    }
  });

  app.post("/api/tools/:toolName", async (req: Request, res: Response) => {
    const toolName = Array.isArray(req.params.toolName) ? req.params.toolName[0] : req.params.toolName;
    const { arguments: args } = req.body;
    const tool = getTool(toolName);

    if (!tool) {
      return res.status(404).json({ error: `Tool not found: ${toolName}` });
    }

    try {
      const validated = tool.inputSchema.parse(args || {});
      const result = await tool.handler(validated, {
        requestId: `http_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      return res.json({ success: true, result, timestamp: new Date().toISOString() });
    } catch (err: any) {
      const toolError = toToolError(err);
      logger.error("http_tool_call_failed", {
        tool: toolName,
        error: toolError.message,
        code: toolError.code,
      });
      return res.status(toolError.statusCode || 400).json({
        success: false,
        error: toolError.message || String(err),
        timestamp: new Date().toISOString(),
      });
    }
  });

  const server = app.listen(HTTP_PORT, HTTP_HOST, () => {
    logger.info("http_server_started", {
      host: HTTP_HOST,
      port: HTTP_PORT,
      toolGroups: getStartupSummary(),
    });

    if (!IS_PRODUCTION) {
      logger.warn("http_server_running_in_development_mode");
    }
  });

  screenStreamService.attachToServer(server);

  process.on("SIGTERM", () => {
    logger.info("http_server_sigterm_received");
    server.close(() => {
      logger.info("http_server_closed");
      process.exit(0);
    });
  });
}
