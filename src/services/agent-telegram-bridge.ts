/**
 * Universal Telegram Bridge — runs a polling bot for every agent that has a token.
 * Each agent polls independently; messages are forwarded to AgentService.ask().
 */
import fs from "fs";
import path from "path";
import { AgentService } from "./agent-service";
import { config } from "../config/config";
import { logger } from "../core/logger";
import { requestJson } from "../core/api-client";
import { isDuplicatePrompt } from "./ingress-guard";

interface TelegramEnvelope<T> { ok: boolean; result: T; }
interface TelegramChat { id: number; }
interface TelegramFrom { is_bot?: boolean; }
interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramFrom;
}
interface TelegramUpdate { update_id: number; message?: TelegramMessage; }

const PLACEHOLDER = "your_telegram_bot_token_here";
const TELEGRAM_TEXT_LIMIT = 4000;

interface AgentBridgeDef {
  agentId: string;   // lowercase, used for offset file
  agentName: string; // capitalized, passed to AgentService
  token: string | undefined;
}

const AGENTS: AgentBridgeDef[] = [
  { agentId: "abdi",  agentName: "Abdi",  token: config.ABDI_TELEGRAM_BOT_TOKEN },
  { agentId: "ahmed", agentName: "Ahmed", token: config.AHMED_TELEGRAM_BOT_TOKEN },
  { agentId: "dame",  agentName: "Dame",  token: config.DAME_TELEGRAM_BOT_TOKEN },
  { agentId: "rex",   agentName: "Rex",   token: config.REX_TELEGRAM_BOT_TOKEN },
  { agentId: "prime", agentName: "Prime", token: config.PRIME_TELEGRAM_BOT_TOKEN },
  { agentId: "atlas", agentName: "Atlas", token: config.ATLAS_TELEGRAM_BOT_TOKEN },
  { agentId: "ayub",  agentName: "Ayub",  token: config.AYUB_TELEGRAM_BOT_TOKEN },
  { agentId: "sygma", agentName: "Sygma", token: config.SYGMA_TELEGRAM_BOT_TOKEN },
];

function offsetFile(agentId: string): string {
  return path.resolve(config.LOG_DIR, `${agentId}-telegram-offset.json`);
}

function loadOffset(agentId: string): number {
  try {
    const raw = fs.readFileSync(offsetFile(agentId), "utf8");
    return Number((JSON.parse(raw) as { offset?: number }).offset) || 0;
  } catch { return 0; }
}

function saveOffset(agentId: string, offset: number): void {
  try {
    const file = offsetFile(agentId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ offset, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch (err) {
    logger.warn(`telegram_offset_save_failed`, { agentId, message: err instanceof Error ? err.message : String(err) });
  }
}

function apiUrl(token: string): string {
  return `${config.TELEGRAM_API_BASE}/bot${token}`;
}

async function sendMessage(token: string, chatId: number, text: string, replyTo?: number): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: text.length > TELEGRAM_TEXT_LIMIT ? text.slice(0, TELEGRAM_TEXT_LIMIT) + "…" : text,
    parse_mode: "HTML",
  };
  if (replyTo) payload.reply_to_message_id = replyTo;
  await requestJson<TelegramEnvelope<unknown>>(`${apiUrl(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 20_000,
  });
}

async function handleMessage(token: string, agentName: string, update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.chat?.id || msg.from?.is_bot) return;
  const text = (msg.text || "").trim();
  if (!text) return;

  if (text === "/start") {
    await sendMessage(token, msg.chat.id,
      `<b>${agentName}</b> is online and ready.\n\nSend <code>/status</code> to check health, or just send any request and I'll reply.`,
      msg.message_id);
    return;
  }

  if (text === "/status") {
    const relayUrl = process.env.DESKTOP_RELAY_URL;
    let relayStatus = "not configured";
    if (relayUrl) {
      try {
        const r = await fetch(`${relayUrl}/health`, { signal: AbortSignal.timeout(4000) });
        const json = await r.json() as { ok?: boolean; platform?: string };
        relayStatus = json.ok ? `✅ online (${json.platform})` : "⚠️ unhealthy";
      } catch {
        relayStatus = "❌ unreachable";
      }
    }
    await sendMessage(token, msg.chat.id,
      `<b>${agentName}</b> status: ONLINE\nTelegram bridge: ✅ active\nMCP relay: ${relayStatus}`,
      msg.message_id);
    return;
  }

  if (text === "/help") {
    await sendMessage(token, msg.chat.id,
      `<b>${agentName} commands:</b>\n/start — greeting\n/status — health + relay check\n/help — this message\n\nOr just send any request directly.`,
      msg.message_id);
    return;
  }

  if (isDuplicatePrompt("telegram", agentName, text, config.HTTP_DEDUP_WINDOW_MS)) {
    logger.warn("telegram_duplicate_prompt_suppressed", { agent: agentName, updateId: update.update_id });
    await sendMessage(
      token,
      msg.chat.id,
      `<b>${agentName}</b> ignored a duplicate request to avoid repeating the same work.`,
      msg.message_id,
    );
    return;
  }

  const response = await AgentService.ask(agentName, text);
  const reply = response.message?.trim() || `${agentName} processed your request.`;
  await sendMessage(token, msg.chat.id, reply, msg.message_id);
}

