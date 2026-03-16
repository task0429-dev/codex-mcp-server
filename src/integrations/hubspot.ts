import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

const HUBSPOT_BASE = "https://api.hubapi.com";

// ─── Schemas ────────────────────────────────────────────────────────────────

const SearchContactsSchema = z.object({
  query: z.string().describe("Search query (email, name, company)"),
  limit: z.number().int().min(1).max(100).optional().default(10),
  agentName: z.string().describe("Agent requesting access")
});

const GetContactSchema = z.object({
  contactId: z.string().describe("HubSpot contact ID"),
  agentName: z.string().describe("Agent requesting access")
});

const CreateContactSchema = z.object({
  email: z.string().email().describe("Contact work email"),
  firstName: z.string().optional().describe("First name"),
  lastName: z.string().optional().describe("Last name"),
  company: z.string().optional().describe("Company name"),
  website: z.string().optional().describe("Company website URL"),
  phone: z.string().optional().describe("Phone number"),
  teamSize: z.string().optional().describe("Team size"),
  primaryGoal: z.string().optional().describe("Primary goal or use case"),
  utmSource: z.string().optional().describe("UTM source"),
  utmMedium: z.string().optional().describe("UTM medium"),
  utmCampaign: z.string().optional().describe("UTM campaign"),
  agentName: z.string().describe("Agent requesting access")
});

const UpdateContactSchema = z.object({
  contactId: z.string().describe("HubSpot contact ID to update"),
  properties: z.record(z.string()).describe("Key-value map of properties to update"),
  agentName: z.string().describe("Agent requesting access")
});

const UpsertContactSchema = z.object({
  email: z.string().email().describe("Contact work email (used as dedup key)"),
  firstName: z.string().optional().describe("First name"),
  lastName: z.string().optional().describe("Last name"),
  company: z.string().optional().describe("Company name"),
  website: z.string().optional().describe("Company website URL"),
  phone: z.string().optional().describe("Phone number"),
  teamSize: z.string().optional().describe("Team size"),
  primaryGoal: z.string().optional().describe("Primary goal or use case"),
  utmSource: z.string().optional().describe("UTM source"),
  utmMedium: z.string().optional().describe("UTM medium"),
  utmCampaign: z.string().optional().describe("UTM campaign"),
  agentName: z.string().describe("Agent requesting access")
});

const ListContactsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  after: z.string().optional().describe("Pagination cursor for next page"),
  agentName: z.string().describe("Agent requesting access")
});

const CreateDealSchema = z.object({
  dealName: z.string().describe("Deal name"),
  stage: z.string().optional().default("appointmentscheduled").describe("Deal stage ID"),
  amount: z.number().optional().describe("Deal amount in dollars"),
  contactId: z.string().optional().describe("HubSpot contact ID to associate"),
  closeDate: z.string().optional().describe("Expected close date (YYYY-MM-DD)"),
  agentName: z.string().describe("Agent requesting access")
});

const UpdateDealSchema = z.object({
  dealId: z.string().describe("HubSpot deal ID to update"),
  properties: z.record(z.string()).describe("Key-value map of deal properties to update"),
  agentName: z.string().describe("Agent requesting access")
});

// ─── Integration class ───────────────────────────────────────────────────────

export class HubSpotIntegration {
  private static getHeaders(): Record<string, string> {
    const token = (config as any).HUBSPOT_ACCESS_TOKEN;
    if (!token) {
      throw new Error("HubSpot access token not configured. Set HUBSPOT_ACCESS_TOKEN in .env");
    }
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }

