import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { HTTP_PORT, HTTP_HOST, IS_PRODUCTION } from "../config";
import type { Express, Request, Response } from "express";
import { requestJson } from "./api-client";
import { buildAgentData, buildCommandCenterPayload, renderCommandCenterHtml } from "./command-center";
import { buildVoiceCenterPayload } from "./voice-center";
import { getAllTools, getStartupSummary, getTool } from "../server/tool-registry";
import { MissionControlStateService } from "../services/mission-control-state-service";
import { MonitorService } from "../services/monitor-service";
import { AgentService } from "../services/agent-service";
import { AgentRunner } from "../services/agent-runner";
import { toToolError } from "../utils/errors";
import { screenStreamService } from "../services/screen-stream-service";
import { GoogleDriveIntegration, GoogleDocsIntegration } from "../integrations/google-drive";
import { mountCortexRoutes } from "../cortex/cortex-routes";

const CONTROL_UI_ROOT = path.resolve(__dirname, "../../control-ui");
const CONTROL_UI_INDEX = path.join(CONTROL_UI_ROOT, "index.html");

/**
 * Describes the current screen state using Windows metadata via the desktop relay.
 * Gets active window, visible windows, cursor position — no vision API needed.
 * Falls back to null if the relay is unreachable.
 */
async function describeScreenForPrime(_snapshot: string): Promise<string | null> {
  const relayUrl = process.env.DESKTOP_RELAY_URL;
  if (!relayUrl) return null;

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 12
$winList = $procs | ForEach-Object { "$($_.Name): $($_.MainWindowTitle)" }
$focused = ($procs | Select-Object -First 1)
$focusedStr = if ($focused) { "$($focused.Name): $($focused.MainWindowTitle)" } else { "unknown" }
Add-Type -AssemblyName System.Windows.Forms
$clip = try { [System.Windows.Forms.Clipboard]::GetText().Substring(0,[Math]::Min(100,[System.Windows.Forms.Clipboard]::GetText().Length)) } catch { '' }
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$res = "$($screen.Bounds.Width)x$($screen.Bounds.Height)"
Write-Output "FOCUSED=$focusedStr"
Write-Output "RES=$res"
Write-Output "WINDOWS=$($winList -join ' | ')"
if ($clip) { Write-Output "CLIP=$clip" }
`;

  try {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    // Docker uses host.docker.internal; tests from host use localhost
    const relayBase = relayUrl;
    const res = await fetch(`${relayBase}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encodedScript: encoded, timeoutMs: 8000 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const raw = (data?.stdout || "").trim();
    if (!raw) return null;

    // Parse line-based output: FOCUSED=..., RES=..., WINDOWS=..., CLIP=...
    const lines: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const idx = line.indexOf("=");
      if (idx > 0) lines[line.slice(0, idx)] = line.slice(idx + 1).trim();
    }
    const parts = [
      lines.FOCUSED ? `Focused app: ${lines.FOCUSED}` : "",
      lines.RES     ? `Screen resolution: ${lines.RES}` : "",
      lines.WINDOWS ? `Open windows: ${lines.WINDOWS}` : "",
      lines.CLIP    ? `Clipboard: "${lines.CLIP}"` : "",
    ].filter(Boolean).join(". ");

    return parts ? `Screen shows: ${parts}` : null;
  } catch (e: any) {
    logger.warn("screen_desc_relay_error", { error: e?.message });
    return null;
  }
}

const HUBSPOT_BASE = "https://api.hubapi.com";

type RevenueLeadSource =
  | "Instagram"
  | "Facebook"
  | "X / Twitter"
  | "TikTok"
  | "Website / Landing Page"
  | "Referral"
  | "Direct Outreach"
  | "Email"
  | "Paid Ads"
  | "Other";

type RevenuePlatform = "Organic Social" | "Paid Social" | "Owned Media" | "Outbound" | "Referral";

type RevenueLeadStatus =
  | "New"
  | "Contacted"
  | "Awaiting Response"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Won"
  | "Lost"
  | "Stale"
  | "Re-engagement";

type RevenuePipelineStage =
  | "New Leads"
  | "Contacted"
  | "Awaiting Response"
  | "Qualified"
  | "Proposal Sent"
  | "Negotiation"
  | "Won"
  | "Lost"
  | "Stale Leads"
  | "Re-engagement Candidates";

interface HubSpotListResponse {
  results?: Array<{ id: string; properties?: Record<string, string> }>;
  paging?: { next?: { after?: string } };
}

interface HubSpotPipelineResponse {
  results?: Array<{
    id: string;
    label?: string;
    stages?: Array<{
      id: string;
      label?: string;
      metadata?: Record<string, string>;
    }>;
  }>;
}

interface StripeChargeListResponse {
  data?: Array<{
    id: string;
    amount: number;
    amount_captured?: number;
    created: number;
    paid?: boolean;
    refunded?: boolean;
    status?: string;
    description?: string | null;
    metadata?: Record<string, string>;
    balance_transaction?:
      | string
      | {
          id?: string;
          amount?: number;
          net?: number;
          fee?: number;
        };
  }>;
}

interface RevenueTrafficEvent {
  id: string;
  type: "visit" | "submission";
  timestamp: string;
  path: string;
  ipHash: string;
}

const REVENUE_EVENTS_PATH = path.resolve(__dirname, "../../data/revenue-events.json");

