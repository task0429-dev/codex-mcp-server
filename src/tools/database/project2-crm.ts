import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { ToolDefinition } from "../../types/tool";

const group = "database";
const crmStorePath = path.join(hubConfig.projectRoot, "data", "project-2", "crm", "project2-crm.json");

const CaptureLeadSchema = z.object({
  external_lead_id: z.string().min(1).optional(),
  full_name: z.string().min(1),
  email: z.string().email(),
  company: z.string().min(1),
  team_size: z.string().optional().nullable(),
  monthly_lead_goal: z.coerce.number().int().min(0).optional().nullable(),
  crm_in_use: z.string().optional().nullable(),
  source: z.string().min(1).default("landing_page"),
  cta_id: z.string().optional().nullable(),
  submitted_at: z.string().optional().nullable(),
  website_url: z.string().url().optional().nullable(),
  primary_goal: z.string().optional().nullable(),
  landing_variant: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  status: z.string().min(1).default("new"),
  metadata: z.record(z.any()).optional().nullable(),
});

const GetLeadSchema = z.object({
  external_lead_id: z.string().optional(),
  email: z.string().email().optional(),
}).refine((input) => Boolean(input.external_lead_id || input.email), {
  message: "Provide external_lead_id or email.",
});

const ListLeadsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  source: z.string().optional(),
});

type CrmLeadInput = z.infer<typeof CaptureLeadSchema>;

type Project2LeadRecord = {
  external_lead_id: string;
  email: string;
  full_name: string;
  company: string;
  team_size: string | null;
  monthly_lead_goal: number | null;
  crm_in_use: string | null;
  source: string;
  cta_id: string | null;
  submitted_at_utc: string;
  website_url: string | null;
  primary_goal: string | null;
  landing_variant: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: string;
  created_at_utc: string;
  updated_at_utc: string;
  metadata: Record<string, unknown>;
};

function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function ensureStore() {
  fs.mkdirSync(path.dirname(crmStorePath), { recursive: true });
  if (!fs.existsSync(crmStorePath)) {
    fs.writeFileSync(crmStorePath, "[]\n", "utf8");
  }
}

function readLeads(): Project2LeadRecord[] {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(crmStorePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLeads(leads: Project2LeadRecord[]) {
  ensureStore();
  fs.writeFileSync(crmStorePath, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
}

function normalizeLead(input: CrmLeadInput): Omit<Project2LeadRecord, "created_at_utc" | "updated_at_utc"> {
  const timestamp = input.submitted_at || nowUtc();
  const email = input.email.trim().toLowerCase();
  const externalLeadId = input.external_lead_id?.trim() || `${email}-${timestamp}`;

  return {
    external_lead_id: externalLeadId,
    email,
    full_name: input.full_name.trim(),
    company: input.company.trim(),
    team_size: input.team_size || null,
    monthly_lead_goal: input.monthly_lead_goal ?? null,
    crm_in_use: input.crm_in_use || null,
    source: input.source,
    cta_id: input.cta_id || null,
    submitted_at_utc: timestamp,
    website_url: input.website_url || null,
    primary_goal: input.primary_goal || null,
    landing_variant: input.landing_variant || null,
    utm_source: input.utm_source || null,
    utm_medium: input.utm_medium || null,
    utm_campaign: input.utm_campaign || null,
    status: input.status,
    metadata: input.metadata || {},
  };
}

export const project2CrmTools: ToolDefinition[] = [
  {
    name: "project2_crm_capture_lead",
    description: "Capture or upsert a Project 2 landing-page lead into the MCP-backed CRM store.",
    inputSchema: CaptureLeadSchema,
    group,
    handler: async (input) => {
      const nextLead = normalizeLead(input);
      const leads = readLeads();
      const existingIndex = leads.findIndex((lead) => lead.external_lead_id === nextLead.external_lead_id);
      const createdAt = existingIndex >= 0 ? leads[existingIndex].created_at_utc : nowUtc();

      const persistedLead: Project2LeadRecord = {
        ...nextLead,
        created_at_utc: createdAt,
        updated_at_utc: nowUtc(),
      };

      if (existingIndex >= 0) {
        leads[existingIndex] = persistedLead;
      } else {
        leads.unshift(persistedLead);
      }

      writeLeads(leads);

      return {
        ok: true,
        created: existingIndex === -1,
        lead: persistedLead,
        database_path: crmStorePath,
      };
    },
  },
  {
    name: "project2_crm_get_lead",
    description: "Fetch a Project 2 CRM lead by external lead id or email.",
    inputSchema: GetLeadSchema,
    group,
    handler: async (input) => {
      const leads = readLeads();
      const normalizedEmail = input.email?.trim().toLowerCase();
      const lead = input.external_lead_id
        ? leads.find((item) => item.external_lead_id === input.external_lead_id) || null
        : leads.find((item) => item.email === normalizedEmail) || null;

      return {
        ok: true,
        lead,
        database_path: crmStorePath,
      };
    },
  },
  {
    name: "project2_crm_list_leads",
    description: "List recent Project 2 CRM leads for agent review and follow-up.",
    inputSchema: ListLeadsSchema,
    group,
    handler: async (input) => {
      const leads = readLeads()
        .filter((lead) => (input.status ? lead.status === input.status : true))
        .filter((lead) => (input.source ? lead.source === input.source : true))
        .sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc))
        .slice(0, input.limit);

      return {
        ok: true,
        count: leads.length,
        leads,
        database_path: crmStorePath,
      };
    },
  },
];