  private static buildProperties(input: Record<string, string | number | undefined>): Record<string, string> {
    const props: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && value !== null && value !== "") {
        props[key] = String(value);
      }
    }
    return props;
  }

  static async searchContacts(input: z.infer<typeof SearchContactsSchema>) {
    const { query, limit, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for HubSpot`);
    }

    try {
      const body = JSON.stringify({
        query,
        limit,
        properties: ["email", "firstname", "lastname", "company", "phone", "website", "hs_lead_status", "createdate"]
      });

      const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: HubSpotIntegration.getHeaders(),
        body
      });

      const contacts = (response.results || []).map((c: any) => ({
        id: c.id,
        email: c.properties?.email,
        firstName: c.properties?.firstname,
        lastName: c.properties?.lastname,
        company: c.properties?.company,
        phone: c.properties?.phone,
        website: c.properties?.website,
        leadStatus: c.properties?.hs_lead_status,
        createdAt: c.properties?.createdate
      }));

      logger.info(`Agent ${agentName} searched HubSpot contacts: "${query}" — ${contacts.length} results`);
      return { contacts, total: response.total || contacts.length };
    } catch (error) {
      logger.error(`HubSpot search error for ${agentName}: ${error}`);
      throw error;
    }
  }

  static async getContact(input: z.infer<typeof GetContactSchema>) {
    const { contactId, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for HubSpot`);
    }

    try {
      const props = "email,firstname,lastname,company,phone,website,hs_lead_status,team_size,primary_goal,utm_source,utm_medium,utm_campaign,createdate,lastmodifieddate";
      const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${contactId}?properties=${props}`, {
        headers: HubSpotIntegration.getHeaders()
      });

      logger.info(`Agent ${agentName} retrieved HubSpot contact: ${contactId}`);
      return {
        id: response.id,
        properties: response.properties,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt
      };
    } catch (error) {
      logger.error(`HubSpot get contact error for ${agentName}: ${error}`);
      throw error;
    }
  }

  static async createContact(input: z.infer<typeof CreateContactSchema>) {
    const { agentName, ...fields } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for HubSpot`);
    }

    try {
      const properties = HubSpotIntegration.buildProperties({
        email: fields.email,
        firstname: fields.firstName,
        lastname: fields.lastName,
        company: fields.company,
        website: fields.website,
        phone: fields.phone,
        team_size: fields.teamSize,
        primary_goal: fields.primaryGoal,
        utm_source: fields.utmSource,
        utm_medium: fields.utmMedium,
        utm_campaign: fields.utmCampaign,
        hs_lead_status: "NEW"
      });

      const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
        method: "POST",
        headers: HubSpotIntegration.getHeaders(),
        body: JSON.stringify({ properties })
      });

      logger.info(`Agent ${agentName} created HubSpot contact: ${fields.email}`);
      return { id: response.id, email: fields.email, createdAt: response.createdAt };
    } catch (error) {
      logger.error(`HubSpot create contact error for ${agentName}: ${error}`);
      throw error;
    }
  }

  static async updateContact(input: z.infer<typeof UpdateContactSchema>) {
    const { contactId, properties, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for HubSpot`);
    }

    try {
      const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${contactId}`, {
        method: "PATCH",
        headers: HubSpotIntegration.getHeaders(),
        body: JSON.stringify({ properties })
      });

      logger.info(`Agent ${agentName} updated HubSpot contact: ${contactId}`);
      return { id: response.id, updatedAt: response.updatedAt };
    } catch (error) {
      logger.error(`HubSpot update contact error for ${agentName}: ${error}`);
      throw error;
    }
  }

  static async upsertContact(input: z.infer<typeof UpsertContactSchema>) {
    const { agentName, email, ...fields } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for HubSpot`);
    }

    try {
      // Search for existing contact by email
      const searchResult = await HubSpotIntegration.searchContacts({ query: email, limit: 1, agentName });

      const properties = HubSpotIntegration.buildProperties({
        email,
        firstname: fields.firstName,
        lastname: fields.lastName,
        company: fields.company,
        website: fields.website,
        phone: fields.phone,
        team_size: fields.teamSize,
        primary_goal: fields.primaryGoal,
        utm_source: fields.utmSource,
        utm_medium: fields.utmMedium,
        utm_campaign: fields.utmCampaign
      });

      if (searchResult.contacts.length > 0 && searchResult.contacts[0].email === email) {
        // Update existing
        const existingId = searchResult.contacts[0].id;
        const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${existingId}`, {
          method: "PATCH",
          headers: HubSpotIntegration.getHeaders(),
          body: JSON.stringify({ properties })
        });
        logger.info(`Agent ${agentName} upserted (updated) HubSpot contact: ${email}`);
        return { id: response.id, action: "updated", email };
      } else {
        // Create new
        const allProps = { ...properties, hs_lead_status: "NEW" };
        const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
          method: "POST",
          headers: HubSpotIntegration.getHeaders(),
          body: JSON.stringify({ properties: allProps })
        });
        logger.info(`Agent ${agentName} upserted (created) HubSpot contact: ${email}`);
        return { id: response.id, action: "created", email };
      }
    } catch (error) {
      logger.error(`HubSpot upsert contact error for ${agentName}: ${error}`);
      throw error;
    }
  }

  static async listContacts(input: z.infer<typeof ListContactsSchema>) {
    const { limit, after, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for HubSpot`);
    }

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        properties: "email,firstname,lastname,company,phone,hs_lead_status,createdate"
      });
      if (after) params.set("after", after);

      const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/contacts?${params}`, {
        headers: HubSpotIntegration.getHeaders()
      });

      const contacts = (response.results || []).map((c: any) => ({
        id: c.id,
        email: c.properties?.email,
        firstName: c.properties?.firstname,
        lastName: c.properties?.lastname,
        company: c.properties?.company,
        phone: c.properties?.phone,
        leadStatus: c.properties?.hs_lead_status,
        createdAt: c.properties?.createdate
      }));

      logger.info(`Agent ${agentName} listed HubSpot contacts — ${contacts.length} returned`);
      return {
        contacts,
        paging: response.paging || null
      };
    } catch (error) {
      logger.error(`HubSpot list contacts error for ${agentName}: ${error}`);
      throw error;
    }
  }

  static async createDeal(input: z.infer<typeof CreateDealSchema>) {
    const { dealName, stage, amount, contactId, closeDate, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for HubSpot`);
    }

    try {
      const properties: Record<string, string> = {
        dealname: dealName,
        dealstage: stage || "appointmentscheduled",
        pipeline: "default"
      };
      if (amount !== undefined) properties.amount = String(amount);
      if (closeDate) properties.closedate = closeDate;

      const body: any = { properties };
      if (contactId) {
        body.associations = [{
          to: { id: contactId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }]
        }];
      }

      const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/deals`, {
        method: "POST",
        headers: HubSpotIntegration.getHeaders(),
        body: JSON.stringify(body)
      });

      logger.info(`Agent ${agentName} created HubSpot deal: ${dealName}`);
      return { id: response.id, dealName, stage, createdAt: response.createdAt };
    } catch (error) {
      logger.error(`HubSpot create deal error for ${agentName}: ${error}`);
      throw error;
    }
  }

  static async updateDeal(input: z.infer<typeof UpdateDealSchema>) {
    const { dealId, properties, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "hubspot", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for HubSpot`);
    }

    try {
      const response = await requestJson<any>(`${HUBSPOT_BASE}/crm/v3/objects/deals/${dealId}`, {
        method: "PATCH",
        headers: HubSpotIntegration.getHeaders(),
        body: JSON.stringify({ properties })
      });

      logger.info(`Agent ${agentName} updated HubSpot deal: ${dealId}`);
      return { id: response.id, updatedAt: response.updatedAt };
    } catch (error) {
      logger.error(`HubSpot update deal error for ${agentName}: ${error}`);
      throw error;
    }
  }
}

// ─── Tool definitions for MCP ────────────────────────────────────────────────

export const hubspotTools = [
  {
    name: "hubspot_search_contacts",
    description: "Search HubSpot CRM contacts by email, name, or company",
    inputSchema: SearchContactsSchema,
    handler: HubSpotIntegration.searchContacts.bind(HubSpotIntegration)
  },
  {
    name: "hubspot_get_contact",
    description: "Get a HubSpot CRM contact by ID with all properties",
    inputSchema: GetContactSchema,
    handler: HubSpotIntegration.getContact.bind(HubSpotIntegration)
  },
  {
    name: "hubspot_create_contact",
    description: "Create a new contact in HubSpot CRM",
    inputSchema: CreateContactSchema,
    handler: HubSpotIntegration.createContact.bind(HubSpotIntegration)
  },
  {
    name: "hubspot_update_contact",
    description: "Update properties of an existing HubSpot CRM contact",
    inputSchema: UpdateContactSchema,
    handler: HubSpotIntegration.updateContact.bind(HubSpotIntegration)
  },
  {
    name: "hubspot_upsert_contact",
    description: "Create or update a HubSpot CRM contact by email (dedup-safe lead intake)",
    inputSchema: UpsertContactSchema,
    handler: HubSpotIntegration.upsertContact.bind(HubSpotIntegration)
  },
  {
    name: "hubspot_list_contacts",
    description: "List recent HubSpot CRM contacts with pagination",
    inputSchema: ListContactsSchema,
    handler: HubSpotIntegration.listContacts.bind(HubSpotIntegration)
  },
  {
    name: "hubspot_create_deal",
    description: "Create a new deal in HubSpot CRM pipeline",
    inputSchema: CreateDealSchema,
    handler: HubSpotIntegration.createDeal.bind(HubSpotIntegration)
  },
  {
    name: "hubspot_update_deal",
    description: "Update an existing HubSpot CRM deal",
    inputSchema: UpdateDealSchema,
    handler: HubSpotIntegration.updateDeal.bind(HubSpotIntegration)
  }
];
