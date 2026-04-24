import fs from "fs";
import path from "path";
import { logger } from "./logger";
import {
  HTTP_PORT,
  HTTP_HOST,
  IS_PRODUCTION,
  APP_BASE_URL,
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID_ABDI,
  ELEVENLABS_VOICE_ID_AHMED,
  ELEVENLABS_VOICE_ID_DAME,
  ELEVENLABS_VOICE_ID_REX,
  ELEVENLABS_VOICE_ID_PRIME,
  ELEVENLABS_VOICE_ID_ATLAS,
  ELEVENLABS_VOICE_ID_AYUB,
  ELEVENLABS_VOICE_ID_SYGMA,
} from "../config";
import type { Express, Request, Response } from "express";
import { buildAgentData, buildCommandCenterPayload, getCachedCommandCenterPayload, primeCommandCenterPayload, renderCommandCenterHtml } from "./command-center";
import { buildVoiceCenterPayload } from "./voice-center";
import { getAllTools, getStartupSummary, getTool } from "../server/tool-registry";
import { MissionControlStateService } from "../services/mission-control-state-service";
import { AgentService } from "../services/agent-service";
import { toToolError } from "../utils/errors";
import { screenStreamService } from "../services/screen-stream-service";
import { MemoryApiService } from "../memory/api-service";
import { memoryIngestionService } from "../memory/ingestion-service";
import { BillingService } from "../billing/service";
import { conversationIndexer } from "../services/conversation-indexer";

const CONTROL_UI_ROOT = path.resolve(__dirname, "../../control-ui");
const CONTROL_UI_INDEX = path.join(CONTROL_UI_ROOT, "index.html");