/**
 * Force-claim the Telegram long-poll session by issuing a zero-timeout getUpdates.
 * This terminates any competing polling session (e.g. from a previous container
 * instance or an external bot runner) so our new loop can take over cleanly.
 * Retries until the session is exclusively ours.
 */
async function claimSession(agent: AgentBridgeDef, token: string): Promise<number> {
  const existing = loadOffset(agent.agentId);
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await requestJson<TelegramEnvelope<TelegramUpdate[]>>(
        `${apiUrl(token)}/getUpdates?timeout=0&limit=1&offset=${existing}`,
        { timeoutMs: 10_000 }
      );
      // Session claimed successfully
      logger.info("telegram_session_claimed", { agent: agent.agentName, attempt });
      const updates = res.result || [];
      if (updates.length > 0) {
        const last = updates[updates.length - 1];
        const newOffset = last.update_id + 1;
        saveOffset(agent.agentId, newOffset);
        return newOffset;
      }
      return existing;
    } catch (err: any) {
      const is409 = String(err?.message || "").includes("409");
      logger.warn("telegram_session_claim_retry", {
        agent: agent.agentName, attempt, is409,
        message: err instanceof Error ? err.message : String(err),
      });
      await new Promise(r => setTimeout(r, is409 ? 3000 : 1000));
    }
  }
  logger.warn("telegram_session_claim_failed", { agent: agent.agentName });
  return existing;
}

async function pollLoop(agent: AgentBridgeDef, token: string): Promise<void> {
  logger.info("telegram_bridge_started", { agent: agent.agentName });
  // Claim session before long-polling (kills any competing getUpdates)
  let offset = await claimSession(agent, token);

  while (true) {
    try {
      const res = await requestJson<TelegramEnvelope<TelegramUpdate[]>>(
        `${apiUrl(token)}/getUpdates?timeout=25&limit=20&offset=${offset}`,
        { timeoutMs: 35_000 }
      );

      for (const update of res.result || []) {
        const next = update.update_id + 1;
        if (next > offset) { offset = next; saveOffset(agent.agentId, offset); }
        try {
          await handleMessage(token, agent.agentName, update);
        } catch (err) {
          logger.error("telegram_message_handler_failed", {
            agent: agent.agentName,
            updateId: update.update_id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is409 = msg.includes("409");
      logger.warn("telegram_poll_error", { agent: agent.agentName, message: msg });
      if (is409) {
        // Another instance took the session — re-claim it
        logger.info("telegram_reclaiming_session", { agent: agent.agentName });
        offset = await claimSession(agent, token);
      } else {
        await new Promise(r => setTimeout(r, 2500));
      }
    }
  }
}

export function startAllAgentTelegramBridges(): void {
  let started = 0;
  for (const agent of AGENTS) {
    const { token, agentId, agentName } = agent;
    if (!token || token === PLACEHOLDER) {
      logger.info("telegram_bridge_skipped", { agent: agentName, reason: "token not configured" });
      continue;
    }
    void pollLoop(agent, token);
    started++;
  }
  logger.info("telegram_bridges_started", { count: started, total: AGENTS.length });
}
