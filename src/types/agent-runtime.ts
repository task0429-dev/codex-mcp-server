import { z } from "zod";

export const AgentProviderSchema = z.enum(["openrouter", "openai", "gateway", "local", "manual"]);
export type AgentProvider = z.infer<typeof AgentProviderSchema>;

export const AgentWorkspaceSchema = z.object({
  root: z.string(),
  folders: z.array(z.string()),
  notes: z.array(z.string()).optional(),
});
export type AgentWorkspace = z.infer<typeof AgentWorkspaceSchema>;

export const AgentRuntimeProfileSchema = z.object({
  agentName: z.string(),
  provider: AgentProviderSchema,
  modelFamily: z.string(),
  modelId: z.string(),
  apiKeyEnvVar: z.string().optional(),
  baseUrl: z.string().optional(),
  workspace: AgentWorkspaceSchema,
  systemPrompt: z.string(),
  capabilities: z.array(z.string()),
});
export type AgentRuntimeProfile = z.infer<typeof AgentRuntimeProfileSchema>;
