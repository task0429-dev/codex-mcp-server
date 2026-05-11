import fs from "fs";
import path from "path";
import { logger } from "./logger";
import {
  HTTP_PORT,
  HTTP_HOST,
  IS_PRODUCTION,
  HTTP_API_KEY,
  HTTP_DEDUP_WINDOW_MS,
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID_ABDI,
  ELEVENLABS_VOICE_ID_AHMED,
  ELEVENLABS_VOICE_ID_DAME,
  ELEVENLABS_VOICE_ID_REX,
  ELEVENLABS_VOICE_ID_PRIME,
  ELEVENLABS_VOICE_ID_ATLAS,
  ELEVENLABS_VOICE_ID_AYUB,
  ELEVENLABS_VOICE_ID_SYGMA,
  OPENAI_BASE_URL,
} from "../config";
import type { Express, Request, Response } from "express";
import { buildCommandCenterPayload, renderCommandCenterHtml } from "./command-center";
import { buildVoiceCenterPayload } from "./voice-center";
import { getAllTools, getStartupSummary, getTool } from "../server/tool-registry";
import { MissionControlStateService } from "../services/mission-control-state-service";
import { AgentService } from "../services/agent-service";
import { toToolError } from "../utils/errors";
import { screenStreamService } from "../services/screen-stream-service";
import { MemoryApiService } from "../memory/api-service";
import { memoryIngestionService } from "../memory/ingestion-service";
import { BillingService } from "../billing/service";
import { isDuplicatePrompt } from "../services/ingress-guard";
import { realtimeVoiceOrchestrator } from "../realtime/voice-orchestrator";
import { attachRealtimeVoiceServer } from "../realtime/websocket-server";
import { createC2Router, getC2UiProofSnapshot } from "../c2/api";
import { ClaudeConversationsService } from "../services/claude-conversations-service";
import { ConversationIntelligenceService } from "../services/conversation-intelligence-service";
import { startClaudeWatcher, stopClaudeWatcher } from "../services/claude-watcher";

const CONTROL_UI_ROOT = path.resolve(__dirname, "../../control-ui");
const CONTROL_UI_INDEX = path.join(CONTROL_UI_ROOT, "index.html");

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isTrustedLocalUiRequest(req: Request): boolean {
  const host = String(req.headers.host || "").toLowerCase();
  const referer = String(req.headers.referer || "");
  const origin = String(req.headers.origin || "");
  const localHost = host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
  const localReferer = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(referer);
  const localOrigin = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  return localHost && localReferer && localOrigin;
}

