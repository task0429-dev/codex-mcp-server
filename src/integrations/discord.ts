import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

const ListGuildsSchema = z.object({
  agentName: z.string().describe("Agent requesting access")
});

const ListChannelsSchema = z.object({
  guildId: z.string().describe("Discord guild/server ID"),
  agentName: z.string().describe("Agent requesting access")
});

const SendMessageSchema = z.object({
  channelId: z.string().describe("Discord channel ID"),
  content: z.string().min(1).max(2000).describe("Message content"),
  agentName: z.string().describe("Agent requesting access")
});

interface DiscordGuild {
  id: string;
  name: string;
  owner?: boolean;
  permissions?: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  topic?: string;
}

export class DiscordIntegration {
  private static getHeaders(): Record<string, string> {
    if (!config.DISCORD_BOT_TOKEN) {
      throw new Error("Discord bot token not configured. Set DISCORD_BOT_TOKEN in environment variables.");
    }

    return {
      Authorization: `Bot ${config.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    };
  }

  static async listGuilds(input: z.infer<typeof ListGuildsSchema>) {
    const { agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "discord", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Discord`);
    }

    const guilds = await requestJson<DiscordGuild[]>(`${config.DISCORD_API_BASE}/users/@me/guilds`, {
      headers: this.getHeaders()
    });

    logger.info(`Agent ${agentName} listed Discord guilds`, { count: guilds.length });
    return { guilds, count: guilds.length };
  }

  static async listChannels(input: z.infer<typeof ListChannelsSchema>) {
    const { guildId, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "discord", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Discord`);
    }

    const channels = await requestJson<DiscordChannel[]>(`${config.DISCORD_API_BASE}/guilds/${guildId}/channels`, {
      headers: this.getHeaders()
    });

    logger.info(`Agent ${agentName} listed Discord channels`, { guildId, count: channels.length });
    return { channels, count: channels.length };
  }

  static async sendMessage(input: z.infer<typeof SendMessageSchema>) {
    const { channelId, content, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "discord", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Discord`);
    }

    const response = await requestJson<{ id: string; timestamp: string }>(
      `${config.DISCORD_API_BASE}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ content })
      }
    );

    logger.info(`Agent ${agentName} sent Discord message`, { channelId, messageId: response.id });
    return { success: true, channelId, messageId: response.id, timestamp: response.timestamp };
  }
}

export const discordTools = [
  {
    name: "discord_list_guilds",
    description: "List Discord servers available to the configured bot",
    inputSchema: ListGuildsSchema,
    handler: DiscordIntegration.listGuilds.bind(DiscordIntegration)
  },
  {
    name: "discord_list_channels",
    description: "List channels for a Discord server",
    inputSchema: ListChannelsSchema,
    handler: DiscordIntegration.listChannels.bind(DiscordIntegration)
  },
  {
    name: "discord_send_message",
    description: "Send a message to a Discord channel",
    inputSchema: SendMessageSchema,
    handler: DiscordIntegration.sendMessage.bind(DiscordIntegration)
  }
];
