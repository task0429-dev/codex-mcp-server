import fs from "fs";
import path from "path";
import { AgentService } from "./agent-service";
import { config } from "../config/config";
import { logger } from "../core/logger";
import { requestJson } from "../core/api-client";

interface TelegramEnvelope<T> {
  ok: boolean;
  result: T;
}

interface TelegramChat {
  id: number;
}

interface TelegramFrom {
  is_bot?: boolean;
}

interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramFrom;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

const PLACEHOLDER_TOKEN = "your_telegram_bot_token_here";
const OFFSET_FILE = path.resolve(config.LOG_DIR, "atlas-telegram-offset.json");
const TELEGRAM_TEXT_LIMIT = 4000;

let started = false;

function loadOffset(): number {
  try {
    const raw = fs.readFileSync(OFFSET_FILE, "utf8");
    const parsed = JSON.parse(raw) as { offset?: number };
    return Number(parsed.offset) || 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset: number): void {
  try {
    fs.mkdirSync(path.dirname(OFFSET_FILE), { recursive: true });
    fs.writeFileSync(
      OFFSET_FILE,
      JSON.stringify({ offset, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch (error) {
    logger.warn("Atlas Telegram bridge could not persist offset", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getToken(): string | undefined {
  const token = config.ATLAS_TELEGRAM_BOT_TOKEN;
  if (!token || token === PLACEHOLDER_TOKEN) return undefined;
  return token;
}

function baseUrl(token: string): string {
  return `${config.TELEGRAM_API_BASE}/bot${token}`;
}

async function sendMessage(token: string, chatId: number, text: string, replyToMessageId?: number): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: text.length > TELEGRAM_TEXT_LIMIT ? text.slice(0, TELEGRAM_TEXT_LIMIT) : text,
  };
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;

  await requestJson<TelegramEnvelope<Record<string, unknown>>>(`${baseUrl(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 20_000,
  });
}

async function handleMessage(token: string, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message?.chat?.id || message.from?.is_bot) return;

  const text = (message.text || "").trim();
  if (!text) return;

  if (text === "/start") {
    await sendMessage(
      token,
      message.chat.id,
      "Atlas is online. Send /status to confirm health or message your request directly.",
      message.message_id
    );
    return;
  }

  if (text === "/status") {
    await sendMessage(
      token,
      message.chat.id,
      "Atlas status: ONLINE. Telegram bridge + agent runtime are active.",
      message.message_id
    );
    return;
  }

  if (text === "/help") {
    await sendMessage(
      token,
      message.chat.id,
      "Commands: /status, /help. You can also send any request and Atlas will reply.",
      message.message_id
    );
    return;
  }

  const agentResponse = await AgentService.ask("Atlas", text);
  const reply = agentResponse.message?.trim() || "Atlas completed your request.";
  await sendMessage(token, message.chat.id, reply, message.message_id);
}

async function pollLoop(token: string): Promise<void> {
  let offset = loadOffset();
  logger.info("Atlas Telegram bridge started", { offset });

  while (true) {
    try {
      const updates = await requestJson<TelegramEnvelope<TelegramUpdate[]>>(
        `${baseUrl(token)}/getUpdates?timeout=25&limit=20&offset=${offset}`,
        { timeoutMs: 35_000 }
      );

      for (const update of updates.result || []) {
        const nextOffset = update.update_id + 1;
        if (nextOffset > offset) {
          offset = nextOffset;
          saveOffset(offset);
        }

        try {
          await handleMessage(token, update);
        } catch (error) {
          logger.error("Atlas Telegram bridge failed to handle message", {
            updateId: update.update_id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      logger.warn("Atlas Telegram bridge polling error", {
        message: error instanceof Error ? error.message : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

export function startAtlasTelegramBridge(): void {
  if (started) return;
  started = true;

  const token = getToken();
  if (!token) {
    logger.info("Atlas Telegram bridge skipped: token not configured");
    return;
  }

  void pollLoop(token);
}