export async function createHttpTransport(): Promise<void> {
  const express = (await import("express")).default;
  const cors = (await import("cors")).default;

  const app: Express = express();
  const hasApiKey = Boolean(HTTP_API_KEY?.trim());

  const requireApiKey = (req: Request, res: Response, next: () => void) => {
    if (isTrustedLocalUiRequest(req)) return next();
    if (!hasApiKey) return next();
    const presented = req.header("x-api-key") || req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (presented && presented === HTTP_API_KEY) return next();
    return res.status(401).json({ error: "Unauthorized" });
  };
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
  app.use((_req, res, next) => { res.setHeader("X-C2-Server", "sync-repos-v2"); next(); });
  app.use("/api/c2/v1", createC2Router());

  const serveCommandCenter = (req: Request, res: Response) => {
    if (fs.existsSync(CONTROL_UI_INDEX)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(CONTROL_UI_INDEX);
      return;
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.type("html").send(renderCommandCenterHtml(baseUrl));
  };

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

  app.get("/api/command-center", (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const payload = buildCommandCenterPayload(baseUrl) as any;
    payload.c2Upgrade = getC2UiProofSnapshot();
    res.json(payload);
  });

  app.get("/api/probe", (_req: Request, res: Response) => {
    res.json({ server: "sync-repos", ts: Date.now() });
  });

  app.get("/api/conversations/projects", (_req: Request, res: Response) => {
    try {
      const provider = typeof _req.query.provider === "string" && _req.query.provider === "codex"
        ? "codex"
        : undefined;
      return res.json({
        projects: ClaudeConversationsService.listProjects(provider),
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || "Unable to list conversation projects.",
      });
    }
  });

  app.get("/api/conversations/sessions", (req: Request, res: Response) => {
    try {
      const provider = typeof req.query.provider === "string" && req.query.provider === "codex"
        ? "codex"
        : undefined;
      const projectId = typeof req.query.project === "string" && req.query.project.trim()
        ? req.query.project.trim()
        : undefined;

      return res.json({
        sessions: ClaudeConversationsService.listSessions(projectId, provider),
      });
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || "Unable to list conversation sessions.",
      });
    }
  });

  app.get("/api/conversations/intelligence", async (req: Request, res: Response) => {
    try {
      const provider = typeof req.query.provider === "string" ? req.query.provider.trim() : undefined;
      const project = typeof req.query.project === "string" ? req.query.project.trim() : undefined;
      const filters = {
        provider: provider as any,
        project,
        status: typeof req.query.status === "string" ? req.query.status.trim() as any : undefined,
        category: typeof req.query.category === "string" ? req.query.category.trim() : undefined,
        priority: typeof req.query.priority === "string" ? req.query.priority.trim() : undefined,
        hasBlockers: req.query.hasBlockers === "true",
        hasNextSteps: req.query.hasNextSteps === "true",
        hasCodePlan: req.query.hasCodePlan === "true",
        hasFailedAttempt: req.query.hasFailedAttempt === "true",
        from: typeof req.query.from === "string" ? req.query.from.trim() : undefined,
        to: typeof req.query.to === "string" ? req.query.to.trim() : undefined,
        q: typeof req.query.q === "string" ? req.query.q.trim() : undefined,
        agentOrTool: typeof req.query.agentOrTool === "string" ? req.query.agentOrTool.trim() : undefined,
      };
      const syncFilters = { provider: provider as any, project };
      if (ConversationIntelligenceService.isStoreStale(syncFilters)) {
        void ConversationIntelligenceService.queueSync(syncFilters);
      }
      let conversations = ConversationIntelligenceService.listConversations(filters);
      if (conversations.length === 0 || req.query.refresh === "true") {
        void ConversationIntelligenceService.queueSync(syncFilters);
      }
      return res.json({
        conversations: conversations.map(({ rawText, summary, problemsIdentified, plansProposed, buildTasks, codeTasks, uiTasks, backendTasks, automationTasks, repoReferences, toolReferences, segmentIds, ...conversation }) => ({
            ...conversation,
            summary: summary ? summary.slice(0, 280) : "",
            problemsIdentified: problemsIdentified.slice(0, 6),
            plansProposed: plansProposed.slice(0, 4),
            followUpActions: conversation.followUpActions.slice(0, 4),
          })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to load conversation intelligence." });
    }
  });

  app.get("/api/conversations/summary", async (req: Request, res: Response) => {
    try {
      const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId.trim() : "";
      if (!conversationId) return res.status(400).json({ error: "Missing conversationId." });
      const payload = ConversationIntelligenceService.getConversation(conversationId);
      if (!payload) return res.status(404).json({ error: "Conversation not found." });
      return res.json(payload);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to load structured summary." });
    }
  });

  app.get("/api/conversations/segments", (req: Request, res: Response) => {
    try {
      const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId.trim() : "";
      if (!conversationId) return res.status(400).json({ error: "Missing conversationId." });
      return res.json({ segments: ConversationIntelligenceService.getSegments(conversationId) });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to load conversation segments." });
    }
  });

  app.post("/api/conversations/regenerate-summary", async (req: Request, res: Response) => {
    try {
      const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";
      if (!conversationId) return res.status(400).json({ error: "Missing conversationId." });
      const record = await ConversationIntelligenceService.regenerateSummary(conversationId);
      if (!record) return res.status(404).json({ error: "Conversation not found." });
      return res.json({ success: true, conversation: record });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to regenerate summary." });
    }
  });

  app.post("/api/conversations/reprocess", async (req: Request, res: Response) => {
    try {
      const file = typeof req.body?.file === "string" ? req.body.file.trim() : "";
      if (!file) return res.status(400).json({ error: "Missing file." });
      const record = await ConversationIntelligenceService.reprocessConversation(file);
      if (!record) return res.status(404).json({ error: "Conversation not found." });
      return res.json({ success: true, conversation: record });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to reprocess conversation." });
    }
  });

  app.post("/api/conversations/reprocess-all-heuristic", (_req: Request, res: Response) => {
    void ConversationIntelligenceService.forceSyncAllHeuristic();
    return res.json({ success: true, message: "Force sync started in background." });
  });

  app.post("/api/conversations/reprocess-all-llm", (_req: Request, res: Response) => {
    void ConversationIntelligenceService.forceSyncAllLlm();
    return res.json({ success: true, message: "LLM reprocess started in background." });
  });

  app.patch("/api/conversations/segments/:segmentId/status", async (req: Request, res: Response) => {
    try {
      const segmentId = firstParam(req.params.segmentId)?.trim();
      const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
      if (!segmentId || !status) return res.status(400).json({ error: "Missing segmentId or status." });
      const segment = await ConversationIntelligenceService.patchSegmentStatus(segmentId, status as any);
      if (!segment) return res.status(404).json({ error: "Segment not found." });
      return res.json({ success: true, segment });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to update segment status." });
    }
  });

  app.post("/api/conversations/segments/:segmentId/tasks", async (req: Request, res: Response) => {
    try {
      const segmentId = firstParam(req.params.segmentId)?.trim();
      const task = typeof req.body?.task === "string" ? req.body.task.trim() : "";
      const owner = typeof req.body?.owner === "string" ? req.body.owner.trim() : "TASK";
      if (!segmentId || !task) return res.status(400).json({ error: "Missing segmentId or task." });
      const created = await ConversationIntelligenceService.addTask(segmentId, task, owner);
      if (!created) return res.status(404).json({ error: "Segment not found." });
      return res.json({ success: true, task: created });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to add task." });
    }
  });

  app.patch("/api/conversations/segments/:segmentId/project", async (req: Request, res: Response) => {
    try {
      const segmentId = firstParam(req.params.segmentId)?.trim();
      const project = typeof req.body?.project === "string" ? req.body.project.trim() : "";
      if (!segmentId || !project) return res.status(400).json({ error: "Missing segmentId or project." });
      const updated = await ConversationIntelligenceService.linkProject(segmentId, project);
      if (!updated) return res.status(404).json({ error: "Segment not found." });
      return res.json({ success: true, segment: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to link project." });
    }
  });

  app.get("/api/conversations/search", (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      return res.json({
        results: ConversationIntelligenceService.searchMemories(q, {
          provider: typeof req.query.provider === "string" ? req.query.provider.trim() as any : undefined,
          project: typeof req.query.project === "string" ? req.query.project.trim() : undefined,
        }),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to search memories." });
    }
  });

  app.get("/api/conversations/timeline", (req: Request, res: Response) => {
    try {
      const project = typeof req.query.project === "string" ? req.query.project.trim() : undefined;
      return res.json({ timeline: ConversationIntelligenceService.timeline(project) });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Unable to load memory timeline." });
    }
  });

  app.get("/api/conversations/messages", async (req: Request, res: Response) => {
    const relPath = typeof req.query.file === "string" ? req.query.file.trim() : "";
    if (!relPath) {
      return res.status(400).json({ error: "Missing file query parameter." });
    }

    try {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.write("{\"messages\":[");
      let first = true;

      for await (const message of ClaudeConversationsService.streamMessages(relPath)) {
        if (!first) res.write(",");
        res.write(JSON.stringify(message));
        first = false;
      }

      res.end("]}");
    } catch (err: any) {
      if (!res.headersSent) {
        return res.status(500).json({
          error: err?.message || "Unable to stream conversation messages.",
        });
      }
      res.end("]}");
    }
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

  app.post("/api/realtime/voice/session", requireApiKey, (req: Request, res: Response) => {
    const requestedParticipants = Array.isArray(req.body?.participantIds)
      ? req.body.participantIds
          .filter((entry: unknown): entry is string => typeof entry === "string")
          .map((entry: string) => entry.toLowerCase())
      : [];

    try {
      const session = realtimeVoiceOrchestrator.createSession(requestedParticipants);
      return res.json({
        success: true,
        session,
        wsUrl: `ws://${req.get("host")}/ws/realtime-voice?sessionId=${session.id}`,
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/realtime/voice/session/:sessionId", requireApiKey, (req: Request, res: Response) => {
    try {
      return res.json({
        success: true,
        session: realtimeVoiceOrchestrator.snapshot(String(req.params.sessionId || "")),
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/api/realtime/voice/session/:sessionId/operator", requireApiKey, async (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) {
      return res.status(400).json({ success: false, error: "Missing operator text." });
    }

    try {
      await realtimeVoiceOrchestrator.handleOperatorUtterance(String(req.params.sessionId || ""), text);
      return res.json({ success: true });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

  app.post("/api/voice/stt", requireApiKey, express.raw({ type: () => true, limit: "25mb" }), async (req: Request, res: Response) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) {
      return res.status(400).json({ error: "Missing audio payload" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Speech transcription is not configured" });
    }

    const contentType = String(req.headers["content-type"] || "audio/webm").split(";")[0].trim().toLowerCase();
    const extension = contentType.includes("wav")
      ? "wav"
      : contentType.includes("mpeg") || contentType.includes("mp3")
        ? "mp3"
        : contentType.includes("ogg")
          ? "ogg"
          : "webm";

    try {
      const form = new FormData();
      form.append("model", process.env.OPENAI_STT_MODEL_ID || "whisper-1");
      form.append("language", "en");
      form.append("temperature", "0");
      form.append("file", new Blob([body], { type: contentType || "audio/webm" }), `speech.${extension}`);

      const upstream = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });

      const payload: any = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        logger.warn("voice_stt_failed", {
          status: upstream.status,
          error: payload?.error?.message || payload?.message || "Unknown transcription failure",
        });
        return res.status(upstream.status).json({
          error: payload?.error?.message || payload?.message || "Transcription failed",
        });
      }

      return res.json({
        text: typeof payload?.text === "string" ? payload.text : "",
      });
    } catch (err: any) {
      logger.warn("voice_stt_error", { error: err?.message || String(err) });
      return res.status(500).json({ error: err?.message || "Transcription failed" });
    }
  });

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
          body: JSON.stringify({ model: "tts-1", input: truncated, voice, speed: 1.18 }),
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
  app.post("/api/voice/chat", requireApiKey, async (req: Request, res: Response) => {
    const { agentId, message } = req.body || {};
    if (!agentId || !message) return res.status(400).json({ error: "Missing agentId or message" });
    if (isDuplicatePrompt("voice", String(agentId), String(message), HTTP_DEDUP_WINDOW_MS)) {
      return res.status(429).json({ error: "Duplicate request suppressed" });
    }

    try {
      const result = await AgentService.ask(agentId, message, { channel: "voice" });
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

  app.post("/api/messages/chat", requireApiKey, async (req: Request, res: Response) => {
    const { agentIds, message, history } = req.body || {};
    const ids = Array.isArray(agentIds) ? agentIds.filter((entry) => typeof entry === "string" && entry.trim()) : [];
    const cleanMessage = typeof message === "string" ? message.trim() : "";

    if (!ids.length || !cleanMessage) {
      return res.status(400).json({ error: "Missing agentIds or message" });
    }

    const duplicateAgents = ids.filter((agentId) => isDuplicatePrompt("messages", agentId, cleanMessage, HTTP_DEDUP_WINDOW_MS));
    if (duplicateAgents.length === ids.length) {
      return res.status(429).json({ error: "Duplicate request suppressed", agentIds: duplicateAgents });
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
        if (duplicateAgents.includes(agentId)) {
          replies.push({
            agentId,
            status: "suppressed",
            reply: "Duplicate request suppressed to avoid repeating the same work.",
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        const agentPrompt = [
          ids.length > 1
            ? `You are replying inside a live Task Enterprise multi-agent thread with ${ids.length} agents. Be concise, practical, and collaborative. Do not repeat what other agents would likely say.`
            : `You are replying in a direct Task Enterprise operator chat. Be concise, practical, and human. If the operator is greeting, checking in, or making casual conversation, respond naturally and warmly; do not refuse and do not claim you can only do tasks.`,
          `Always refer to the operator as TASK, exactly in all caps.`,
          `Reply in English. Use clean markdown structure when it helps: a short heading or opener, then short bullets or short paragraphs. Keep it easy to scan and avoid one giant text block.`,
          historyLines.length ? `Recent thread:\n${historyLines.join("\n")}` : "",
          `Latest operator message:\n${cleanMessage}`,
        ].filter(Boolean).join("\n\n");

        const result = await AgentService.ask(agentId, cleanMessage, { channel: "messages", threadContextLines: historyLines });
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
    /^(?:\/|\/overview|\/leads-revenue|\/agents|\/messages|\/content|\/approvals|\/voice|\/models|\/c2|\/openclaw|\/mcp|\/mcp-tools|\/tool-store|\/protocols|\/monitoring|\/projects|\/memories|\/docs|\/team|\/office|\/notes|\/calendar|\/tasks|\/logs|\/integrations|\/settings)(?:\/.*)?$/,
    serveCommandCenter
  );

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
  attachRealtimeVoiceServer(server);
  startClaudeWatcher();

  process.on("SIGTERM", () => {
    logger.info("http_server_sigterm_received");
    stopClaudeWatcher();
    server.close(() => {
      logger.info("http_server_closed");
      process.exit(0);
    });
  });
}
















