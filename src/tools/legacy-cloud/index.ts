import { airtableTools } from "../../integrations/airtable";
import { hubspotTools } from "../../integrations/hubspot";
import { discordTools } from "../../integrations/discord";
import { githubTools } from "../../integrations/github";
import { googleDriveTools } from "../../integrations/google-drive";
import { n8nTools } from "../../integrations/n8n";
import { stripeTools } from "../../integrations/stripe";
import { supabaseTools } from "../../integrations/supabase";
import { telegramTools } from "../../integrations/telegram";
import { ToolDefinition } from "../../types/tool";

const group = "legacy-cloud";

function wrapTools(input: Array<{ name: string; description: string; inputSchema: any; handler: (input: any) => Promise<any> }>): ToolDefinition[] {
  return input.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    group,
    handler: async (input) => tool.handler(input),
  }));
}

export const legacyCloudTools: ToolDefinition[] = [
  ...wrapTools(githubTools),
  ...wrapTools(discordTools),
  ...wrapTools(telegramTools),
  ...wrapTools(googleDriveTools),
  ...wrapTools(n8nTools),
  ...wrapTools(supabaseTools),
  ...wrapTools(stripeTools),
  ...wrapTools(airtableTools),
  ...wrapTools(hubspotTools),
];
