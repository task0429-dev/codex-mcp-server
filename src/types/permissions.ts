import { z } from "zod";

export const PermissionLevelSchema = z.enum(["none", "read", "write", "execute", "admin"]);
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

export const IntegrationTypeSchema = z.enum([
  "notion",
  "docker",
  "filesystem",
  "github",
  "terminal",
  "desktop",
  "agent_core",
  "discord",
  "telegram",
  "google_drive",
  "supabase",
  "stripe",
  "airtable",
  "n8n",
  "hubspot"
]);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const AgentPermissionsSchema = z.record(IntegrationTypeSchema, PermissionLevelSchema);
export type AgentPermissions = z.infer<typeof AgentPermissionsSchema>;

export const PolicySchema = z.object({
  agentName: z.string(),
  permissions: AgentPermissionsSchema,
  allowedCommands: z.array(z.string()).optional(),
  maxExecutionTime: z.number().optional(),
});
export type Policy = z.infer<typeof PolicySchema>;