function getHubSpotHeaders(): Record<string, string> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN is not configured.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function getStripeHeaders(): Record<string, string> {
  const token = process.env.STRIPE_SECRET_KEY;
  if (!token) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function normalizeLeadSource(raw: string): RevenueLeadSource {
  const value = raw.trim().toLowerCase();
  if (!value) return "Other";
  if (value.includes("instagram") || value === "ig") return "Instagram";
  if (value.includes("facebook")) return "Facebook";
  if (value.includes("twitter") || value.includes("x")) return "X / Twitter";
  if (value.includes("tiktok")) return "TikTok";
  if (value.includes("website") || value.includes("landing") || value.includes("site")) return "Website / Landing Page";
  if (value.includes("referral") || value.includes("word of mouth")) return "Referral";
  if (value.includes("outreach") || value.includes("cold") || value.includes("dm")) return "Direct Outreach";
  if (value.includes("email")) return "Email";
  if (value.includes("ad") || value.includes("paid")) return "Paid Ads";
  return "Other";
}

function platformFromSource(source: RevenueLeadSource): RevenuePlatform {
  switch (source) {
    case "Instagram":
    case "Facebook":
    case "X / Twitter":
    case "TikTok":
      return source === "Instagram" || source === "TikTok" ? "Organic Social" : "Paid Social";
    case "Website / Landing Page":
    case "Email":
      return "Owned Media";
    case "Referral":
      return "Referral";
    case "Direct Outreach":
      return "Outbound";
    case "Paid Ads":
      return "Paid Social";
    default:
      return "Owned Media";
  }
}

function cleanStatus(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function mapLeadStatus(rawStatus: string, lifecycleStage: string): RevenueLeadStatus {
  const status = cleanStatus(rawStatus);
  const lifecycle = cleanStatus(lifecycleStage);

  if (lifecycle.includes("customer") || status.includes("won") || status.includes("closed won")) return "Won";
  if (status.includes("lost") || status.includes("unqualified") || status.includes("bad fit")) return "Lost";
  if (status.includes("proposal")) return "Proposal Sent";
  if (status.includes("negotiation")) return "Negotiation";
  if (status.includes("qualified")) return "Qualified";
  if (status.includes("awaiting") || status.includes("response")) return "Awaiting Response";
  if (status.includes("contacted") || status.includes("open") || status.includes("in progress")) return "Contacted";
  if (status.includes("stale")) return "Stale";
  if (status.includes("re-engagement") || status.includes("reactivation")) return "Re-engagement";
  return "New";
}

function mapPipelineStage(status: RevenueLeadStatus): RevenuePipelineStage {
  switch (status) {
    case "New":
      return "New Leads";
    case "Contacted":
      return "Contacted";
    case "Awaiting Response":
      return "Awaiting Response";
    case "Qualified":
      return "Qualified";
    case "Proposal Sent":
      return "Proposal Sent";
    case "Negotiation":
      return "Negotiation";
    case "Won":
      return "Won";
    case "Lost":
      return "Lost";
    case "Stale":
      return "Stale Leads";
    case "Re-engagement":
      return "Re-engagement Candidates";
    default:
      return "New Leads";
  }
}

function isoNow() {
  return new Date().toISOString();
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

function readRevenueTrafficEvents(): RevenueTrafficEvent[] {
  try {
    const raw = fs.readFileSync(REVENUE_EVENTS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRevenueTrafficEvents(events: RevenueTrafficEvent[]) {
  fs.mkdirSync(path.dirname(REVENUE_EVENTS_PATH), { recursive: true });
  fs.writeFileSync(REVENUE_EVENTS_PATH, `${JSON.stringify(events, null, 2)}\n`, "utf8");
}

function recordRevenueTrafficEvent(event: Omit<RevenueTrafficEvent, "id">) {
  const events = readRevenueTrafficEvents();
  const dedupeKey = `${event.type}:${event.path}:${event.ipHash}:${event.timestamp.slice(0, 10)}`;
  const hasDuplicate = events.some(
    (existing) =>
      `${existing.type}:${existing.path}:${existing.ipHash}:${existing.timestamp.slice(0, 10)}` === dedupeKey
  );
  if (hasDuplicate && event.type === "visit") return;

  events.push({
    id: `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...event,
  });

  const pruned = events
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp))
    .slice(-4000);
  writeRevenueTrafficEvents(pruned);
}

function stringOrFallback(value: string | undefined, fallback: string) {
  const trimmed = (value || "").trim();
  return trimmed || fallback;
}

function fullName(firstName: string | undefined, lastName: string | undefined, email: string | undefined) {
  const joined = `${firstName || ""} ${lastName || ""}`.trim();
  if (joined) return joined;
  if (email) return email.split("@")[0];
  return "Unknown Lead";
}

async function fetchRevenueContacts(limit = 200) {
  const properties = [
    "email",
    "firstname",
    "lastname",
    "company",
    "phone",
    "hs_lead_status",
    "createdate",
    "lastmodifieddate",
    "source",
    "campaign",
    "lead_score",
    "intent_band",
    "last_funnel_step",
    "follow_up_owner",
    "primary_need",
    "monthly_revenue_range",
    "instagram_handle",
    "lifecyclestage",
    "jobtitle",
    "requested_asset",
  ].join(",");

  const contacts: Array<{ id: string; properties: Record<string, string> }> = [];
  let after: string | undefined;

  while (contacts.length < limit) {
    const params = new URLSearchParams({
      limit: String(Math.min(100, limit - contacts.length)),
      properties,
    });
    if (after) params.set("after", after);

    const response = await requestJson<HubSpotListResponse>(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts?${params.toString()}`,
      { headers: getHubSpotHeaders(), timeoutMs: 20_000 }
    );

    for (const result of response.results || []) {
      contacts.push({ id: result.id, properties: result.properties || {} });
    }

    after = response.paging?.next?.after;
    if (!after) break;
  }

  return contacts;
}

async function probeDealsReadCapability() {
  try {
    await requestJson(
      `${HUBSPOT_BASE}/crm/v3/objects/deals?limit=1&properties=dealname,amount,dealstage,createdate,closedate`,
      { headers: getHubSpotHeaders(), timeoutMs: 15_000 }
    );
    return { available: true as const };
  } catch (error: any) {
    return {
      available: false as const,
      reason: error?.message || "HubSpot deal read failed.",
    };
  }
}

async function fetchRevenueDeals(limit = 100) {
  const response = await requestJson<HubSpotListResponse>(
    `${HUBSPOT_BASE}/crm/v3/objects/deals?limit=${Math.min(limit, 100)}&properties=dealname,amount,dealstage,pipeline,createdate,closedate,hubspot_owner_id,source,campaign,requested_asset,follow_up_owner,lastmodifieddate`,
    { headers: getHubSpotHeaders(), timeoutMs: 20_000 }
  );
  return response.results || [];
}

async function fetchDealStageMap() {
  try {
    const response = await requestJson<HubSpotPipelineResponse>(
      `${HUBSPOT_BASE}/crm/v3/pipelines/deals`,
      { headers: getHubSpotHeaders(), timeoutMs: 20_000 }
    );

    const stageMap = new Map<string, { label: string; closed: boolean; probability: number }>();
    for (const pipeline of response.results || []) {
      for (const stage of pipeline.stages || []) {
        const probability = numberOrZero(stage.metadata?.probability);
        const closed = stage.metadata?.isClosed === "true";
        stageMap.set(stage.id, {
          label: stage.label || stage.id,
          closed,
          probability: probability > 1 ? probability / 100 : probability,
        });
      }
    }
    return stageMap;
  } catch {
    return new Map<string, { label: string; closed: boolean; probability: number }>();
  }
}

function classifyDealStage(
  stageId: string,
  stageMap: Map<string, { label: string; closed: boolean; probability: number }>
) {
  const entry = stageMap.get(stageId);
  const label = entry?.label || stageId || "Unknown Stage";
  const normalized = `${stageId} ${label}`.toLowerCase();
  const won =
    normalized.includes("closedwon") ||
    normalized.includes("closed won") ||
    normalized.includes("won");
  const lost =
    normalized.includes("closedlost") ||
    normalized.includes("closed lost") ||
    normalized.includes("lost");
  const probability =
    entry?.probability && entry.probability >= 0
      ? entry.probability
      : won
        ? 1
        : lost
          ? 0
          : 0.35;

  return {
    label,
    won,
    lost,
    closed: entry?.closed || won || lost,
    probability,
  };
}

async function fetchStripeCharges(limit = 100) {
  try {
    const response = await requestJson<StripeChargeListResponse>(
      `https://api.stripe.com/v1/charges?limit=${Math.min(limit, 100)}&expand[]=data.balance_transaction`,
      { headers: getStripeHeaders(), timeoutMs: 20_000 }
    );
    return { available: true as const, charges: response.data || [] };
  } catch (error: any) {
    return {
      available: false as const,
      charges: [] as StripeChargeListResponse["data"],
      reason: error?.message || "Stripe charge read failed.",
    };
  }
}

async function buildLiveRevenuePayload() {
  const contacts = await fetchRevenueContacts(200);
  const dealRead = await probeDealsReadCapability();
  const stageMap = dealRead.available ? await fetchDealStageMap() : new Map<string, { label: string; closed: boolean; probability: number }>();
  const deals = dealRead.available ? await fetchRevenueDeals(100) : [];
  const stripe = await fetchStripeCharges(100);
  const trafficEvents = readRevenueTrafficEvents();

  const leads = contacts.map((contact) => {
    const props = contact.properties || {};
    const source = normalizeLeadSource(props.source || props.hs_analytics_source || "");
    const status = mapLeadStatus(props.hs_lead_status || "", props.lifecyclestage || "");
    const stage = mapPipelineStage(status);
    const leadScore = Number(props.lead_score || 0) || 0;
    const createdAt = props.createdate || isoNow();
    const updatedAt = props.lastmodifieddate || createdAt;
    const qualified = status === "Qualified" || status === "Proposal Sent" || status === "Negotiation" || status === "Won" || leadScore >= 70 || cleanStatus(props.intent_band || "").includes("high");
    const converted = status === "Won" || cleanStatus(props.lifecyclestage || "").includes("customer");
    const tags = [props.intent_band, props.monthly_revenue_range, props.instagram_handle ? "instagram handle" : ""]
      .map((value) => (value || "").trim())
      .filter(Boolean);

    return {
      id: contact.id,
      name: fullName(props.firstname, props.lastname, props.email),
      company: stringOrFallback(props.company, "Unspecified Company"),
      email: stringOrFallback(props.email, "No email on record"),
      phone: stringOrFallback(props.phone, "No phone on record"),
      source,
      campaignId: stringOrFallback(props.campaign, "uncategorized"),
      platform: platformFromSource(source),
      funnel: source === "Instagram" ? "Instagram Lead Funnel" : source === "Referral" ? "Referral Funnel" : "Inbound Revenue Funnel",
      offer: stringOrFallback(props.requested_asset, "Task Enterprise Guide"),
      status,
      stage,
      leadScore,
      dealValue: 0,
      assignedTo: stringOrFallback(props.follow_up_owner, "Unassigned"),
      createdAt,
      lastContactAt: updatedAt,
      nextFollowUpAt: updatedAt,
      tags,
      notesPreview: stringOrFallback(props.primary_need || props.last_funnel_step, "Live contact synced from HubSpot."),
      qualified,
      converted,
      customerAcquiredAt: converted ? updatedAt : undefined,
    };
  });

  const salesFromDeals = deals
    .map((deal) => {
      const props = deal.properties || {};
      const amount = numberOrZero(props.amount);
      const stage = classifyDealStage(props.dealstage || "", stageMap);
      if (!stage.won || amount <= 0) return null;
      const closeDate = props.closedate || props.lastmodifieddate || props.createdate || isoNow();
      const createdAt = props.createdate || closeDate;
      const source = normalizeLeadSource(props.source || "");
      return {
        id: `hubspot-deal-${deal.id}`,
        leadId: `hubspot-deal-${deal.id}`,
        source,
        campaignId: stringOrFallback(props.campaign, "hubspot-deals"),
        offer: stringOrFallback(props.requested_asset, props.dealname || "Task Enterprise Service"),
        owner: stringOrFallback(props.follow_up_owner || props.hubspot_owner_id, "HubSpot"),
        grossRevenue: amount,
        netRevenue: amount,
        profit: amount,
        closeDate,
        salesCycleDays: Math.max(0, Math.round((new Date(closeDate).getTime() - new Date(createdAt).getTime()) / 86_400_000)),
        refunded: false,
        cancelled: false,
      };
    })
    .filter(isDefined);

  const salesFromStripe = salesFromDeals.length
    ? []
    : (stripe.charges || [])
        .filter((charge) => charge.paid && !charge.refunded && charge.status === "succeeded" && numberOrZero(charge.amount_captured || charge.amount) > 0)
        .map((charge) => {
          const balance = typeof charge.balance_transaction === "object" ? charge.balance_transaction : undefined;
          const grossRevenue = numberOrZero(charge.amount_captured || charge.amount) / 100;
          const netRevenue = balance?.net != null ? numberOrZero(balance.net) / 100 : grossRevenue;
          const source = normalizeLeadSource(charge.metadata?.source || "");
          const createdAt = new Date(charge.created * 1000).toISOString();
          return {
            id: `stripe-charge-${charge.id}`,
            leadId: stringOrFallback(charge.metadata?.hubspot_contact_id, `stripe-charge-${charge.id}`),
            source,
            campaignId: stringOrFallback(charge.metadata?.campaign, "stripe-payments"),
            offer: stringOrFallback(charge.metadata?.offer, charge.description || "Task Enterprise Payment"),
            owner: stringOrFallback(charge.metadata?.owner, "Stripe"),
            grossRevenue,
            netRevenue,
            profit: netRevenue,
            closeDate: createdAt,
            salesCycleDays: 0,
            refunded: false,
            cancelled: false,
          };
        });

  const sales = [...salesFromDeals, ...salesFromStripe];

  const opportunities = deals.length
    ? deals
        .map((deal) => {
          const props = deal.properties || {};
          const amount = numberOrZero(props.amount);
          const stage = classifyDealStage(props.dealstage || "", stageMap);
          if (stage.won || stage.lost) return null;
          const createdAt = props.createdate || isoNow();
          const updatedAt = props.lastmodifieddate || props.closedate || createdAt;
          const ageDays = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
          return {
            id: `deal-opp-${deal.id}`,
            leadId: `hubspot-deal-${deal.id}`,
            name: stringOrFallback(props.dealname, "HubSpot Deal"),
            company: stringOrFallback(props.dealname, "HubSpot Deal"),
            stage: stage.label.toLowerCase().includes("proposal")
              ? "Proposal Sent"
              : stage.label.toLowerCase().includes("negotiation")
                ? "Negotiation"
                : stage.label.toLowerCase().includes("qualified")
                  ? "Qualified"
                  : "Contacted",
            value: amount,
            weightedValue: amount * stage.probability,
            owner: stringOrFallback(props.follow_up_owner || props.hubspot_owner_id, "HubSpot"),
            ageDays,
            probability: stage.probability,
            stale: ageDays >= 14,
            highValue: amount >= 5000,
            overdueFollowUp: ageDays >= 7,
            createdAt,
            updatedAt,
          };
        })
        .filter(isDefined)
    : leads.map((lead) => {
        const ageDays = Math.max(0, Math.round((Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000));
        return {
          id: `opp-${lead.id}`,
          leadId: lead.id,
          name: `${lead.company} Opportunity`,
          company: lead.company,
          stage: lead.stage,
          value: lead.dealValue,
          weightedValue: lead.dealValue * (lead.stage === "Qualified" ? 0.42 : lead.stage === "Proposal Sent" ? 0.62 : lead.stage === "Negotiation" ? 0.78 : 0.18),
          owner: lead.assignedTo,
          ageDays,
          probability: lead.stage === "Qualified" ? 0.42 : lead.stage === "Proposal Sent" ? 0.62 : lead.stage === "Negotiation" ? 0.78 : 0.18,
          stale: ageDays >= 14 && !["Won", "Lost"].includes(lead.stage),
          highValue: lead.dealValue >= 5000,
          overdueFollowUp: false,
          createdAt: lead.createdAt,
          updatedAt: lead.lastContactAt,
        };
      });

  const campaignMap = new Map<string, { id: string; name: string; channel: RevenueLeadSource; platform: RevenuePlatform; funnel: string; offer: string }>();
  for (const lead of leads) {
    if (!campaignMap.has(lead.campaignId)) {
      campaignMap.set(lead.campaignId, {
        id: lead.campaignId,
        name: lead.campaignId,
        channel: lead.source,
        platform: lead.platform,
        funnel: lead.funnel,
        offer: lead.offer,
      });
    }
  }
  for (const sale of sales) {
    if (!campaignMap.has(sale.campaignId)) {
      const source = sale.source;
      campaignMap.set(sale.campaignId, {
        id: sale.campaignId,
        name: sale.campaignId,
        channel: source,
        platform: platformFromSource(source),
        funnel: source === "Instagram" ? "Instagram Lead Funnel" : "Revenue Funnel",
        offer: sale.offer,
      });
    }
  }

  const leadActivities = leads
    .slice()
    .sort((a, b) => +new Date(b.lastContactAt) - +new Date(a.lastContactAt))
    .slice(0, 18)
    .map((lead, index) => ({
      id: `live-activity-${lead.id}-${index}`,
      type: +new Date(lead.createdAt) === +new Date(lead.lastContactAt) ? "new-lead" : "status-change",
      title: +new Date(lead.createdAt) === +new Date(lead.lastContactAt) ? "New lead captured" : "Lead record updated",
      detail: `${lead.name} · ${lead.source} · ${lead.status}`,
      timestamp: lead.lastContactAt,
      tone: lead.status === "Won" ? "success" : lead.status === "Lost" || lead.status === "Stale" ? "warning" : "info",
      value: lead.assignedTo !== "Unassigned" ? lead.assignedTo : undefined,
    }));
  const saleActivities = sales
    .slice()
    .sort((a, b) => +new Date(b.closeDate) - +new Date(a.closeDate))
    .slice(0, 8)
    .map((sale, index) => ({
      id: `live-sale-${sale.id}-${index}`,
      type: "sale-closed" as const,
      title: "Revenue recorded",
      detail: `${sale.offer} closed via ${sale.source}.`,
      timestamp: sale.closeDate,
      tone: "success" as const,
      value: `$${Math.round(sale.netRevenue).toLocaleString("en-US")}`,
    }));
  const activities = [...leadActivities, ...saleActivities]
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
    .slice(0, 24);

  const warnings: string[] = [];
  if (!dealRead.available && !stripe.available) warnings.push("No live revenue source is connected yet, so revenue and deal metrics remain unavailable.");
  if (!trafficEvents.some((event) => event.type === "visit")) {
    warnings.push("First-party traffic tracking is live, but no landing visits have been recorded yet in the current event store.");
  }
  if (salesFromStripe.length && !salesFromDeals.length) {
    warnings.push("Revenue is currently coming from live Stripe payments. Source and campaign attribution will improve once HubSpot deals are populated.");
  }
  if (stripe.available && salesFromStripe.length) {
    warnings.push("Profit currently reflects Stripe net receipts because delivery cost and acquisition spend sources are not connected yet.");
  }
  warnings.push("Spend sources are not connected yet, so ROI, ROAS, CPL, and CAC stay unavailable until those integrations are live.");

  return {
    timestamp: isoNow(),
    capabilities: {
      contacts: true,
      deals: dealRead.available,
      revenue: dealRead.available || stripe.available,
      spend: false,
      traffic: true,
      followUps: false,
    },
    warnings,
    trafficEvents,
    bundle: {
      leads,
      opportunities,
      sales,
      campaigns: Array.from(campaignMap.values()),
      expenses: [],
      activities,
    },
  };
}

export async function createHttpTransport(): Promise<void> {
  const express = (await import("express")).default;
  const cors = (await import("cors")).default;

  const app: Express = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cors({ origin: "*" }));

  // 2FA — Google Authenticator TOTP (only active when TOTP_SECRET is set)
  if (process.env.TOTP_SECRET) {
    const { initTotpAuth } = await import("./totp-auth");
    initTotpAuth(app);
  }

  const getBaseUrl = (req: Request): string => {
    const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
    const cfVisitor = req.get("cf-visitor");
    const host = forwardedHost || req.get("host") || `localhost:${HTTP_PORT}`;
    let protocol = forwardedProto || req.protocol || "http";

    if (cfVisitor) {
      try {
        const parsed = JSON.parse(cfVisitor) as { scheme?: string };
        if (parsed.scheme) {
          protocol = parsed.scheme;
        }
      } catch {
        // Ignore malformed Cloudflare visitor metadata and fall back to forwarded headers.
      }
    }

    return `${protocol}://${host}`;
  };

  const LEAD_INTAKE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
  const LEAD_INTAKE_MAX_REQUESTS_PER_WINDOW = 8;
  const LEAD_INTAKE_MIN_FORM_FILL_MS = 3_000;
  const leadIntakeRequestLog = new Map<string, number[]>();

  const getClientIp = (req: Request): string => {
    const forwardedFor = req.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwardedFor || req.ip || "unknown";
  };

  const getTrafficIdentity = (req: Request): string => {
    const ip = getClientIp(req);
    return Buffer.from(ip).toString("base64").slice(0, 24);
  };

  const checkLeadIntakeGuard = (
    payload: Record<string, unknown>,
    req: Request,
    options: { recordAttempt?: boolean } = {}
  ) => {
    const { recordAttempt = true } = options;
    const ip = getClientIp(req);
    const now = Date.now();
    const recentRequests = (leadIntakeRequestLog.get(ip) || []).filter(
      (timestamp) => now - timestamp < LEAD_INTAKE_RATE_LIMIT_WINDOW_MS
    );

    if (recentRequests.length >= LEAD_INTAKE_MAX_REQUESTS_PER_WINDOW) {
      leadIntakeRequestLog.set(ip, recentRequests);
      return {
        statusCode: 429,
        body: {
          status: "error",
          message: "Too many intake attempts from this address. Please wait and try again.",
        },
      };
    }

    const honeypot = String(payload.website || payload.company_site || "").trim();
    if (honeypot) {
      if (recordAttempt) {
        recentRequests.push(now);
        leadIntakeRequestLog.set(ip, recentRequests);
      }
      logger.warn("ig_to_crm_honeypot_triggered", { ip });
      return {
        statusCode: 400,
        body: {
          status: "error",
          message: "Submission blocked.",
        },
      };
    }

    const formStartedAtRaw = String(payload.form_started_at || "").trim();
    const formStartedAtMs = Date.parse(formStartedAtRaw);
    if (!formStartedAtRaw || Number.isNaN(formStartedAtMs)) {
      if (recordAttempt) {
        recentRequests.push(now);
        leadIntakeRequestLog.set(ip, recentRequests);
      }
      return {
        statusCode: 400,
        body: {
          status: "error",
          message: "Form session missing. Reload the page and try again.",
        },
      };
    }

    if (now - formStartedAtMs < LEAD_INTAKE_MIN_FORM_FILL_MS) {
      if (recordAttempt) {
        recentRequests.push(now);
        leadIntakeRequestLog.set(ip, recentRequests);
      }
      logger.warn("ig_to_crm_form_fill_too_fast", { ip, elapsedMs: now - formStartedAtMs });
      return {
        statusCode: 400,
        body: {
          status: "error",
          message: "Submission was too fast to verify. Please try again.",
        },
      };
    }

    if (recordAttempt) {
      recentRequests.push(now);
      leadIntakeRequestLog.set(ip, recentRequests);
    }
    return null;
  };

  const serveCommandCenter = (req: Request, res: Response) => {
    if (fs.existsSync(CONTROL_UI_INDEX)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Clear-Site-Data", '"cache"');
      res.sendFile(CONTROL_UI_INDEX);
      return;
    }

    const baseUrl = getBaseUrl(req);
    res.type("html").send(renderCommandCenterHtml(baseUrl));
  };

  if (fs.existsSync(CONTROL_UI_INDEX)) {
    app.use(
      express.static(CONTROL_UI_ROOT, {
        etag: false,
        lastModified: false,
        setHeaders: (res) => {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        },
      })
    );
  }

  app.get(
    /^(?:\/|\/overview|\/leads-revenue|\/agents|\/content|\/approvals|\/voice|\/messages|\/models|\/openclaw|\/mcp|\/mcp-tools|\/tool-store|\/protocols|\/projects|\/memories|\/docs|\/team|\/office|\/notes|\/calendar|\/tasks|\/logs|\/integrations|\/settings)(?:\/.*)?$/,
    serveCommandCenter
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      tool_groups: getStartupSummary(),
    });
  });

  app.get("/api/tools", (_req: Request, res: Response) => {
    const tools = getAllTools();
    res.json({
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        schema: (tool.inputSchema as any).toJSON?.() || {},
      })),
    });
  });

  app.get("/api/command-center", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json(buildCommandCenterPayload(baseUrl));
  });

  app.get("/api/agents/live", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({ agents: buildAgentData(), timestamp: new Date().toISOString() });
  });

  app.get("/api/revenue/live", async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    try {
      const payload = await buildLiveRevenuePayload();
      res.json(payload);
    } catch (error: any) {
      logger.error("revenue_live_payload_error", { error: error?.message || String(error) });
      res.status(500).json({
        error: error?.message || "Unable to build live revenue payload.",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Project registry ────────────────────────────────────────────────────
  // data/ is mounted as /app/data in Docker and lives at <project>/data/ locally
  const PROJECT_REGISTRY_PATH = path.resolve(__dirname, "../../data/project-registry.json");

  app.get("/api/projects/registry", (_req: Request, res: Response) => {
    try {
      const raw = fs.readFileSync(PROJECT_REGISTRY_PATH, "utf8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.json(JSON.parse(raw.replace(/^\uFEFF/, "")));
    } catch {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.json({ projects: [] });
    }
  });

  app.patch("/api/projects/registry/:projectId/items/:itemId", (req: Request, res: Response) => {
    try {
      const { projectId, itemId } = req.params;
      const { done } = req.body;
      const raw = fs.readFileSync(PROJECT_REGISTRY_PATH, "utf8");
      const registry = JSON.parse(raw.replace(/^\uFEFF/, ""));
      const project = registry.projects.find((p: any) => p.id === projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const item = project.checklist.find((c: any) => c.id === itemId);
      if (!item) return res.status(404).json({ error: "Item not found" });
      item.done = !!done;
      fs.writeFileSync(PROJECT_REGISTRY_PATH, JSON.stringify(registry, null, 2));
      res.json({ ok: true, item });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  // ── OpenRouter model catalog ─────────────────────────────────────────────
  let orModelsCache: { data: any[]; fetchedAt: number } | null = null;

  app.get("/api/models/openrouter", async (_req: Request, res: Response) => {
    // Cache for 10 minutes
    if (orModelsCache && Date.now() - orModelsCache.fetchedAt < 10 * 60 * 1000) {
      return res.json({ models: orModelsCache.data, cached: true });
    }
    try {
      const apiKey = process.env.ABDI_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "";
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
      const json = await response.json() as any;
      const models = (json.data || []).map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description || "",
        context_length: m.context_length || 0,
        pricing: {
          // OpenRouter gives USD per token — multiply by 1M to get $/M
          prompt: parseFloat(m.pricing?.prompt || "0") * 1_000_000,
          completion: parseFloat(m.pricing?.completion || "0") * 1_000_000,
        },
        architecture: m.architecture || {},
        top_provider: m.top_provider || {},
        supported_parameters: m.supported_parameters || [],
      }));
      orModelsCache = { data: models, fetchedAt: Date.now() };
      return res.json({ models, cached: false });
    } catch (err: any) {
      logger.warn("openrouter_models_fetch_failed", { error: err?.message });
      // Return cached data if available even if stale
      if (orModelsCache) return res.json({ models: orModelsCache.data, cached: true, stale: true });
      return res.status(500).json({ error: err?.message, models: [] });
    }
  });

  // In-memory ring buffer — persists tick events within this process lifetime
  const TICK_RING: any[] = [];
  const MAX_TICK_RING = 60;

  app.get("/api/mission-control/events", (_req: Request, res: Response) => {
    const stored = MissionControlStateService.getEvents();
    // Merge stored + in-memory ticks, dedupe by id, sort newest first, cap at 80
    const merged = [...TICK_RING, ...stored]
      .filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 80);
    res.json({ events: merged });
  });

  app.get("/api/mission-control/events/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const writeEvent = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    writeEvent({ type: "connected", timestamp: new Date().toISOString() });

    // Pipe real monitor events (Sygma-led agent status pings) into this SSE client
    const offMonitor = MonitorService.onEvent((event) => {
      writeEvent(event);
      TICK_RING.unshift(event);
      if (TICK_RING.length > MAX_TICK_RING) TICK_RING.length = MAX_TICK_RING;
    });

    const off = MissionControlStateService.onEvent((event) => writeEvent(event));
    const heartbeat = setInterval(() => {
      res.write(`event: ping\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      offMonitor();
      off();
      res.end();
    });
  });

  // Agent-initiated call — any agent or trigger can POST here to ring the user
  app.post("/api/agent-call/initiate", (req: Request, res: Response) => {
    const { agentId, agentName, message, withAgents, urgent } = req.body || {};
    if (!agentId) { res.status(400).json({ error: "agentId required" }); return; }
    const teammates = Array.isArray(withAgents)
      ? withAgents
          .map((value) => String(value || "").toLowerCase().replace(/[^a-z]/g, ""))
          .filter(Boolean)
          .filter((value, index, arr) => arr.indexOf(value) === index && value !== String(agentId).toLowerCase().replace(/[^a-z]/g, ""))
      : [];
    MissionControlStateService.broadcastRealtime({
      type: "agent_incoming_call",
      agentId,
      agentName: agentName || agentId,
      message: message || `${agentName || agentId} is calling you`,
      withAgents: teammates,
      urgent: Boolean(urgent),
      ts: new Date().toISOString(),
    });
    res.json({ ok: true });
  });

  app.post("/api/mission-control/actions", async (req: Request, res: Response) => {
    const action = typeof req.body?.action === "string" ? req.body.action : "";
    const payload = req.body?.payload || {};
    if (!action) {
      return res.status(400).json({ success: false, error: "Missing action." });
    }

    try {
      const baseUrl = getBaseUrl(req);
      const result = await MissionControlStateService.dispatch(action, payload);
      return res.json({
        success: true,
        event: result.event,
        result: result.result || null,
        payload: buildCommandCenterPayload(baseUrl),
      });
    } catch (err: any) {
      logger.error("mission_control_action_failed", {
        action,
        error: err?.message || String(err),
      });
      return res.status(500).json({
        success: false,
        error: err?.message || "Mission Control action failed.",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/api/voice-center", (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json(buildVoiceCenterPayload(baseUrl));
  });

  /* ── TTS: ElevenLabs → Polly (ttsmp3) → Google TTS → OpenAI → 503 ── */

  // ElevenLabs voice IDs — accented human neural voices per agent, all non-American
  const ELEVENLABS_VOICE_IDS: Record<string, string> = {
    abdi:  "uLfPT2jUO3X81OwnftBP",  // Keith Muoki — East African/Kenyan coastal English (closest to Somali), serious & authoritative
    ahmed: "DvGqn8Zp8GnW2xWcyhzt",  // Raunak M — Indian, Polite & Professional
    dame:  "MdeqL1TMyZWz86QOELK8",  // Arthur — British, Distinguished & Steady
    rex:   "M4FiuEOcSLrYgftiXoq9",  // Blake — Australian, Brand & Promo
    prime: "SOYHLrjzK2X1ezoPC6cr",  // Harry — British (UK), young & energetic
    atlas: "BOt7zZh6gzfWlIUYnyPz",  // Caleb O'Farrell — Irish, Warm & Clear
    ayub:  "N09NFwYJJG9VSSgdLQbT",  // Ishan — Indian, Bold & Upbeat (distinct from Ahmed)
    sygma: "tyepWYJJwJM9TTFIg5U7",  // Clara — Australian female, Warmth & Trust
  };

  // Per-agent ElevenLabs voice settings (overrides defaults where specified)
  const ELEVENLABS_VOICE_SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }> = {
    prime: { stability: 0.32, similarity_boost: 0.88, style: 0.48, use_speaker_boost: true }, // young UK — less stable = more natural variance, higher style = expressive
    ayub:  { stability: 0.34, similarity_boost: 0.9, style: 0.52, use_speaker_boost: true },  // younger Indian male cadence, more energy
  };
  const DEFAULT_EL_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true };

  // Polly fallback voices (ttsmp3.com)
  const POLLY_VOICES: Record<string, string> = {
    abdi:  "Joey", ahmed: "Geraint", dame: "Brian",  rex:  "Matthew",
    prime: "Arthur", ayub: "",       atlas: "Brian", sygma: "Nicole",
  };

  // OpenAI TTS voices — last resort fallback
  const OPENAI_VOICE_IDS: Record<string, string> = {
    abdi:  "onyx",
    ahmed: "fable",
    dame:  "echo",
    rex:   "ash",
    prime: "alloy",
    ayub:  "onyx",
    atlas: "sage",
    sygma: "nova",
  };
  const OPENAI_TTS_SPEEDS: Record<string, number> = {
    abdi: 0.94,
    ahmed: 0.96,
    dame: 0.97,
    rex: 0.93,
    prime: 0.95,
    ayub: 1.02,
    atlas: 0.98,
    sygma: 0.94,
  };

  const setVoiceDebugHeaders = (res: Response, provider: string, agentName: string, voiceId: string) => {
    res.setHeader("X-Agent-Voice-Provider", provider);
    res.setHeader("X-Agent-Voice-Agent", agentName);
    res.setHeader("X-Agent-Voice-Id", voiceId);
  };

  app.post("/api/voice/tts", async (req: Request, res: Response) => {
    const { agentId, text } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const { Readable } = await import("stream");
    const agentName = (agentId || "").toLowerCase().replace(/[^a-z]/g, "");
    const truncated = String(text).slice(0, 500);

    const relayUrl = process.env.DESKTOP_RELAY_URL;
    const elKey = process.env.ELEVENLABS_API_KEY;

    // 1. ElevenLabs via relay — best quality, accented neural voices
    if (relayUrl && elKey && ELEVENLABS_VOICE_IDS[agentName]) {
      try {
        const relayCtrl = new AbortController();
        const relayTimeout = setTimeout(() => relayCtrl.abort(), 1500);
        let upstream: Awaited<ReturnType<typeof fetch>>;
        try {
          upstream = await fetch(`${relayUrl}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              voiceId: ELEVENLABS_VOICE_IDS[agentName],
              text: truncated,
              apiKey: elKey,
            }),
            signal: relayCtrl.signal,
          });
        } finally { clearTimeout(relayTimeout); }
        if (upstream.ok) {
          setVoiceDebugHeaders(res, "elevenlabs-relay", agentName, ELEVENLABS_VOICE_IDS[agentName]);
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("elevenlabs_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("elevenlabs_tts_error", { error: err?.message });
      }
    }

    // 2. ElevenLabs direct streaming — starts piping audio as soon as generation begins
    if (elKey && ELEVENLABS_VOICE_IDS[agentName]) {
      try {
        const voiceId = ELEVENLABS_VOICE_IDS[agentName];
        const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
          method: "POST",
          headers: {
            "xi-api-key": elKey,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
          },
          body: JSON.stringify({
            text: truncated,
            model_id: "eleven_turbo_v2_5",
            voice_settings: ELEVENLABS_VOICE_SETTINGS[agentName] ?? DEFAULT_EL_SETTINGS,
          }),
        });
        if (upstream.ok) {
          setVoiceDebugHeaders(res, "elevenlabs-direct", agentName, voiceId);
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("elevenlabs_direct_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("elevenlabs_direct_error", { error: err?.message });
      }
    }

    // 3. ttsmp3.com Amazon Polly neural voices via relay — free fallback
    if (relayUrl && POLLY_VOICES[agentName]) {
      try {
        const pollyCtrl = new AbortController();
        const pollyTimeout = setTimeout(() => pollyCtrl.abort(), 1500);
        let upstream: Awaited<ReturnType<typeof fetch>>;
        try {
          upstream = await fetch(`${relayUrl}/tts-polly`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: truncated, voice: POLLY_VOICES[agentName] }),
            signal: pollyCtrl.signal,
          });
        } finally { clearTimeout(pollyTimeout); }
        if (upstream.ok) {
          setVoiceDebugHeaders(res, "polly-relay", agentName, POLLY_VOICES[agentName]);
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("polly_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("polly_tts_error", { error: err?.message });
      }
    }

    // 3. Google TTS via relay — last free fallback
    if (relayUrl) {
      try {
        const googleCtrl = new AbortController();
        const googleTimeout = setTimeout(() => googleCtrl.abort(), 1500);
        let upstream: Awaited<ReturnType<typeof fetch>>;
        try {
          upstream = await fetch(`${relayUrl}/tts-google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: truncated, agentId: agentName }),
            signal: googleCtrl.signal,
          });
        } finally { clearTimeout(googleTimeout); }
        if (upstream.ok) {
          setVoiceDebugHeaders(res, "google-relay", agentName, agentName);
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("google_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("google_tts_error", { error: err?.message });
      }
    }

    // 3. OpenAI TTS (if key set)
    const oaiKey = process.env.OPENAI_API_KEY;
    if (oaiKey) {
      try {
        const voice = OPENAI_VOICE_IDS[agentName] || "onyx";
        const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${oaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "tts-1", input: truncated, voice, speed: OPENAI_TTS_SPEEDS[agentName] || 0.98 }),
        });
        if (upstream.ok) {
          setVoiceDebugHeaders(res, "openai-tts", agentName, voice);
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          Readable.fromWeb(upstream.body as any).pipe(res);
          return;
        }
        logger.warn("openai_tts_failed", { status: upstream.status });
      } catch (err: any) {
        logger.warn("openai_tts_error", { error: err?.message });
      }
    }

    // 4. No TTS provider available — browser falls back to SpeechSynthesis
    return res.status(503).json({ error: "No TTS provider available" });
  });

  // ── Screen snapshot — captures current Windows screen via desktop relay ──────
  app.get("/api/screen/snapshot", async (_req: Request, res: Response) => {
    const tool = getTool("desktop_get_screen_base64");
    if (!tool) return res.status(501).json({ error: "desktop_get_screen_base64 tool not available" });
    try {
      const result = await tool.handler(
        { scale: 1280, quality: 70 },
        { requestId: `snapshot_${Date.now()}` }
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Screen capture failed" });
    }
  });

  /* ── Voice Chat: agent reply + optional TTS ── */
  // Strip JSON blobs, tool-call syntax, and code blocks from voice replies.
  // Agents sometimes leak these despite instructions; this is the safety net.
  function stripVoiceNoise(text: string): string {
    const cleaned = text
      // Remove fenced code blocks (```...```)
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code (`...`)
      .replace(/`[^`]+`/g, "")
      // Remove JSON objects { ... } spanning multiple tokens (greedy, handles nested)
      .replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, "")
      // Remove JSON arrays [ ... ]
      .replace(/\[[^\[\]]*\]/g, "")
      // Normalize tool/function calls to spoken English placeholders
      .replace(/(?:^|\s)([a-z][a-z0-9_]{2,})\s*\([^)]*\)/gi, " that command ")
      .replace(/\b(call_user|desktop_[a-z0-9_]+|browser_[a-z0-9_]+|shell_command|apply_patch|send_input|spawn_agent|get_recent_logs)\b/gi, "that command")
      .replace(/^.*"name"\s*:.*$/gm, "that command")
      .replace(/^.*"arguments"\s*:.*$/gm, "")
      .replace(/^.*desktop\w+\s*\(.*$/gm, "that command")
      .replace(/^\s*that command\s*$/gim, "I ran that command.")
      .replace(/[^\x00-\x7F]+/g, " ")
      // Collapse multiple blank lines / leading-trailing whitespace
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned || "I need to restate that in plain English.";
  }

  // Shared screen description cache — refreshed on every message, shared across all agents/tabs.
  // TTL kept short so context stays fresh without hammering the relay.
  let screenDescCache: { desc: string; ts: number } | null = null;
  const SCREEN_DESC_TTL_MS = 8_000;

  app.post("/api/voice/chat", async (req: Request, res: Response) => {
    const { agentId, message, callAgentCount } = req.body || {};
    if (!agentId || !message) return res.status(400).json({ error: "Missing agentId or message" });

    try {
      let augmentedMessage = message;

      // Always inject screen context — works from any tab (voice or messages).
      // Uses cached value if fresh; otherwise races a relay fetch against 2s timeout.
      const now = Date.now();
      let screenDesc: string | null = null;
      if (screenDescCache && (now - screenDescCache.ts) < SCREEN_DESC_TTL_MS) {
        screenDesc = screenDescCache.desc;
      } else {
        try {
          const fresh = await Promise.race<string | null>([
            describeScreenForPrime(""),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 2_000)),
          ]);
          if (fresh) {
            screenDescCache = { desc: fresh, ts: now };
            screenDesc = fresh;
          } else {
            screenDesc = screenDescCache?.desc ?? null;
          }
        } catch {
          screenDesc = screenDescCache?.desc ?? null;
        }
      }
      if (screenDesc) {
        // All agents see screen context; Dame + Rex get desktop control reminder
        const canControl = ["dame", "rex"].includes(agentId.toLowerCase());
        const screenNote = canControl
          ? `[Screen context: ${screenDesc}]\n[You can control the desktop using desktop tools: desktop_click_mouse, desktop_type_text, desktop_send_keys, desktop_scroll_mouse.]`
          : `[Screen context: ${screenDesc}]`;
        augmentedMessage = `${message}\n\n${screenNote}`;
        logger.info("voice_chat_screen_described", { agentId, chars: screenDesc.length });
      }

      // Voice mode: compact, spoken-word only — no JSON, no tool syntax, no markdown.
      const conferenceRule = (callAgentCount && callAgentCount > 1)
        ? `\n5) CONFERENCE CALL — multiple agents are present. STRICT RULE: only ONE agent speaks at a time, left to right by turn order. Only respond if you genuinely have something NEW and useful to add. If another agent already covered it, or you have nothing meaningful, reply with exactly the word [SILENT] and nothing else.`
        : "";
      const voiceInstruction = `[VOICE MODE — You are speaking out loud to TASK. Strict rules:\n1) English only. Never speak any other language.\n2) Max 3 sentences. Plain English only — no markdown, no asterisks, no headers.\n3) NEVER output JSON, code blocks, tool call syntax, command names, or function names. If you refer to a tool or command, say \"that command\" or \"that tool\" instead.\n4) If a tool runs, describe the result in plain English after it completes.\n5) HONESTY RULE: Only say a task is done if a tool actually ran and returned a success result. If a tool failed, say it failed. If you cannot do something, say so clearly — NEVER fake completion.\n6) Lead with the result. No preamble, no sign-off.\n7) DO NOT echo or repeat back what TASK just said. Respond to the substance directly — never restate the question or summarize what TASK told you.\n8) TONE: Professional and respectful. This is a working relationship, not a friendship. Do not use casual slang. Do not call TASK \"sir\" in every reply — it becomes noise. Be direct and composed.\n9) DO NOT apologize repeatedly. If something went wrong, say it once and move to the fix.${conferenceRule}\nDo NOT break these rules.]\n\n`;
      augmentedMessage = voiceInstruction + augmentedMessage;

      const result = await AgentService.ask(agentId, augmentedMessage);

      // Safety net: strip any JSON blobs or tool-call syntax the agent leaked into its reply.
      const clean = stripVoiceNoise(result.message || "");
      return res.json({ reply: clean });
    } catch (err: any) {
      logger.error("voice_chat_failed", { agentId, error: err?.message || String(err) });
      return res.status(500).json({ error: err?.message || "Agent chat failed" });
    }
  });

  // Speech-to-text via OpenAI Whisper — accepts raw audio body (audio/webm, audio/wav, etc.)
  app.post("/api/voice/stt", express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }), async (req: Request, res: Response) => {
    const openaiKey = process.env.DAME_OPENAI_API_KEY;
    if (!openaiKey) return res.status(503).json({ error: "OpenAI API key not configured" });
    const buf = req.body as Buffer;
    if (!buf?.length) return res.status(400).json({ error: "No audio data" });
    try {
      const mimeType = String(req.headers["content-type"] || "audio/webm").split(";")[0].trim() || "audio/webm";
      const ext =
        mimeType.includes("wav") ? "wav" :
        mimeType.includes("mp4") ? "m4a" :
        mimeType.includes("mpeg") ? "mp3" :
        mimeType.includes("ogg") ? "ogg" :
        mimeType.includes("webm") ? "webm" :
        "webm";
      const form = new FormData();
      form.append("file", new Blob([buf], { type: mimeType }), `audio.${ext}`);
      form.append("model", "whisper-1");
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      });
      if (!r.ok) {
        const err = await r.text();
        logger.warn("whisper_stt_failed", { status: r.status, err: err.slice(0, 200) });
        return res.status(502).json({ error: "Whisper API failed", detail: err.slice(0, 200) });
      }
      const data = await r.json() as { text?: string };
      return res.json({ text: data.text || "" });
    } catch (err: any) {
      logger.error("whisper_stt_error", { error: err?.message });
      return res.status(500).json({ error: err?.message || "STT failed" });
    }
  });

  // Trigger an immediate status ping round for all agents
  app.post("/api/monitor/ping", (_req: Request, res: Response) => {
    MonitorService.pingNow().catch(() => {});
    return res.json({ ok: true, message: "Status ping round started for all agents. Updates arrive every ~8s per agent." });
  });

  // Manually dispatch a task to a specific agent with full desktop tool access + live SSE updates
  app.post("/api/agent/dispatch", async (req: Request, res: Response) => {
    const { agent, task } = req.body || {};
    if (!agent || !task) return res.status(400).json({ error: "Missing agent or task" });
    // Fire-and-forget — SSE events stream live to command center while it runs
    AgentRunner.dispatch(agent, task).catch((err: any) =>
      logger.error("agent_dispatch_failed", { agent, error: err?.message })
    );
    return res.json({ queued: true, agent, task });
  });

  app.post("/api/tools/:toolName", async (req: Request, res: Response) => {
    const toolName = Array.isArray(req.params.toolName) ? req.params.toolName[0] : req.params.toolName;
    const { arguments: args } = req.body;
    const tool = getTool(toolName);

    if (!tool) {
      return res.status(404).json({ error: `Tool not found: ${toolName}` });
    }

    try {
      const validated = tool.inputSchema.parse(args || {});
      const result = await tool.handler(validated, {
        requestId: `http_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      return res.json({ success: true, result, timestamp: new Date().toISOString() });
    } catch (err: any) {
      const toolError = toToolError(err);
      logger.error("http_tool_call_failed", {
        tool: toolName,
        error: toolError.message,
        code: toolError.code,
      });
      return res.status(toolError.statusCode || 400).json({
        success: false,
        error: toolError.message || String(err),
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Landing page ──────────────────────────────────────────────────────────
  const LANDING_PAGE_PATH = path.resolve(__dirname, "../../data/ig-to-crm/landing/index.html");
    const GUIDE_HTML_PATH = path.resolve(__dirname, "../../data/ig-to-crm/guide/ig-to-crm-guide.html");
    const GUIDE_PDF_PATH = path.resolve(__dirname, "../../data/ig-to-crm/guide/ig-to-crm-guide.pdf");
    const LAUNCH_POST_IMAGE_PATH = path.resolve(__dirname, "../../data/ig-to-crm/assets/launch-post.png");
    const LAUNCH_POST_IMAGE_JPG_PATH = path.resolve(__dirname, "../../data/ig-to-crm/assets/launch-post.jpg");
    const LAUNCH_POST_REEL_PATH = path.resolve(__dirname, "../../data/ig-to-crm/assets/launch-post-reel.mp4");
  const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
  const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Task Enterprise <sales@taskenterprise.tech>";

  const serveLandingPage = (req: Request, res: Response) => {
    if (fs.existsSync(LANDING_PAGE_PATH)) {
      recordRevenueTrafficEvent({
        type: "visit",
        timestamp: new Date().toISOString(),
        path: req.path,
        ipHash: getTrafficIdentity(req),
      });
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(LANDING_PAGE_PATH);
    } else {
      res.status(404).send("Landing page not found.");
    }
  };

    app.get("/landing", serveLandingPage);
    app.get("/ig-to-crm", serveLandingPage);

    app.get("/robots.txt", (_req: Request, res: Response) => {
      res.setHeader("Cache-Control", "no-store");
      res.type("text/plain");
      res.send("User-agent: *\nAllow: /\n");
    });

    app.get("/assets/ig-to-crm/guide", (_req: Request, res: Response) => {
      if (fs.existsSync(GUIDE_HTML_PATH)) {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(GUIDE_HTML_PATH);
    } else {
      res.status(404).send("Guide source not found.");
    }
  });

  app.get("/assets/ig-to-crm/guide.pdf", (_req: Request, res: Response) => {
    if (fs.existsSync(GUIDE_PDF_PATH)) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", 'inline; filename="ig-to-crm-guide.pdf"');
      res.sendFile(GUIDE_PDF_PATH);
    } else {
      res.status(404).send("Guide PDF not found.");
    }
  });

  app.get("/assets/ig-to-crm/launch-post.png", (_req: Request, res: Response) => {
    if (fs.existsSync(LAUNCH_POST_IMAGE_PATH)) {
      res.setHeader("Cache-Control", "no-store");
      res.type("png");
      res.sendFile(LAUNCH_POST_IMAGE_PATH);
    } else {
      res.status(404).send("Launch post image not found.");
    }
  });

    app.get("/assets/ig-to-crm/launch-post.jpg", (_req: Request, res: Response) => {
      if (fs.existsSync(LAUNCH_POST_IMAGE_JPG_PATH)) {
        res.setHeader("Cache-Control", "no-store");
        res.type("jpeg");
        res.sendFile(LAUNCH_POST_IMAGE_JPG_PATH);
      } else {
        res.status(404).send("Launch post image not found.");
      }
    });

    app.get("/assets/ig-to-crm/launch-post-reel.mp4", (_req: Request, res: Response) => {
      if (fs.existsSync(LAUNCH_POST_REEL_PATH)) {
        res.setHeader("Cache-Control", "no-store");
        res.type("mp4");
        res.sendFile(LAUNCH_POST_REEL_PATH);
      } else {
        res.status(404).send("Launch post reel not found.");
      }
    });

  const sendGuideEmailWithResend = async (recipient: string, firstName: string, guideUrl: string) => {
    if (!RESEND_API_KEY) {
      return { sent: false, provider: "resend", reason: "missing_api_key" };
    }

    const subject = "Your IG-to-CRM guide is ready";
    const safeName = firstName || "there";
    const html = [
      `<p>${safeName},</p>`,
      "<p>Your IG-to-CRM guide is ready.</p>",
      `<p><a href="${guideUrl}">Open the guide</a></p>`,
      "<p>This is the current direct-delivery version while the full automation handoff is being finalized.</p>",
      "<p>Task Enterprise LLC</p>",
    ].join("");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [recipient],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!response.ok) {
      throw new Error(`Resend ${response.status}: ${json?.message || text}`);
    }

    return {
      sent: true,
      provider: "resend",
      emailId: json?.id || null,
    };
  };

  const processIgToCrmFallback = async (payload: Record<string, unknown>, req: Request) => {
    const guardFailure = checkLeadIntakeGuard(payload, req, { recordAttempt: true });
    if (guardFailure) {
      return guardFailure;
    }

    const firstName = String(payload.first_name || "").trim();
    const email = String(payload.email || payload.work_email || "").trim().toLowerCase();
    const company = String(payload.company_name || payload.company || "").trim();
    const role = String(payload.role || "").trim().toLowerCase();
    const primaryNeed = String(payload.primary_need || "").trim();
    const phone = String(payload.phone || "").trim();
    const instagramHandle = String(payload.instagram_handle || "").trim();
    const rawMonthlyRevenueRange = String(payload.monthly_revenue_range || "").trim();
    const source = String(payload.source || "instagram").trim().toLowerCase();
    const campaign = String(payload.campaign || "ig_to_crm_pdf_funnel").trim();
    const asset = String(payload.asset || "ig_to_crm_guide").trim();
    const submittedAt = String(payload.capture_timestamp || new Date().toISOString());
    const emailDomain = email.includes("@") ? email.split("@")[1] : "";
    const isPersonalEmail = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(emailDomain);
    const decisionRoles = new Set(["founder", "owner", "operator", "agency_owner", "consultant"]);
    const higherRevenue = new Set(["25k_50k", "50k_100k", "100k_250k", "250k_plus"]);
    const needText = primaryNeed.toLowerCase();

    const monthlyRevenueMap: Record<string, string> = {
      under_10k: "5k_to_10k",
      "10k_25k": "10k_to_25k",
      "25k_50k": "25k_to_50k",
      "50k_100k": "50k_plus",
      "100k_250k": "50k_plus",
      "250k_plus": "50k_plus",
    };
    const monthlyRevenueRange = monthlyRevenueMap[rawMonthlyRevenueRange] || (rawMonthlyRevenueRange ? "unknown" : "");
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!firstName || !email || !company) {
      return {
        statusCode: 400,
        body: {
          status: "error",
          message: "Missing required fields: first_name, email, company_name",
        },
      };
    }

    if (!emailIsValid) {
      return {
        statusCode: 400,
        body: {
          status: "error",
          message: "Please enter a valid email address.",
        },
      };
    }

    let leadScore = 0;
    if (source === "instagram") leadScore += 2;
    if (instagramHandle) leadScore += 1;
    if (company) leadScore += 2;
    if (decisionRoles.has(role)) leadScore += 3;
    if (monthlyRevenueRange) leadScore += 3;
    if (higherRevenue.has(monthlyRevenueRange)) leadScore += 2;
    if (phone) leadScore += 2;
    if (emailDomain && !isPersonalEmail) leadScore += 2;
    if (["automation", "crm", "lead", "follow", "funnel", "system", "pdf_delivery", "crm_sync", "lead_capture", "full_funnel"].some((term) => needText.includes(term))) {
      leadScore += 2;
    }
    if (!company && !role) leadScore -= 2;

    const intentBand = leadScore >= 14 ? "high_intent" : leadScore >= 9 ? "qualified" : leadScore >= 4 ? "nurture" : "unqualified";
    const followUpOwner = intentBand === "high_intent" ? "Abdi" : intentBand === "qualified" ? "Ayub" : "Sygma";
    const lifecycleStage = intentBand === "high_intent" ? "opportunity" : "lead";
    const leadId = `${email}-${submittedAt}`.replace(/[^a-z0-9@._-]+/gi, "-").toLowerCase();
    const tool = getTool("hubspot_upsert_contact");
    const guideUrl = `${getBaseUrl(req)}/assets/ig-to-crm/guide.pdf`;

    if (!tool) {
      throw new Error("HubSpot upsert tool unavailable");
    }

    const argumentsPayload = {
      email,
      firstName,
      company,
      phone,
      role,
      primaryNeed,
      instagramHandle,
      monthlyRevenueRange,
      source,
      campaign,
      submittedAt,
      leadId,
      leadScore,
      intentBand,
      pdfRequested: true,
      followUpOwner,
      lastFunnelStep: "form_submitted",
      requestedAsset: asset,
      lifecycleStage,
      agentName: "Ayub",
    };

    const validated = tool.inputSchema.parse(argumentsPayload);
    const result = await tool.handler(validated, {
      requestId: `ig_to_crm_fallback_${Date.now()}`,
    });

    let emailStatus = "provider_pending";
    let emailProvider = "resend";
    let emailId: string | null = null;
    try {
      const sendResult = await sendGuideEmailWithResend(email, firstName, guideUrl);
      emailStatus = sendResult.sent ? "sent" : "provider_pending";
      emailProvider = sendResult.provider;
      emailId = sendResult.emailId || null;
    } catch (emailErr: any) {
      logger.warn("ig_to_crm_resend_failed", { email, error: emailErr?.message });
      emailStatus = "failed";
    }

    recordRevenueTrafficEvent({
      type: "submission",
      timestamp: new Date().toISOString(),
      path: req.path,
      ipHash: getTrafficIdentity(req),
    });

    return {
      statusCode: 200,
      body: {
        status: "ok",
        message: "Lead captured and guide ready.",
        hubspot_id: (result as any)?.id || null,
        hubspot_action: (result as any)?.action || null,
        lead_score: leadScore,
        intent_band: intentBand,
        follow_up_owner: followUpOwner,
        guide_url: guideUrl,
        delivery_method: "direct_download",
        email_status: emailStatus,
        email_provider: emailProvider,
        email_id: emailId,
        processor: "mcp_fallback",
      },
    };
  };

  // ── Webhook proxy → n8n lead intake ───────────────────────────────────────
  // The landing page POSTs here; we forward to n8n running on localhost:5678
  app.post("/webhook/task-enterprise/lead-intake", async (req: Request, res: Response) => {
    const N8N_WEBHOOK = "http://host.docker.internal:5678/webhook/task-enterprise/lead-intake";
    const payload = (req.body || {}) as Record<string, unknown>;
    const guardFailure = checkLeadIntakeGuard(payload, req, { recordAttempt: false });
    if (guardFailure) {
      return res.status(guardFailure.statusCode).json(guardFailure.body);
    }

    try {
      const upstream = await fetch(N8N_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, intake_source: "landing_page" }),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await upstream.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (upstream.status === 404) {
        logger.warn("ig_to_crm_n8n_webhook_missing_falling_back", { status: upstream.status });
        const fallback = await processIgToCrmFallback(payload, req);
        return res.status(fallback.statusCode).json(fallback.body);
      }
        if (upstream.ok && json && typeof json === "object" && !json.guide_url) {
          json.guide_url = `${getBaseUrl(req)}/assets/ig-to-crm/guide.pdf`;
        }
      if (upstream.ok) {
        recordRevenueTrafficEvent({
          type: "submission",
          timestamp: new Date().toISOString(),
          path: req.path,
          ipHash: getTrafficIdentity(req),
        });
      }
      res.status(upstream.status).json(json);
    } catch (err: any) {
      logger.error("webhook_proxy_error", { error: err?.message });
      try {
        const fallback = await processIgToCrmFallback(payload, req);
        return res.status(fallback.statusCode).json(fallback.body);
      } catch (fallbackErr: any) {
        return res.status(502).json({ error: "Webhook forwarding failed.", detail: err?.message, fallbackError: fallbackErr?.message });
      }
    }
  });

  // ── Conversations sync API ─────────────────────────────────────────────
  // Stores the full conversations array as a single JSON file on disk so
  // both localhost and cc.taskenterprise.tech share the same history.
  const CONV_FILE = path.join(path.resolve(__dirname, "../../data"), "conversations.json");

  app.get("/api/conversations", (_req: Request, res: Response) => {
    try {
      if (!fs.existsSync(CONV_FILE)) return res.json({ conversations: [], updatedAt: null });
      const raw = fs.readFileSync(CONV_FILE, "utf8");
      const data = JSON.parse(raw);
      res.json(data);
    } catch {
      res.json({ conversations: [], updatedAt: null });
    }
  });

  // ── Google Drive browser routes ──────────────────────────────────────────
  app.get("/api/drive/files", async (req: Request, res: Response) => {
    try {
      const parent = (req.query.parent as string) || "root";
      const q = (req.query.q as string) || "";
      const files = await GoogleDriveIntegration.browse(parent, q);
      res.json({ files });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/drive/docs/:id", async (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const content = await GoogleDocsIntegration.getContent(id);
      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/drive/docs/:id", async (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { text } = req.body as { text: string };
      await GoogleDocsIntegration.replaceContent(id, text);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/conversations", (req: Request, res: Response) => {
    try {
      const { conversations } = req.body || {};
      if (!Array.isArray(conversations)) {
        res.status(400).json({ error: "conversations must be an array" });
        return;
      }
      const payload = { conversations, updatedAt: new Date().toISOString() };
      fs.mkdirSync(path.dirname(CONV_FILE), { recursive: true });
      fs.writeFileSync(CONV_FILE, JSON.stringify(payload, null, 2), "utf8");
      res.json({ ok: true, updatedAt: payload.updatedAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  mountCortexRoutes(app);

  const server = app.listen(HTTP_PORT, HTTP_HOST, () => {
    logger.info("http_server_started", {
      host: HTTP_HOST,
      port: HTTP_PORT,
      toolGroups: getStartupSummary(),
    });

    if (!IS_PRODUCTION) {
      logger.warn("http_server_running_in_development_mode");
    }
  });

  screenStreamService.attachToServer(server);

  // Start real agent monitor (Sygma-led — pings each agent every 15 min)
  MonitorService.start();

  process.on("SIGTERM", () => {
    logger.info("http_server_sigterm_received");
    server.close(() => {
      logger.info("http_server_closed");
      process.exit(0);
    });
  });
}
