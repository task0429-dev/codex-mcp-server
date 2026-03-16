import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

const ListRecordsSchema = z.object({
  table: z.string().describe("Airtable table name"),
  baseId: z.string().optional().describe("Airtable base ID; defaults to AIRTABLE_BASE_ID"),
  view: z.string().optional().describe("Optional Airtable view name"),
  maxRecords: z.number().int().min(1).max(100).optional().default(20),
  filterByFormula: z.string().optional().describe("Optional Airtable formula filter"),
  agentName: z.string().describe("Agent requesting access")
});

const CreateRecordSchema = z.object({
  table: z.string().describe("Airtable table name"),
  baseId: z.string().optional().describe("Airtable base ID; defaults to AIRTABLE_BASE_ID"),
  fields: z.record(z.any()).describe("Record field payload"),
  agentName: z.string().describe("Agent requesting access")
});

const UpdateRecordSchema = z.object({
  table: z.string().describe("Airtable table name"),
  recordId: z.string().describe("Airtable record ID"),
  baseId: z.string().optional().describe("Airtable base ID; defaults to AIRTABLE_BASE_ID"),
  fields: z.record(z.any()).describe("Updated field payload"),
  agentName: z.string().describe("Agent requesting access")
});

export class AirtableIntegration {
  private static getBaseId(baseId?: string): string {
    const resolved = baseId || config.AIRTABLE_BASE_ID;
    if (!resolved) {
      throw new Error("Airtable base ID not configured. Set AIRTABLE_BASE_ID or pass baseId.");
    }
    return resolved;
  }

  private static getHeaders(): Record<string, string> {
    if (!config.AIRTABLE_TOKEN) {
      throw new Error("Airtable token not configured. Set AIRTABLE_TOKEN in environment variables.");
    }

    return {
      Authorization: `Bearer ${config.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json"
    };
  }

  static async listRecords(input: z.infer<typeof ListRecordsSchema>) {
    const { table, baseId, view, maxRecords, filterByFormula, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "airtable", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Airtable`);
    }

    const params = new URLSearchParams({ maxRecords: String(maxRecords) });
    if (view) params.set("view", view);
    if (filterByFormula) params.set("filterByFormula", filterByFormula);

    const response = await requestJson<{ records: Record<string, unknown>[] }>(
      `https://api.airtable.com/v0/${this.getBaseId(baseId)}/${encodeURIComponent(table)}?${params.toString()}`,
      { headers: this.getHeaders() }
    );

    logger.info(`Agent ${agentName} listed Airtable records`, { table, count: response.records.length });
    return { records: response.records, count: response.records.length };
  }

  static async createRecord(input: z.infer<typeof CreateRecordSchema>) {
    const { table, baseId, fields, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "airtable", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Airtable`);
    }

    const response = await requestJson<{ records: Record<string, unknown>[] }>(
      `https://api.airtable.com/v0/${this.getBaseId(baseId)}/${encodeURIComponent(table)}`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ records: [{ fields }] })
      }
    );

    logger.info(`Agent ${agentName} created Airtable record`, { table });
    return { records: response.records };
  }

  static async updateRecord(input: z.infer<typeof UpdateRecordSchema>) {
    const { table, recordId, baseId, fields, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "airtable", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Airtable`);
    }

    const response = await requestJson<Record<string, unknown>>(
      `https://api.airtable.com/v0/${this.getBaseId(baseId)}/${encodeURIComponent(table)}/${recordId}`,
      {
        method: "PATCH",
        headers: this.getHeaders(),
        body: JSON.stringify({ fields })
      }
    );

    logger.info(`Agent ${agentName} updated Airtable record`, { table, recordId });
    return { record: response };
  }
}

export const airtableTools = [
  {
    name: "airtable_list_records",
    description: "List records from an Airtable table",
    inputSchema: ListRecordsSchema,
    handler: AirtableIntegration.listRecords.bind(AirtableIntegration)
  },
  {
    name: "airtable_create_record",
    description: "Create a record in Airtable",
    inputSchema: CreateRecordSchema,
    handler: AirtableIntegration.createRecord.bind(AirtableIntegration)
  },
  {
    name: "airtable_update_record",
    description: "Update a record in Airtable",
    inputSchema: UpdateRecordSchema,
    handler: AirtableIntegration.updateRecord.bind(AirtableIntegration)
  }
];
