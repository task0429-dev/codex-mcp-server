import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

const QueryTableSchema = z.object({
  table: z.string().describe("Supabase table name"),
  select: z.string().optional().default("*"),
  filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  limit: z.number().int().min(1).max(1000).optional().default(50),
  agentName: z.string().describe("Agent requesting access")
});

const UpsertRowSchema = z.object({
  table: z.string().describe("Supabase table name"),
  row: z.record(z.any()).describe("Row payload to upsert"),
  onConflict: z.string().optional().describe("Comma-separated conflict columns"),
  agentName: z.string().describe("Agent requesting access")
});

const DeleteRowsSchema = z.object({
  table: z.string().describe("Supabase table name"),
  match: z.record(z.union([z.string(), z.number(), z.boolean()])).describe("Exact-match filters for rows to delete"),
  agentName: z.string().describe("Agent requesting access")
});

export class SupabaseIntegration {
  private static getBaseUrl(): string {
    if (!config.SUPABASE_URL) {
      throw new Error("Supabase URL not configured. Set SUPABASE_URL in environment variables.");
    }
    return `${config.SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
  }

  private static getApiKey(): string {
    const key = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_ANON_KEY;
    if (!key) {
      throw new Error("Supabase key not configured. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
    }
    return key;
  }

  private static getHeaders(): Record<string, string> {
    const apiKey = this.getApiKey();
    return {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
  }

  static async queryTable(input: z.infer<typeof QueryTableSchema>) {
    const { table, select, filters, limit, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "supabase", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Supabase`);
    }

    const params = new URLSearchParams({ select, limit: String(limit) });
    for (const [key, value] of Object.entries(filters || {})) {
      params.set(key, `eq.${value}`);
    }

    const rows = await requestJson<Record<string, unknown>[]>(`${this.getBaseUrl()}/${table}?${params.toString()}`, {
      headers: this.getHeaders()
    });

    logger.info(`Agent ${agentName} queried Supabase table`, { table, count: rows.length });
    return { rows, count: rows.length };
  }

  static async upsertRow(input: z.infer<typeof UpsertRowSchema>) {
    const { table, row, onConflict, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "supabase", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Supabase`);
    }

    const params = new URLSearchParams();
    if (onConflict) params.set("on_conflict", onConflict);

    const rows = await requestJson<Record<string, unknown>[]>(`${this.getBaseUrl()}/${table}?${params.toString()}`, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([row])
    });

    logger.info(`Agent ${agentName} upserted Supabase row`, { table });
    return { rows, count: rows.length };
  }

  static async deleteRows(input: z.infer<typeof DeleteRowsSchema>) {
    const { table, match, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "supabase", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Supabase`);
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(match)) {
      params.set(key, `eq.${value}`);
    }

    const rows = await requestJson<Record<string, unknown>[]>(`${this.getBaseUrl()}/${table}?${params.toString()}`, {
      method: "DELETE",
      headers: this.getHeaders()
    });

    logger.info(`Agent ${agentName} deleted Supabase rows`, { table, count: rows.length });
    return { deleted: rows, count: rows.length };
  }
}

export const supabaseTools = [
  {
    name: "supabase_query_table",
    description: "Query rows from a Supabase table",
    inputSchema: QueryTableSchema,
    handler: SupabaseIntegration.queryTable.bind(SupabaseIntegration)
  },
  {
    name: "supabase_upsert_row",
    description: "Insert or update a row in a Supabase table",
    inputSchema: UpsertRowSchema,
    handler: SupabaseIntegration.upsertRow.bind(SupabaseIntegration)
  },
  {
    name: "supabase_delete_rows",
    description: "Delete rows from a Supabase table using exact-match filters",
    inputSchema: DeleteRowsSchema,
    handler: SupabaseIntegration.deleteRows.bind(SupabaseIntegration)
  }
];