export async function createHttpTransport(): Promise<void> {
  const express = (await import("express")).default;
  const cors = (await import("cors")).default;

  const app: Express = express();
  const compression = (await import("compression")).default;
  app.use(compression());
  const primeHosts = [
    `http://localhost:${HTTP_PORT}`,
    `http://127.0.0.1:${HTTP_PORT}`,
    APP_BASE_URL,
    "https://cc.taskenterprise.tech",
  ].filter((value): value is string => Boolean(value));
  app.post("/api/billing/webhooks/stripe", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      const result = await BillingService.processWebhookEvent(body, req.headers["stripe-signature"]);
      return res.json(result);
    } catch (err: any) {
      logger.error("stripe_webhook_failed", { error: err?.message || String(err) });
      return res.status(400).json({
        success: false,
        error: err?.message || "Webhook processing failed.",
      });
    }
  });

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

  // Proxy /claude-mem/* → claude-mem worker on host machine
  const CLAUDE_MEM_ORIGIN = process.env.CLAUDE_MEM_ORIGIN || "http://host.docker.internal:37779";
  const claudeMemUrl = new URL(CLAUDE_MEM_ORIGIN);
  app.use("/claude-mem", (req: Request, res: Response) => {
    const http = require("http") as typeof import("http");
    const upstreamPath = req.url === "/" ? "/" : req.url;
    const options = {
      hostname: claudeMemUrl.hostname,
      port: Number(claudeMemUrl.port) || 80,
      path: upstreamPath,
      method: req.method,
      headers: { ...req.headers, host: `${claudeMemUrl.hostname}:${claudeMemUrl.port}` },
    };
    const proxyReq = http.request(options, (proxyRes) => {
      const contentType = String(proxyRes.headers["content-type"] || "");
      // Strip hop-by-hop headers
      const skip = new Set(["transfer-encoding", "connection", "keep-alive", "te", "trailer", "upgrade"]);
      Object.entries(proxyRes.headers).forEach(([k, v]) => {
        if (!skip.has(k)) res.setHeader(k, v as any);
      });
      res.status(proxyRes.statusCode || 200);
      if (contentType.includes("text/html")) {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (c: Buffer) => chunks.push(c));
        proxyRes.on("end", () => {
          const html = Buffer.concat(chunks).toString("utf8")
            .replace(/(href|src)="\/(?!claude-mem)/g, '$1="/claude-mem/')
            .replace(/(href|src)='\/(?!claude-mem)/g, "$1='/claude-mem/");
          res.send(html);
        });
      } else {
        proxyRes.pipe(res);
      }
    });
    proxyReq.on("error", () => res.status(502).json({ error: "claude-mem worker unavailable" }));
    if (req.body && Buffer.isBuffer(req.body)) proxyReq.write(req.body);
    proxyReq.end();
  });

  // Conversation browser API — reads ~/.claude/projects JSONL files
  const CLAUDE_PROJECTS = process.env.CLAUDE_PROJECTS_DIR || path.join(require("os").homedir(), ".claude", "projects");
  app.get("/api/conversations/projects", (_req: Request, res: Response) => {
    try {
      const entries = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true });
      const projects = entries
        .filter(e => e.isDirectory())
        .map(e => {
          const dir = path.join(CLAUDE_PROJECTS, e.name);
          const files = fs.readdirSync(dir).filter(f => f.endsWith(".jsonl"));
          return { id: e.name, files: files.length };
        })
        .filter(p => p.files > 0);
      res.json({ projects });
    } catch { res.json({ projects: [] }); }
  });

  // Read only the first N bytes of a file to extract session metadata fast
  function readSessionHead(filePath: string): { sessionId: string | null; title: string | null; cwd: string | null; firstPrompt: string | null; ts: string | null } {
    const HEAD_BYTES = 8192;
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    fs.closeSync(fd);
    const chunk = buf.slice(0, bytesRead).toString("utf8");
    const lines = chunk.split("\n").filter(Boolean);
    // Last line may be truncated — drop it
    if (lines.length > 1) lines.pop();
    let sessionId: string | null = null, title: string | null = null, cwd: string | null = null, firstPrompt: string | null = null, ts: string | null = null;
    for (const l of lines) {
      if (sessionId && title && cwd && firstPrompt) break;
      try {
        const o = JSON.parse(l);
        if (!sessionId && o.sessionId) sessionId = o.sessionId;
        if (!cwd && o.cwd) cwd = o.cwd;
        if (!title && o.type === "ai-title") title = o.aiTitle;
        if (!firstPrompt && o.type === "user" && o.message?.content) {
          const t = Array.isArray(o.message.content) ? o.message.content.find((c: any) => c.type === "text")?.text : null;
          if (t) { firstPrompt = t.slice(0, 200); ts = o.timestamp || null; }
        }
      } catch { /**/ }
    }
    return { sessionId, title, cwd, firstPrompt, ts };
  }

  app.get("/api/conversations/sessions", (req: Request, res: Response) => {
    try {
      const project = req.query.project as string;
      const dir = project ? path.join(CLAUDE_PROJECTS, project) : CLAUDE_PROJECTS;
      const sessions: any[] = [];
      const scan = (d: string, depth = 0) => {
        if (depth > 2) return; // don't recurse too deep
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) scan(full, depth + 1);
          else if (entry.name.endsWith(".jsonl")) {
            const rel = path.relative(CLAUDE_PROJECTS, full).replace(/\\/g, "/");
            const proj = rel.split("/")[0];
            try {
              const stat = fs.statSync(full);
              const meta = readSessionHead(full);
              if (meta.sessionId || meta.firstPrompt) {
                sessions.push({ file: rel, project: proj, ...meta, size: stat.size });
              }
            } catch { /**/ }
          }
        }
      };
      scan(dir);
      sessions.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
      res.json({ sessions: sessions.slice(0, 300) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/conversations/messages", (req: Request, res: Response) => {
    const file = req.query.file as string;
    if (!file || file.includes("..")) return res.status(400).json({ error: "invalid" });
    const full = path.join(CLAUDE_PROJECTS, file);
    const readline = require("readline") as typeof import("readline");
    const rl = readline.createInterface({ input: fs.createReadStream(full, { encoding: "utf8" }), crlfDelay: Infinity });
    const messages: any[] = [];
    const MAX_CHARS = 3000;
    rl.on("line", (l: string) => {
      if (!l) return;
      try {
        const o = JSON.parse(l);
        if (o.type === "user" && o.message?.content) {
          const text = Array.isArray(o.message.content) ? o.message.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") : String(o.message.content);
          const t = text.trim();
          if (t) messages.push({ role: "user", text: t.slice(0, MAX_CHARS), truncated: t.length > MAX_CHARS, ts: o.timestamp });
        } else if (o.type === "assistant" && o.message?.content) {
          const text = Array.isArray(o.message.content) ? o.message.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") : String(o.message.content);
          const t = text.trim();
          if (t) messages.push({ role: "assistant", text: t.slice(0, MAX_CHARS), truncated: t.length > MAX_CHARS, ts: o.timestamp });
        } else if (o.type === "ai-title") {
          messages.push({ role: "meta", text: o.aiTitle, ts: o.timestamp });
        }
      } catch { /**/ }
    });
    rl.on("close", () => res.json({ messages }));
    rl.on("error", (e: Error) => res.status(500).json({ error: e.message }));
  });

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
    /^(?:\/|\/overview|\/agents|\/messages|\/content|\/approvals|\/voice|\/models|\/openclaw|\/mcp|\/mcp-tools|\/tool-store|\/protocols|\/monitoring|\/projects|\/memories|\/claude-mem|\/docs|\/team|\/office|\/notes|\/calendar|\/tasks|\/logs|\/integrations|\/settings|\/leads-revenue|\/c2)(?:\/.*)?$/,
    serveCommandCenter
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      tool_groups: getStartupSummary(),
    });
  });

  app.get("/ready", (_req: Request, res: Response) => {
    res.json({
      status: "ready",
      timestamp: new Date().toISOString(),
      checks: {
        http_transport: "ok",
        tool_registry: "ok",
      },
    });
  });

  app.get("/api/memory/v1/health", async (req: Request, res: Response) => {
    const requestId = `mem_health_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const context = MemoryApiService.parseAccessContext(req.headers as Record<string, unknown>);
      const result = await MemoryApiService.getHealth(context);
      return res.json(result);
    } catch (err: any) {
      const failure = MemoryApiService.buildErrorResponse(requestId, err);
      return res.status(failure.statusCode).json(failure.body);
    }
  });

  app.get("/api/memory/v1/facets", async (req: Request, res: Response) => {
    const requestId = `mem_facets_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const context = MemoryApiService.parseAccessContext(req.headers as Record<string, unknown>);
      const result = await MemoryApiService.getFacets(context);
      return res.json(result);
    } catch (err: any) {
      const failure = MemoryApiService.buildErrorResponse(requestId, err);
      return res.status(failure.statusCode).json(failure.body);
    }
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

  app.get("/api/command-center", async (req: Request, res: Response) => {
    try {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const payload = await getCachedCommandCenterPayload(baseUrl);
      res.json(payload);
    } catch (err: any) {
      logger.error("command_center_payload_failed", { error: err?.message || String(err) });
      res.status(500).json({ error: "Command Center payload unavailable." });
    }
  });

  app.get("/api/agents/live", (_req: Request, res: Response) => {
    res.json({
      agents: buildAgentData(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/billing/health", async (_req: Request, res: Response) => {
    try {
      const health = await BillingService.getHealth();
      return res.json(health);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "Billing health check failed.",
      });
    }
  });

  app.get("/api/billing/catalog", async (_req: Request, res: Response) => {
    try {
      const catalog = await BillingService.getCatalog();
      return res.json(catalog);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "Billing catalog fetch failed.",
      });
    }
  });

  app.post("/api/billing/checkout/session", async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || "").trim();
      const priceId = String(req.body?.priceId || "").trim();
      const referenceId = String(req.body?.referenceId || req.body?.productId || "").trim();
      if (!email || (!priceId && !referenceId)) {
        return res.status(400).json({ success: false, error: "email and priceId or referenceId are required." });
      }

      const session = await BillingService.createCheckoutSession({
        email,
        priceId: priceId || undefined,
        referenceId: referenceId || undefined,
        successUrl: typeof req.body?.successUrl === "string" ? req.body.successUrl : undefined,
        cancelUrl: typeof req.body?.cancelUrl === "string" ? req.body.cancelUrl : undefined,
        customerId: typeof req.body?.customerId === "string" ? req.body.customerId : undefined,
        metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : undefined,
      });

      return res.json({ success: true, session });
    } catch (err: any) {
      logger.error("billing_checkout_session_failed", { error: err?.message || String(err) });
      return res.status(500).json({ success: false, error: err?.message || "Checkout session creation failed." });
    }
  });

  app.post("/api/billing/customer-portal/session", async (req: Request, res: Response) => {
    try {
      const customerId = String(req.body?.customerId || "").trim();
      if (!customerId) {
        return res.status(400).json({ success: false, error: "customerId is required." });
      }

      const session = await BillingService.createPortalSession({
        customerId,
        returnUrl: typeof req.body?.returnUrl === "string" ? req.body.returnUrl : undefined,
      });

      return res.json({ success: true, session });
    } catch (err: any) {
      logger.error("billing_portal_session_failed", { error: err?.message || String(err) });
      return res.status(500).json({ success: false, error: err?.message || "Customer portal session creation failed." });
    }
  });

  app.get("/api/billing/customer-state", async (req: Request, res: Response) => {
    try {
      const customerId = typeof req.query.customerId === "string" ? req.query.customerId.trim() : undefined;
      const email = typeof req.query.email === "string" ? req.query.email.trim() : undefined;
      if (!customerId && !email) {
        return res.status(400).json({ success: false, error: "customerId or email is required." });
      }

      const state = await BillingService.getCustomerBillingState({ customerId, email });
      return res.json({ success: true, state });
    } catch (err: any) {
      logger.error("billing_customer_state_failed", { error: err?.message || String(err) });
      return res.status(500).json({ success: false, error: err?.message || "Customer billing state lookup failed." });
    }
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

  // ── Conversation Index ──────────────────────────────────────────────────

  app.get("/api/conversations/index", (_req: Request, res: Response) => {
    res.json(conversationIndexer.getIndex());
  });

  app.get("/api/conversations/index/status", (_req: Request, res: Response) => {
    res.json(conversationIndexer.getStatus());
  });

  app.post("/api/conversations/index/reindex", (_req: Request, res: Response) => {
    conversationIndexer.reindex();
    res.json({ success: true });
  });

  app.get("/api/conversations/index/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const writeEvent = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    writeEvent({ type: "connected", status: conversationIndexer.getStatus() });

    const onIndexed = (payload: unknown) => writeEvent({ type: "indexed", ...(payload as object) });
    conversationIndexer.on("indexed", onIndexed);

    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      conversationIndexer.off("indexed", onIndexed);
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
      void memoryIngestionService.captureMissionControlAction(action, payload, result.event as any);
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

  // Voice defaults match each agent's current persona. Any one can be overridden in .env.
  const ELEVENLABS_VOICE_IDS: Record<string, string> = {
    abdi:  ELEVENLABS_VOICE_ID_ABDI  || "29vD33N1CtxCmqQRPOHJ", // East African / Arab leader, strongest male fallback
    ahmed: ELEVENLABS_VOICE_ID_AHMED || "eRcsJdPMOM0mtGC03ul7", // Nigerian / Jamaican fallback
    dame:  ELEVENLABS_VOICE_ID_DAME  || "2EiwWnXFnvU5JabPnv8n", // UK male, demanding/dominant
    rex:   ELEVENLABS_VOICE_ID_REX   || "5Q0t7uMcjvnagumLfvZi", // Australian male, 30s
    prime: ELEVENLABS_VOICE_ID_PRIME || "TxGEqnHWrfWFTfGW9XjX", // Controlled, polished male
    atlas: ELEVENLABS_VOICE_ID_ATLAS || "VR6AewLTigWG4xSOukaG", // Clean American male
    ayub:  ELEVENLABS_VOICE_ID_AYUB  || "N09NFwYJJG9VSSgdLQbT", // Indian / Arab-leaning male
    sygma: ELEVENLABS_VOICE_ID_SYGMA || "EXAVITQu4vr4xnSDxMaL", // Australian female
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
    const elKey = ELEVENLABS_API_KEY;

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

    // 1b. ElevenLabs direct API fallback — avoids browser/computer voice if relay is down.
    if (elKey && ELEVENLABS_VOICE_IDS[agentName]) {
      try {
        const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_IDS[agentName]}`, {
          method: "POST",
          headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": elKey,
          },
          body: JSON.stringify({
            text: truncated,
            model_id: "eleven_multilingual_v2",
            output_format: "mp3_44100_128",
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.8,
              style: 0.2,
              use_speaker_boost: true,
            },
          }),
        });
        if (upstream.ok) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("elevenlabs_direct_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("elevenlabs_direct_tts_error", { error: err?.message });
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
      void memoryIngestionService.captureAgentChat("voice", { agentId, message }, {
        reply: result.message,
        status: result.status,
        timestamp: result.timestamp,
      });
      return res.json({ reply: result.message });
    } catch (err: any) {
      logger.error("voice_chat_failed", { agentId, error: err?.message || String(err) });
      return res.status(500).json({ error: err?.message || "Agent chat failed" });
    }
  });

  app.post("/api/messages/chat", async (req: Request, res: Response) => {
    const { agentIds, message, history } = req.body || {};
    const ids = Array.isArray(agentIds) ? agentIds.filter((entry) => typeof entry === "string" && entry.trim()) : [];
    const cleanMessage = typeof message === "string" ? message.trim() : "";

    if (!ids.length || !cleanMessage) {
      return res.status(400).json({ error: "Missing agentIds or message" });
    }

    const historyLines = Array.isArray(history)
      ? history
          .slice(-10)
          .map((entry: any) => {
            const speaker = typeof entry?.speaker === "string" ? entry.speaker : "Unknown";
            const text = typeof entry?.text === "string" ? entry.text : "";
            return text ? `${speaker}: ${text}` : "";
          })
          .filter(Boolean)
      : [];

    try {
      const replies = [];
      for (const agentId of ids) {
        const agentPrompt = [
          ids.length > 1
            ? `You are replying inside a live Task Enterprise multi-agent thread with ${ids.length} agents. Be concise, practical, and collaborative. Do not repeat what other agents would likely say.`
            : `You are replying in a direct Task Enterprise operator chat. Be concise, practical, and human. If the operator is greeting, checking in, or making casual conversation, respond naturally and warmly; do not refuse and do not claim you can only do tasks.`,
          historyLines.length ? `Recent thread:\n${historyLines.join("\n")}` : "",
          `Latest operator message:\n${cleanMessage}`,
        ].filter(Boolean).join("\n\n");

        const result = await AgentService.ask(agentId, agentPrompt);
        replies.push({
          agentId,
          status: result.status,
          reply: result.message,
          timestamp: result.timestamp,
        });
      }

      void memoryIngestionService.captureAgentChat("messages", { agentIds: ids, message: cleanMessage, history: historyLines }, { replies });
      return res.json({ replies });
    } catch (err: any) {
      logger.error("messages_chat_failed", {
        agentIds: ids,
        error: err?.message || String(err),
      });
      return res.status(500).json({ error: err?.message || "Messages chat failed" });
    }
  });

  app.post("/api/tools/:toolName", async (req: Request, res: Response) => {
    const toolName = Array.isArray(req.params.toolName) ? req.params.toolName[0] : req.params.toolName;
    const { arguments: args } = req.body;
    const tool = getTool(toolName);

    if (!tool) {
      return res.status(404).json({ error: `Tool not found: ${toolName}` });
    }

    const requestId = `http_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      const validated = tool.inputSchema.parse(args || {});
      const result = await tool.handler(validated, {
        requestId,
      });
      void memoryIngestionService.captureMcpToolCall("http", toolName, args || {}, "success", requestId);
      return res.json({ success: true, result, timestamp: new Date().toISOString() });
    } catch (err: any) {
      void memoryIngestionService.captureMcpToolCall("http", toolName, args || {}, "error", requestId, err?.message || String(err));
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

  primeCommandCenterPayload(primeHosts);
  void conversationIndexer.startup().catch(() => undefined);

  screenStreamService.attachToServer(server);

  process.on("SIGTERM", () => {
    logger.info("http_server_sigterm_received");
    server.close(() => {
      logger.info("http_server_closed");
      process.exit(0);
    });
  });
}
















