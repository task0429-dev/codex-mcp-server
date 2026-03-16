import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

const GetMeSchema = z.object({
  agentName: z.string().describe("Agent requesting access")
});

const GetUpdatesSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
  agentName: z.string().describe("Agent requesting access")
});

const SendMessageSchema = z.object({
  chatId: z.union([z.string(), z.number()]).describe("Target chat ID"),
  text: z.string().min(1).describe("Message text"),
  parseMode: z.enum(["Markdown", "MarkdownV2", "HTML"]).optional(),
  agentName: z.string().describe("Agent requesting access")
});

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
}

const PLACEHOLDER_TELEGRAM_TOKEN = "your_telegram_bot_token_here";
const agentTelegramTokens: Record<string, string | undefined> = {
  abdi: config.ABDI_TELEGRAM_BOT_TOKEN,
  ahmed: config.AHMED_TELEGRAM_BOT_TOKEN,
  dame: config.DAME_TELEGRAM_BOT_TOKEN,
  rex: config.REX_TELEGRAM_BOT_TOKEN,
  prime: config.PRIME_TELEGRAM_BOT_TOKEN,
  atlas: config.ATLAS_TELEGRAM_BOT_TOKEN,
  ayub: config.AYUB_TELEGRAM_BOT_TOKEN,
  sygma: config.SYGMA_TELEGRAM_BOT_TOKEN
};

export class TelegramIntegration {
  private static getBotToken(agentName: string): string {
    const normalizedAgentName = agentName.trim().toLowerCase();
    const resolvedToken = agentTelegramTokens[normalizedAgentName] || config.TELEGRAM_BOT_TOKEN;

    if (!resolvedToken || resolvedToken === PLACEHOLDER_TELEGRAM_TOKEN) {
      const envVarName = `${normalizedAgentName.toUpperCase()}_TELEGRAM_BOT_TOKEN`;
      throw new Error(
        `Telegram bot token not configured for ${agentName}. Set ${envVarName} or TELEGRAM_BOT_TOKEN in environment variables.`
      );
    }

    return resolvedToken;
  }

  private static getBaseUrl(agentName: string): string {
    return `${config.TELEGRAM_API_BASE}/bot${TelegramIntegration.getBotToken(agentName)}`;
  }

  static async getMe(input: z.infer<typeof GetMeSchema>) {
    const { agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "telegram", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Telegram`);
    }

    const response = await requestJson<TelegramResponse<Record<string, unknown>>>(`${TelegramIntegration.getBaseUrl(agentName)}/getMe`);
    logger.info(`Agent ${agentName} retrieved Telegram bot profile`);
    return { bot: response.result };
  }

  static async getUpdates(input: z.infer<typeof GetUpdatesSchema>) {
    const { limit, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "telegram", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Telegram`);
    }

    const response = await requestJson<TelegramResponse<Record<string, unknown>[]>>(
      `${TelegramIntegration.getBaseUrl(agentName)}/getUpdates?limit=${limit}`
    );

    logger.info(`Agent ${agentName} retrieved Telegram updates`, { count: response.result.length });
    return { updates: response.result, count: response.result.length };
  }

  static async sendMessage(input: z.infer<typeof SendMessageSchema>) {
    const { chatId, text, parseMode, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "telegram", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Telegram`);
    }

    const response = await requestJson<TelegramResponse<Record<string, unknown>>>(`${TelegramIntegration.getBaseUrl(agentName)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode })
    });

    logger.info(`Agent ${agentName} sent Telegram message`, { chatId });
    return { success: true, message: response.result };
  }
}

export const telegramTools = [
  {
    name: "telegram_get_me",
    description: "Get the configured Telegram bot profile",
    inputSchema: GetMeSchema,
    handler: TelegramIntegration.getMe.bind(TelegramIntegration)
  },
  {
    name: "telegram_get_updates",
    description: "Retrieve recent Telegram bot updates",
    inputSchema: GetUpdatesSchema,
    handler: TelegramIntegration.getUpdates.bind(TelegramIntegration)
  },
  {
    name: "telegram_send_message",
    description: "Send a Telegram message from the configured bot",
    inputSchema: SendMessageSchema,
    handler: TelegramIntegration.sendMessage.bind(TelegramIntegration)
  }
];
