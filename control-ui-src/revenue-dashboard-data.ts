export type RevenueDateRangeKey = "today" | "last7" | "last30" | "last90" | "thisYear" | "custom";

export type LeadSource =
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

export type PlatformType = "Organic Social" | "Paid Social" | "Owned Media" | "Outbound" | "Referral";

export type LeadStatus =
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

export type FunnelStage =
  | "Visitors / Traffic"
  | "Leads Captured"
  | "Qualified Leads"
  | "Discovery Calls"
  | "Proposals Sent"
  | "Closed Won"
  | "Closed Lost";

export type PipelineStage =
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

export type ActivityType =
  | "new-lead"
  | "status-change"
  | "follow-up"
  | "proposal-sent"
  | "sale-closed"
  | "revenue-recorded"
  | "lost-deal"
  | "refund"
  | "note-added"
  | "task-due";

export interface RevenueLead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: LeadSource;
  campaignId: string;
  platform: PlatformType;
  funnel: string;
  offer: string;
  status: LeadStatus;
  stage: PipelineStage;
  leadScore: number;
  dealValue: number;
  assignedTo: string;
  createdAt: string;
  lastContactAt: string;
  nextFollowUpAt: string;
  tags: string[];
  notesPreview: string;
  qualified: boolean;
  converted: boolean;
  customerAcquiredAt?: string;
}

export interface Opportunity {
  id: string;
  leadId: string;
  name: string;
  company: string;
  stage: PipelineStage;
  value: number;
  weightedValue: number;
  owner: string;
  ageDays: number;
  probability: number;
  stale: boolean;
  highValue: boolean;
  overdueFollowUp: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaleRecord {
  id: string;
  leadId: string;
  source: LeadSource;
  campaignId: string;
  offer: string;
  owner: string;
  grossRevenue: number;
  netRevenue: number;
  profit: number;
  closeDate: string;
  salesCycleDays: number;
  refunded: boolean;
  cancelled: boolean;
}

export interface CampaignRecord {
  id: string;
  name: string;
  channel: LeadSource;
  platform: PlatformType;
  funnel: string;
  offer: string;
}

export interface ExpenseRecord {
  id: string;
  source: LeadSource;
  campaignId: string;
  amount: number;
  date: string;
  type: "Ad Spend" | "Software" | "Contractor" | "Operations";
}

export interface RevenueActivity {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  timestamp: string;
  tone: "info" | "warning" | "success";
  value?: string;
}

export interface DashboardFilters {
  dateRange: RevenueDateRangeKey;
  source: string;
  campaign: string;
  platform: string;
  salesRep: string;
  funnel: string;
  offer: string;
  leadStatus: string;
  customRange?: { start: string; end: string };
}

export interface RevenueDataBundle {
  leads: RevenueLead[];
  opportunities: Opportunity[];
  sales: SaleRecord[];
  campaigns: CampaignRecord[];
  expenses: ExpenseRecord[];
  activities: RevenueActivity[];
}

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  rawValue: number;
  changePct: number;
  trend: "up" | "down" | "flat";
  sparkline: number[];
  tone?: "positive" | "negative" | "neutral";
  detail: string;
  available?: boolean;
  unavailableReason?: string;
}

export interface FunnelMetric {
  stage: FunnelStage;
  count: number;
  conversionPct: number;
  dropOffPct: number;
  movementPct: number;
  available?: boolean;
  unavailableReason?: string;
}

export interface PipelineHealthSummary {
  stageCounts: Array<{ stage: PipelineStage; count: number; value: number }>;
  totalPipelineValue: number;
  weightedPipelineValue: number;
  averageOpportunityAge: number;
  stuckDeals: Opportunity[];
  overdueFollowUps: Opportunity[];
  highValueAttention: Opportunity[];
}

export interface SourceBreakdownRow {
  source: LeadSource;
  leadCount: number;
  qualifiedPct: number;
  conversionPct: number;
  revenue: number;
  roiPct: number;
  trendPct: number;
}

export interface SalesTrendPoint {
  label: string;
  revenue: number;
  leads: number;
  profit: number;
}

export interface InsightItem {
  id: string;
  title: string;
  detail: string;
  tone: "positive" | "warning" | "critical";
}

export interface RevenueDashboardViewModel {
  filters: DashboardFilters;
  filteredLeads: RevenueLead[];
  filteredOpportunities: Opportunity[];
  filteredSales: SaleRecord[];
  filteredExpenses: ExpenseRecord[];
  filteredActivities: RevenueActivity[];
  kpis: KpiMetric[];
  funnel: FunnelMetric[];
  pipeline: PipelineHealthSummary;
  sourceBreakdown: SourceBreakdownRow[];
  salesTrend: SalesTrendPoint[];
  revenueByOffer: Array<{ offer: string; revenue: number }>;
  revenueByCampaign: Array<{ campaign: string; revenue: number }>;
  revenueByOwner: Array<{ owner: string; revenue: number }>;
  roiByChannel: Array<{ source: LeadSource; roiPct: number; revenue: number; spend: number }>;
  insights: InsightItem[];
  projectedRevenue: number;
  bestChannel?: SourceBreakdownRow;
  worstChannel?: SourceBreakdownRow;
  bestCampaign?: { name: string; revenue: number; conversionPct: number };
  highestConvertingSource?: SourceBreakdownRow;
}

const NOW = new Date("2026-03-22T13:45:00-05:00");

function iso(value: string) {
  return new Date(value).toISOString();
}

export const defaultRevenueFilters: DashboardFilters = {
  dateRange: "last30",
  source: "all",
  campaign: "all",
  platform: "all",
  salesRep: "all",
  funnel: "all",
  offer: "all",
  leadStatus: "all",
};

const campaigns: CampaignRecord[] = [
  { id: "cmp-ig-lead-machine", name: "IG Lead Machine", channel: "Instagram", platform: "Organic Social", funnel: "Lead Magnet Funnel", offer: "IG-to-CRM System Pack" },
  { id: "cmp-ref-founder-circle", name: "Founder Circle Referral", channel: "Referral", platform: "Referral", funnel: "Referral Funnel", offer: "Revenue Engine Audit" },
  { id: "cmp-paid-proof-stack", name: "Paid Proof Stack", channel: "Paid Ads", platform: "Paid Social", funnel: "Paid Demo Funnel", offer: "Automation Revenue Pack" },
  { id: "cmp-outbound-ops", name: "Outbound Ops Sprint", channel: "Direct Outreach", platform: "Outbound", funnel: "Outbound Funnel", offer: "Revenue Engine Audit" },
  { id: "cmp-site-command", name: "Website Command Intake", channel: "Website / Landing Page", platform: "Owned Media", funnel: "Inbound Site Funnel", offer: "IG-to-CRM System Pack" },
  { id: "cmp-email-reactivation", name: "Email Reactivation Run", channel: "Email", platform: "Owned Media", funnel: "Reactivation Funnel", offer: "Automation Revenue Pack" },
];

const leads: RevenueLead[] = [
  { id: "lead-001", name: "Mia Carter", company: "Northline Media", email: "mia@northline.co", phone: "(312) 555-0101", source: "Instagram", campaignId: "cmp-ig-lead-machine", platform: "Organic Social", funnel: "Lead Magnet Funnel", offer: "IG-to-CRM System Pack", status: "Qualified", stage: "Qualified", leadScore: 91, dealValue: 4800, assignedTo: "Atlas", createdAt: iso("2026-03-22T08:12:00-05:00"), lastContactAt: iso("2026-03-22T09:02:00-05:00"), nextFollowUpAt: iso("2026-03-23T10:00:00-05:00"), tags: ["high intent", "creator ops"], notesPreview: "Asked for direct implementation support.", qualified: true, converted: false },
  { id: "lead-002", name: "Ethan Brooks", company: "Brookstone Dental", email: "ethan@brookstonedental.com", phone: "(214) 555-0191", source: "Referral", campaignId: "cmp-ref-founder-circle", platform: "Referral", funnel: "Referral Funnel", offer: "Revenue Engine Audit", status: "Proposal Sent", stage: "Proposal Sent", leadScore: 95, dealValue: 12500, assignedTo: "Abdi", createdAt: iso("2026-03-19T11:10:00-05:00"), lastContactAt: iso("2026-03-21T16:30:00-05:00"), nextFollowUpAt: iso("2026-03-24T14:00:00-05:00"), tags: ["referral", "high value"], notesPreview: "Warm intro. Proposal sent for full funnel rebuild.", qualified: true, converted: false },
  { id: "lead-003", name: "Layla Shah", company: "Shah Aesthetics", email: "layla@shahaesthetics.com", phone: "(469) 555-0174", source: "Paid Ads", campaignId: "cmp-paid-proof-stack", platform: "Paid Social", funnel: "Paid Demo Funnel", offer: "Automation Revenue Pack", status: "Won", stage: "Won", leadScore: 88, dealValue: 6200, assignedTo: "Ayub", createdAt: iso("2026-03-15T10:45:00-05:00"), lastContactAt: iso("2026-03-19T13:10:00-05:00"), nextFollowUpAt: iso("2026-03-26T11:00:00-05:00"), tags: ["paid", "medspa"], notesPreview: "Closed after demo. Wants second phase next month.", qualified: true, converted: true, customerAcquiredAt: iso("2026-03-19T13:10:00-05:00") },
  { id: "lead-004", name: "Noah Bennett", company: "Bennett Legal Group", email: "noah@bennettlegal.com", phone: "(713) 555-0118", source: "Website / Landing Page", campaignId: "cmp-site-command", platform: "Owned Media", funnel: "Inbound Site Funnel", offer: "IG-to-CRM System Pack", status: "Contacted", stage: "Contacted", leadScore: 72, dealValue: 5400, assignedTo: "Sygma", createdAt: iso("2026-03-18T14:05:00-05:00"), lastContactAt: iso("2026-03-20T10:15:00-05:00"), nextFollowUpAt: iso("2026-03-23T15:15:00-05:00"), tags: ["website", "legal"], notesPreview: "Interested in lead routing, waiting on internal approval.", qualified: true, converted: false },
  { id: "lead-005", name: "Avery Morgan", company: "Morgan Fitness Labs", email: "avery@morganfitlabs.com", phone: "(602) 555-0134", source: "Instagram", campaignId: "cmp-ig-lead-machine", platform: "Organic Social", funnel: "Lead Magnet Funnel", offer: "Automation Revenue Pack", status: "Awaiting Response", stage: "Awaiting Response", leadScore: 64, dealValue: 3200, assignedTo: "Atlas", createdAt: iso("2026-03-17T09:22:00-05:00"), lastContactAt: iso("2026-03-18T09:50:00-05:00"), nextFollowUpAt: iso("2026-03-22T17:00:00-05:00"), tags: ["creator", "follow-up"], notesPreview: "Downloaded guide. Ghosted after initial reply.", qualified: false, converted: false },
  { id: "lead-006", name: "Sophia Reed", company: "Reed Ventures", email: "sophia@reedventures.io", phone: "(646) 555-0198", source: "Email", campaignId: "cmp-email-reactivation", platform: "Owned Media", funnel: "Reactivation Funnel", offer: "Revenue Engine Audit", status: "Negotiation", stage: "Negotiation", leadScore: 90, dealValue: 9800, assignedTo: "Abdi", createdAt: iso("2026-03-13T08:15:00-05:00"), lastContactAt: iso("2026-03-21T12:10:00-05:00"), nextFollowUpAt: iso("2026-03-23T09:30:00-05:00"), tags: ["reactivation"], notesPreview: "Needs procurement edits. Strong upside if cleared.", qualified: true, converted: false },
  { id: "lead-007", name: "Jackson Price", company: "Price Roofing Co.", email: "jackson@priceroofing.com", phone: "(281) 555-0150", source: "Direct Outreach", campaignId: "cmp-outbound-ops", platform: "Outbound", funnel: "Outbound Funnel", offer: "Revenue Engine Audit", status: "Lost", stage: "Lost", leadScore: 51, dealValue: 4100, assignedTo: "Prime", createdAt: iso("2026-03-07T13:10:00-05:00"), lastContactAt: iso("2026-03-14T15:00:00-05:00"), nextFollowUpAt: iso("2026-04-05T10:00:00-05:00"), tags: ["outbound"], notesPreview: "Budget misaligned this quarter.", qualified: false, converted: false },
  { id: "lead-008", name: "Emma Collins", company: "Collins Smile Studio", email: "emma@collinssmile.com", phone: "(305) 555-0167", source: "Paid Ads", campaignId: "cmp-paid-proof-stack", platform: "Paid Social", funnel: "Paid Demo Funnel", offer: "Automation Revenue Pack", status: "Qualified", stage: "Qualified", leadScore: 83, dealValue: 6800, assignedTo: "Ayub", createdAt: iso("2026-03-20T11:42:00-05:00"), lastContactAt: iso("2026-03-21T14:18:00-05:00"), nextFollowUpAt: iso("2026-03-22T18:15:00-05:00"), tags: ["paid", "dental"], notesPreview: "Fast-moving buyer. Wants same-week build slot.", qualified: true, converted: false },
  { id: "lead-009", name: "Lucas Hall", company: "Hall Wealth Advisory", email: "lucas@hallwealth.com", phone: "(404) 555-0182", source: "Referral", campaignId: "cmp-ref-founder-circle", platform: "Referral", funnel: "Referral Funnel", offer: "Revenue Engine Audit", status: "Won", stage: "Won", leadScore: 97, dealValue: 15200, assignedTo: "Abdi", createdAt: iso("2026-03-09T09:10:00-05:00"), lastContactAt: iso("2026-03-16T16:12:00-05:00"), nextFollowUpAt: iso("2026-03-30T10:30:00-05:00"), tags: ["wealth", "high trust"], notesPreview: "Closed from warm network.", qualified: true, converted: true, customerAcquiredAt: iso("2026-03-16T16:12:00-05:00") },
  { id: "lead-010", name: "Grace Turner", company: "Turner PMU Clinic", email: "grace@turnerpmu.com", phone: "(480) 555-0106", source: "Instagram", campaignId: "cmp-ig-lead-machine", platform: "Organic Social", funnel: "Lead Magnet Funnel", offer: "IG-to-CRM System Pack", status: "New", stage: "New Leads", leadScore: 58, dealValue: 2900, assignedTo: "Atlas", createdAt: iso("2026-03-22T12:48:00-05:00"), lastContactAt: iso("2026-03-22T12:48:00-05:00"), nextFollowUpAt: iso("2026-03-22T16:00:00-05:00"), tags: ["new"], notesPreview: "Fresh lead from the latest post.", qualified: false, converted: false },
  { id: "lead-011", name: "Benjamin Ortiz", company: "Ortiz MedGroup", email: "ben@ortizmedgroup.com", phone: "(713) 555-0169", source: "Website / Landing Page", campaignId: "cmp-site-command", platform: "Owned Media", funnel: "Inbound Site Funnel", offer: "Automation Revenue Pack", status: "Stale", stage: "Stale Leads", leadScore: 61, dealValue: 7200, assignedTo: "Sygma", createdAt: iso("2026-03-02T10:40:00-05:00"), lastContactAt: iso("2026-03-10T11:25:00-05:00"), nextFollowUpAt: iso("2026-03-22T15:00:00-05:00"), tags: ["stale"], notesPreview: "Needs reactivation sequence.", qualified: true, converted: false },
  { id: "lead-012", name: "Harper Lee", company: "Lee Performance Rehab", email: "harper@leepr.com", phone: "(615) 555-0142", source: "Facebook", campaignId: "cmp-paid-proof-stack", platform: "Paid Social", funnel: "Paid Demo Funnel", offer: "Automation Revenue Pack", status: "Proposal Sent", stage: "Proposal Sent", leadScore: 79, dealValue: 5600, assignedTo: "Ayub", createdAt: iso("2026-03-14T12:20:00-05:00"), lastContactAt: iso("2026-03-20T17:00:00-05:00"), nextFollowUpAt: iso("2026-03-24T09:00:00-05:00"), tags: ["facebook"], notesPreview: "Proposal open. Needs procurement follow-up.", qualified: true, converted: false },
  { id: "lead-013", name: "Elijah Cruz", company: "Cruz Capital", email: "elijah@cruzcap.com", phone: "(917) 555-0148", source: "Email", campaignId: "cmp-email-reactivation", platform: "Owned Media", funnel: "Reactivation Funnel", offer: "Revenue Engine Audit", status: "Re-engagement", stage: "Re-engagement Candidates", leadScore: 68, dealValue: 8400, assignedTo: "Abdi", createdAt: iso("2026-03-05T08:22:00-05:00"), lastContactAt: iso("2026-03-08T15:10:00-05:00"), nextFollowUpAt: iso("2026-03-23T11:30:00-05:00"), tags: ["reactivation"], notesPreview: "Strong account value if revived.", qualified: true, converted: false },
  { id: "lead-014", name: "Chloe Simmons", company: "Simmons Dermatology", email: "chloe@simmonsderm.com", phone: "(239) 555-0113", source: "Instagram", campaignId: "cmp-ig-lead-machine", platform: "Organic Social", funnel: "Lead Magnet Funnel", offer: "IG-to-CRM System Pack", status: "Contacted", stage: "Contacted", leadScore: 76, dealValue: 5100, assignedTo: "Atlas", createdAt: iso("2026-03-16T14:42:00-05:00"), lastContactAt: iso("2026-03-18T13:12:00-05:00"), nextFollowUpAt: iso("2026-03-23T13:00:00-05:00"), tags: ["derm"], notesPreview: "Interested in converting Instagram inquiries faster.", qualified: true, converted: false },
];

const sales: SaleRecord[] = [
  { id: "sale-001", leadId: "lead-003", source: "Paid Ads", campaignId: "cmp-paid-proof-stack", offer: "Automation Revenue Pack", owner: "Ayub", grossRevenue: 6200, netRevenue: 5850, profit: 4470, closeDate: iso("2026-03-19T13:10:00-05:00"), salesCycleDays: 4, refunded: false, cancelled: false },
  { id: "sale-002", leadId: "lead-009", source: "Referral", campaignId: "cmp-ref-founder-circle", offer: "Revenue Engine Audit", owner: "Abdi", grossRevenue: 15200, netRevenue: 14800, profit: 13610, closeDate: iso("2026-03-16T16:12:00-05:00"), salesCycleDays: 7, refunded: false, cancelled: false },
  { id: "sale-003", leadId: "lead-020", source: "Instagram", campaignId: "cmp-ig-lead-machine", offer: "IG-to-CRM System Pack", owner: "Atlas", grossRevenue: 5900, netRevenue: 5600, profit: 4690, closeDate: iso("2026-03-17T16:20:00-05:00"), salesCycleDays: 7, refunded: false, cancelled: false },
  { id: "sale-004", leadId: "lead-030", source: "Website / Landing Page", campaignId: "cmp-site-command", offer: "IG-to-CRM System Pack", owner: "Sygma", grossRevenue: 4300, netRevenue: 3980, profit: 3060, closeDate: iso("2026-03-08T10:15:00-05:00"), salesCycleDays: 5, refunded: false, cancelled: false },
  { id: "sale-005", leadId: "lead-031", source: "Email", campaignId: "cmp-email-reactivation", offer: "Revenue Engine Audit", owner: "Abdi", grossRevenue: 8800, netRevenue: 8600, profit: 7410, closeDate: iso("2026-02-28T15:10:00-05:00"), salesCycleDays: 9, refunded: false, cancelled: false },
  { id: "sale-006", leadId: "lead-032", source: "Referral", campaignId: "cmp-ref-founder-circle", offer: "Revenue Engine Audit", owner: "Abdi", grossRevenue: 10400, netRevenue: 10100, profit: 9220, closeDate: iso("2026-02-14T11:40:00-05:00"), salesCycleDays: 6, refunded: false, cancelled: false },
];

const expenses: ExpenseRecord[] = [
  { id: "exp-001", source: "Instagram", campaignId: "cmp-ig-lead-machine", amount: 850, date: iso("2026-03-18T00:00:00-05:00"), type: "Operations" },
  { id: "exp-002", source: "Paid Ads", campaignId: "cmp-paid-proof-stack", amount: 3400, date: iso("2026-03-21T00:00:00-05:00"), type: "Ad Spend" },
  { id: "exp-003", source: "Referral", campaignId: "cmp-ref-founder-circle", amount: 620, date: iso("2026-03-12T00:00:00-05:00"), type: "Operations" },
  { id: "exp-004", source: "Website / Landing Page", campaignId: "cmp-site-command", amount: 740, date: iso("2026-03-10T00:00:00-05:00"), type: "Software" },
  { id: "exp-005", source: "Email", campaignId: "cmp-email-reactivation", amount: 290, date: iso("2026-03-14T00:00:00-05:00"), type: "Software" },
  { id: "exp-006", source: "Direct Outreach", campaignId: "cmp-outbound-ops", amount: 510, date: iso("2026-03-19T00:00:00-05:00"), type: "Contractor" },
];

const activities: RevenueActivity[] = [
  { id: "act-001", type: "new-lead", title: "New lead added", detail: "Grace Turner entered from the latest Instagram funnel.", timestamp: iso("2026-03-22T12:48:00-05:00"), tone: "info", value: "$2.9k potential" },
  { id: "act-002", type: "status-change", title: "Lead moved to qualified", detail: "Mia Carter scored 91 and moved to qualified.", timestamp: iso("2026-03-22T09:02:00-05:00"), tone: "success" },
  { id: "act-003", type: "proposal-sent", title: "Proposal sent", detail: "Founder Circle referral received a full-funnel proposal.", timestamp: iso("2026-03-21T16:30:00-05:00"), tone: "info", value: "$12.5k" },
  { id: "act-004", type: "task-due", title: "Follow-up overdue", detail: "Avery Morgan passed the next follow-up window.", timestamp: iso("2026-03-22T13:00:00-05:00"), tone: "warning" },
  { id: "act-005", type: "sale-closed", title: "Sale closed", detail: "Layla Shah closed the Automation Revenue Pack.", timestamp: iso("2026-03-19T13:10:00-05:00"), tone: "success", value: "$6.2k" },
  { id: "act-006", type: "revenue-recorded", title: "Revenue recorded", detail: "Lucas Hall deal posted to net revenue.", timestamp: iso("2026-03-16T16:12:00-05:00"), tone: "success", value: "$14.8k net" },
  { id: "act-007", type: "lost-deal", title: "Deal lost", detail: "Jackson Price pushed the project to Q2.", timestamp: iso("2026-03-14T15:00:00-05:00"), tone: "warning", value: "$4.1k lost" },
];

const probabilityByStage: Record<PipelineStage, number> = {
  "New Leads": 0.12,
  Contacted: 0.2,
  "Awaiting Response": 0.18,
  Qualified: 0.42,
  "Proposal Sent": 0.62,
  Negotiation: 0.78,
  Won: 1,
  Lost: 0,
  "Stale Leads": 0.08,
  "Re-engagement Candidates": 0.16,
};

const opportunities: Opportunity[] = leads
  .filter((lead) => !["Won", "Lost"].includes(lead.status))
  .map((lead) => {
    const ageDays = Math.max(1, Math.floor((NOW.getTime() - new Date(lead.createdAt).getTime()) / 86_400_000));
    const probability = probabilityByStage[lead.stage];
    return {
      id: `opp-${lead.id}`,
      leadId: lead.id,
      name: `${lead.company} Opportunity`,
      company: lead.company,
      stage: lead.stage,
      value: lead.dealValue,
      weightedValue: lead.dealValue * probability,
      owner: lead.assignedTo,
      ageDays,
      probability,
      stale: lead.stage === "Stale Leads" || ageDays > 10,
      highValue: lead.dealValue >= 9000,
      overdueFollowUp: new Date(lead.nextFollowUpAt).getTime() < NOW.getTime(),
      createdAt: lead.createdAt,
      updatedAt: lead.lastContactAt,
    };
  });

export const revenueDashboardSeed: RevenueDataBundle = {
  leads,
  opportunities,
  sales,
  campaigns,
  expenses,
  activities,
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function dateRangeWindow(filters: DashboardFilters) {
  const now = NOW;
  if (filters.dateRange === "custom" && filters.customRange?.start && filters.customRange?.end) {
    return { start: startOfDay(new Date(filters.customRange.start)), end: endOfDay(new Date(filters.customRange.end)) };
  }
  if (filters.dateRange === "today") return { start: startOfDay(now), end: endOfDay(now) };
  if (filters.dateRange === "thisYear") return { start: new Date(now.getFullYear(), 0, 1), end: endOfDay(now) };
  const days = filters.dateRange === "last7" ? 7 : filters.dateRange === "last30" ? 30 : 90;
  return { start: startOfDay(new Date(now.getTime() - (days - 1) * 86_400_000)), end: endOfDay(now) };
}

function previousWindow(start: Date, end: Date) {
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { start: prevStart, end: prevEnd };
}

function inRange(value: string, start: Date, end: Date) {
  const time = new Date(value).getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function safePct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function integer(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function durationLabel(days: number) {
  if (!days) return "0d";
  if (days < 1) return "<1d";
  return `${round(days, days >= 10 ? 0 : 1)}d`;
}

function formatChange(current: number, previous: number) {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return 100;
  return round(((current - previous) / previous) * 100, 1);
}

function trendOf(changePct: number, invert = false) {
  if (Math.abs(changePct) < 0.5) return "flat" as const;
  if (invert) return changePct <= 0 ? "up" as const : "down" as const;
  return changePct >= 0 ? "up" as const : "down" as const;
}

function sparklineFrom(current: number, previous: number) {
  const base = Math.max(current, previous, 1);
  return [
    round(previous * 0.7 + base * 0.05, 2),
    round(previous * 0.86 + base * 0.02, 2),
    round(previous, 2),
    round((previous + current) / 2, 2),
    round(current * 0.94, 2),
    round(current, 2),
  ];
}

function matchesFilters(lead: RevenueLead, filters: DashboardFilters) {
  return (
    (filters.source === "all" || lead.source === filters.source) &&
    (filters.campaign === "all" || lead.campaignId === filters.campaign) &&
    (filters.platform === "all" || lead.platform === filters.platform) &&
    (filters.salesRep === "all" || lead.assignedTo === filters.salesRep) &&
    (filters.funnel === "all" || lead.funnel === filters.funnel) &&
    (filters.offer === "all" || lead.offer === filters.offer) &&
    (filters.leadStatus === "all" || lead.status === filters.leadStatus)
  );
}

function byDateBuckets(leadsInput: RevenueLead[], salesInput: SaleRecord[], start: Date, end: Date) {
  const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const points = diffDays <= 14 ? diffDays : 8;
  const bucketSize = Math.max(1, Math.ceil(diffDays / points));
  const rows: SalesTrendPoint[] = [];

  for (let i = 0; i < points; i += 1) {
    const bucketStart = new Date(start.getTime() + i * bucketSize * 86_400_000);
    const bucketEnd = new Date(Math.min(end.getTime(), bucketStart.getTime() + bucketSize * 86_400_000 - 1));
    const bucketLeads = leadsInput.filter((lead) => inRange(lead.createdAt, bucketStart, bucketEnd));
    const bucketSales = salesInput.filter((sale) => inRange(sale.closeDate, bucketStart, bucketEnd));
    rows.push({
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(bucketStart),
      revenue: bucketSales.reduce((sum, sale) => sum + sale.grossRevenue, 0),
      leads: bucketLeads.length,
      profit: bucketSales.reduce((sum, sale) => sum + sale.profit, 0),
    });
  }

  return rows;
}

export function revenueFilterOptions(bundle: RevenueDataBundle) {
  return {
    sources: ["all", ...Array.from(new Set(bundle.leads.map((lead) => lead.source)))],
    campaigns: ["all", ...bundle.campaigns.map((campaign) => campaign.id)],
    platforms: ["all", ...Array.from(new Set(bundle.leads.map((lead) => lead.platform)))],
    salesReps: ["all", ...Array.from(new Set(bundle.leads.map((lead) => lead.assignedTo)))],
    funnels: ["all", ...Array.from(new Set(bundle.leads.map((lead) => lead.funnel)))],
    offers: ["all", ...Array.from(new Set(bundle.leads.map((lead) => lead.offer)))],
    leadStatuses: ["all", ...Array.from(new Set(bundle.leads.map((lead) => lead.status)))],
  };
}

export function campaignNameById(bundle: RevenueDataBundle, campaignId: string) {
  return bundle.campaigns.find((campaign) => campaign.id === campaignId)?.name || campaignId;
}

export function deriveRevenueDashboard(bundle: RevenueDataBundle, filters: DashboardFilters): RevenueDashboardViewModel {
  const { start, end } = dateRangeWindow(filters);
  const previous = previousWindow(start, end);

  const scopedLeads = bundle.leads.filter((lead) => matchesFilters(lead, filters));
  const filteredLeads = scopedLeads.filter((lead) => inRange(lead.createdAt, start, end));
  const previousLeads = scopedLeads.filter((lead) => inRange(lead.createdAt, previous.start, previous.end));

  const leadIds = new Set(filteredLeads.map((lead) => lead.id));
  const previousLeadIds = new Set(previousLeads.map((lead) => lead.id));

  const filteredOpportunities = bundle.opportunities.filter((opp) => leadIds.has(opp.leadId));
  const previousOpportunities = bundle.opportunities.filter((opp) => previousLeadIds.has(opp.leadId));

  const filteredSales = bundle.sales.filter((sale) => {
    const lead = bundle.leads.find((entry) => entry.id === sale.leadId);
    return lead && matchesFilters(lead, filters) && inRange(sale.closeDate, start, end);
  });
  const previousSales = bundle.sales.filter((sale) => {
    const lead = bundle.leads.find((entry) => entry.id === sale.leadId);
    return lead && matchesFilters(lead, filters) && inRange(sale.closeDate, previous.start, previous.end);
  });

  const filteredExpenses = bundle.expenses.filter((expense) => {
    const campaign = bundle.campaigns.find((entry) => entry.id === expense.campaignId);
    return (
      inRange(expense.date, start, end) &&
      (filters.source === "all" || expense.source === filters.source) &&
      (filters.campaign === "all" || expense.campaignId === filters.campaign) &&
      (filters.platform === "all" || campaign?.platform === filters.platform) &&
      (filters.funnel === "all" || campaign?.funnel === filters.funnel) &&
      (filters.offer === "all" || campaign?.offer === filters.offer)
    );
  });
  const previousExpenses = bundle.expenses.filter((expense) => {
    const campaign = bundle.campaigns.find((entry) => entry.id === expense.campaignId);
    return (
      inRange(expense.date, previous.start, previous.end) &&
      (filters.source === "all" || expense.source === filters.source) &&
      (filters.campaign === "all" || expense.campaignId === filters.campaign) &&
      (filters.platform === "all" || campaign?.platform === filters.platform) &&
      (filters.funnel === "all" || campaign?.funnel === filters.funnel) &&
      (filters.offer === "all" || campaign?.offer === filters.offer)
    );
  });

  const filteredActivities = bundle.activities
    .filter((activity) => inRange(activity.timestamp, start, end))
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));

  const totalLeads = filteredLeads.length;
  const qualifiedLeads = filteredLeads.filter((lead) => lead.qualified).length;
  const activeDeals = filteredOpportunities.filter((opp) => !["Won", "Lost"].includes(opp.stage)).length;
  const closedWon = filteredSales.length
    ? filteredSales.filter((sale) => !sale.refunded && !sale.cancelled).length
    : filteredLeads.filter((lead) => lead.converted || lead.status === "Won").length;
  const closedLost = filteredLeads.filter((lead) => lead.status === "Lost").length;
  const grossRevenue = filteredSales.reduce((sum, sale) => sum + sale.grossRevenue, 0);
  const netRevenue = filteredSales.reduce((sum, sale) => sum + sale.netRevenue, 0);
  const profit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);
  const spend = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const conversionRate = safePct(filteredLeads.filter((lead) => lead.converted).length, totalLeads);
  const closeRateBase = filteredSales.length
    ? Math.max(1, filteredOpportunities.length + filteredSales.length)
    : Math.max(1, closedWon + closedLost);
  const closeRate = safePct(closedWon, closeRateBase);
  const roiPct = safePct(profit - spend, spend || 1);
  const averageDealSize = closedWon ? grossRevenue / closedWon : 0;
  const costPerLead = totalLeads ? spend / totalLeads : 0;
  const customerAcquisitionCost = closedWon ? spend / closedWon : 0;
  const avgLeadToCustomerTime = filteredSales.length
    ? filteredSales.reduce((sum, sale) => sum + sale.salesCycleDays, 0) / filteredSales.length
    : 0;

  const prev = {
    totalLeads: previousLeads.length,
    qualifiedLeads: previousLeads.filter((lead) => lead.qualified).length,
    activeDeals: previousOpportunities.filter((opp) => !["Won", "Lost"].includes(opp.stage)).length,
    closedWon: previousSales.length ? previousSales.length : previousLeads.filter((lead) => lead.converted || lead.status === "Won").length,
    closedLost: previousLeads.filter((lead) => lead.status === "Lost").length,
    conversionRate: safePct(previousLeads.filter((lead) => lead.converted).length, previousLeads.length),
    closeRate: previousSales.length
      ? safePct(previousSales.length, Math.max(1, previousOpportunities.length + previousSales.length))
      : safePct(
          previousLeads.filter((lead) => lead.converted || lead.status === "Won").length,
          Math.max(
            1,
            previousLeads.filter((lead) => lead.converted || lead.status === "Won").length +
              previousLeads.filter((lead) => lead.status === "Lost").length
          )
        ),
    revenue: previousSales.reduce((sum, sale) => sum + sale.grossRevenue, 0),
    profit: previousSales.reduce((sum, sale) => sum + sale.profit, 0),
    roiPct: safePct(previousSales.reduce((sum, sale) => sum + sale.profit, 0) - previousExpenses.reduce((sum, expense) => sum + expense.amount, 0), previousExpenses.reduce((sum, expense) => sum + expense.amount, 0) || 1),
    averageDealSize: previousSales.length ? previousSales.reduce((sum, sale) => sum + sale.grossRevenue, 0) / previousSales.length : 0,
    costPerLead: previousLeads.length ? previousExpenses.reduce((sum, expense) => sum + expense.amount, 0) / previousLeads.length : 0,
    customerAcquisitionCost: previousSales.length ? previousExpenses.reduce((sum, expense) => sum + expense.amount, 0) / previousSales.length : 0,
    leadToCustomerTime: previousSales.length ? previousSales.reduce((sum, sale) => sum + sale.salesCycleDays, 0) / previousSales.length : 0,
  };

  const kpis: KpiMetric[] = [
    { id: "total-leads", label: "Total Leads", value: integer(totalLeads), rawValue: totalLeads, changePct: formatChange(totalLeads, prev.totalLeads), trend: trendOf(formatChange(totalLeads, prev.totalLeads)), sparkline: sparklineFrom(totalLeads, prev.totalLeads), detail: "Leads captured in the active window." },
    { id: "qualified-leads", label: "Qualified Leads", value: integer(qualifiedLeads), rawValue: qualifiedLeads, changePct: formatChange(qualifiedLeads, prev.qualifiedLeads), trend: trendOf(formatChange(qualifiedLeads, prev.qualifiedLeads)), sparkline: sparklineFrom(qualifiedLeads, prev.qualifiedLeads), detail: "Leads passing qualification." },
    { id: "active-deals", label: "Active Deals", value: integer(activeDeals), rawValue: activeDeals, changePct: formatChange(activeDeals, prev.activeDeals), trend: trendOf(formatChange(activeDeals, prev.activeDeals)), sparkline: sparklineFrom(activeDeals, prev.activeDeals), detail: "Open opportunities still in motion." },
    { id: "closed-won", label: "Closed Won", value: integer(closedWon), rawValue: closedWon, changePct: formatChange(closedWon, prev.closedWon), trend: trendOf(formatChange(closedWon, prev.closedWon)), sparkline: sparklineFrom(closedWon, prev.closedWon), detail: "Deals converted to revenue." },
    { id: "closed-lost", label: "Closed Lost", value: integer(closedLost), rawValue: closedLost, changePct: formatChange(closedLost, prev.closedLost), trend: trendOf(formatChange(closedLost, prev.closedLost), true), sparkline: sparklineFrom(closedLost, prev.closedLost), tone: "negative", detail: "Lost opportunities in the active window." },
    { id: "conversion-rate", label: "Conversion Rate", value: `${round(conversionRate)}%`, rawValue: conversionRate, changePct: formatChange(conversionRate, prev.conversionRate), trend: trendOf(formatChange(conversionRate, prev.conversionRate)), sparkline: sparklineFrom(conversionRate, prev.conversionRate), detail: "Lead-to-customer conversion rate." },
    { id: "close-rate", label: "Close Rate", value: `${round(closeRate)}%`, rawValue: closeRate, changePct: formatChange(closeRate, prev.closeRate), trend: trendOf(formatChange(closeRate, prev.closeRate)), sparkline: sparklineFrom(closeRate, prev.closeRate), detail: "Opportunity to win efficiency." },
    { id: "revenue", label: "Revenue", value: money(grossRevenue), rawValue: grossRevenue, changePct: formatChange(grossRevenue, prev.revenue), trend: trendOf(formatChange(grossRevenue, prev.revenue)), sparkline: sparklineFrom(grossRevenue, prev.revenue), detail: "Gross revenue booked." },
    { id: "profit", label: "Profit", value: money(profit), rawValue: profit, changePct: formatChange(profit, prev.profit), trend: trendOf(formatChange(profit, prev.profit)), sparkline: sparklineFrom(profit, prev.profit), detail: "Profit after delivery cost." },
    { id: "roi", label: "ROI", value: `${round(roiPct)}%`, rawValue: roiPct, changePct: formatChange(roiPct, prev.roiPct), trend: trendOf(formatChange(roiPct, prev.roiPct)), sparkline: sparklineFrom(roiPct, prev.roiPct), detail: "Return on acquisition and operating spend." },
    { id: "avg-deal", label: "Average Deal Size", value: money(averageDealSize), rawValue: averageDealSize, changePct: formatChange(averageDealSize, prev.averageDealSize), trend: trendOf(formatChange(averageDealSize, prev.averageDealSize)), sparkline: sparklineFrom(averageDealSize, prev.averageDealSize), detail: "Average closed-won deal size." },
    { id: "cpl", label: "Cost Per Lead", value: money(costPerLead), rawValue: costPerLead, changePct: formatChange(costPerLead, prev.costPerLead), trend: trendOf(formatChange(costPerLead, prev.costPerLead), true), sparkline: sparklineFrom(costPerLead, prev.costPerLead), tone: "negative", detail: "Average acquisition cost per lead." },
    { id: "cac", label: "Customer Acquisition Cost", value: money(customerAcquisitionCost), rawValue: customerAcquisitionCost, changePct: formatChange(customerAcquisitionCost, prev.customerAcquisitionCost), trend: trendOf(formatChange(customerAcquisitionCost, prev.customerAcquisitionCost), true), sparkline: sparklineFrom(customerAcquisitionCost, prev.customerAcquisitionCost), tone: "negative", detail: "Average spend per converted customer." },
    { id: "lead-time", label: "Lead-to-Customer Time", value: durationLabel(avgLeadToCustomerTime), rawValue: avgLeadToCustomerTime, changePct: formatChange(avgLeadToCustomerTime, prev.leadToCustomerTime), trend: trendOf(formatChange(avgLeadToCustomerTime, prev.leadToCustomerTime), true), sparkline: sparklineFrom(avgLeadToCustomerTime, prev.leadToCustomerTime), tone: "negative", detail: "Average sales cycle length." },
  ];

  const visitorCount = Math.round(totalLeads * 4.8 + 36);
  const discoveryCalls = filteredLeads.filter((lead) => ["Qualified", "Proposal Sent", "Negotiation", "Won"].includes(lead.status)).length;
  const proposalsSent = filteredLeads.filter((lead) => ["Proposal Sent", "Negotiation", "Won"].includes(lead.status)).length;
  const funnelCounts = [
    { stage: "Visitors / Traffic" as const, count: visitorCount },
    { stage: "Leads Captured" as const, count: totalLeads },
    { stage: "Qualified Leads" as const, count: qualifiedLeads },
    { stage: "Discovery Calls" as const, count: discoveryCalls },
    { stage: "Proposals Sent" as const, count: proposalsSent },
    { stage: "Closed Won" as const, count: closedWon },
    { stage: "Closed Lost" as const, count: closedLost },
  ];

  const funnel = funnelCounts.map((entry, index) => {
    const previousCount = index === 0 ? entry.count : funnelCounts[index - 1].count;
    const conversionPct = index === 0 ? 100 : safePct(entry.count, previousCount);
    return {
      stage: entry.stage,
      count: entry.count,
      conversionPct: round(conversionPct),
      dropOffPct: round(index === 0 ? 0 : Math.max(0, 100 - conversionPct)),
      movementPct: round(index === 0 ? 0 : conversionPct - 50),
    };
  });

  const stageOrder: PipelineStage[] = ["New Leads", "Contacted", "Awaiting Response", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost", "Stale Leads", "Re-engagement Candidates"];
  const stageCounts = stageOrder.map((stage) => {
    const matches = filteredOpportunities.filter((opp) => opp.stage === stage);
    return { stage, count: matches.length, value: matches.reduce((sum, opp) => sum + opp.value, 0) };
  });

  const pipeline: PipelineHealthSummary = {
    stageCounts,
    totalPipelineValue: filteredOpportunities.reduce((sum, opp) => sum + opp.value, 0),
    weightedPipelineValue: filteredOpportunities.reduce((sum, opp) => sum + opp.weightedValue, 0),
    averageOpportunityAge: filteredOpportunities.length ? filteredOpportunities.reduce((sum, opp) => sum + opp.ageDays, 0) / filteredOpportunities.length : 0,
    stuckDeals: filteredOpportunities.filter((opp) => opp.stale).sort((a, b) => b.value - a.value).slice(0, 5),
    overdueFollowUps: filteredOpportunities.filter((opp) => opp.overdueFollowUp).sort((a, b) => b.value - a.value).slice(0, 5),
    highValueAttention: filteredOpportunities.filter((opp) => opp.highValue && !["Won", "Lost"].includes(opp.stage)).sort((a, b) => b.value - a.value).slice(0, 5),
  };

  const sourceBreakdown = (["Instagram", "Facebook", "X / Twitter", "TikTok", "Website / Landing Page", "Referral", "Direct Outreach", "Email", "Paid Ads", "Other"] as LeadSource[])
    .map((source) => {
      const sourceLeads = filteredLeads.filter((lead) => lead.source === source);
      const sourceSales = filteredSales.filter((sale) => sale.source === source);
      const sourceSpend = filteredExpenses.filter((expense) => expense.source === source).reduce((sum, expense) => sum + expense.amount, 0);
      const prevSourceLeads = previousLeads.filter((lead) => lead.source === source);
      return {
        source,
        leadCount: sourceLeads.length,
        qualifiedPct: round(safePct(sourceLeads.filter((lead) => lead.qualified).length, sourceLeads.length)),
        conversionPct: round(safePct(sourceLeads.filter((lead) => lead.converted).length, sourceLeads.length)),
        revenue: sourceSales.reduce((sum, sale) => sum + sale.netRevenue, 0),
        roiPct: round(safePct(sourceSales.reduce((sum, sale) => sum + sale.netRevenue, 0) - sourceSpend, sourceSpend || 1)),
        trendPct: formatChange(sourceLeads.length, prevSourceLeads.length),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const salesTrend = byDateBuckets(filteredLeads, filteredSales, start, end);
  const revenueByOffer = Object.entries(filteredSales.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.offer] = (acc[sale.offer] || 0) + sale.netRevenue;
    return acc;
  }, {})).map(([offer, revenue]) => ({ offer, revenue })).sort((a, b) => b.revenue - a.revenue);

  const revenueByCampaign = Object.entries(filteredSales.reduce<Record<string, number>>((acc, sale) => {
    const campaignName = campaignNameById(bundle, sale.campaignId);
    acc[campaignName] = (acc[campaignName] || 0) + sale.netRevenue;
    return acc;
  }, {})).map(([campaign, revenue]) => ({ campaign, revenue })).sort((a, b) => b.revenue - a.revenue);

  const revenueByOwner = Object.entries(filteredSales.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.owner] = (acc[sale.owner] || 0) + sale.netRevenue;
    return acc;
  }, {})).map(([owner, revenue]) => ({ owner, revenue })).sort((a, b) => b.revenue - a.revenue);

  const roiByChannel = sourceBreakdown.map((row) => ({
    source: row.source,
    roiPct: row.roiPct,
    revenue: row.revenue,
    spend: filteredExpenses.filter((expense) => expense.source === row.source).reduce((sum, expense) => sum + expense.amount, 0),
  })).sort((a, b) => b.roiPct - a.roiPct);

  const proposalToCloseRate = proposalsSent ? safePct(closedWon, proposalsSent) : 0;
  const staleCount = pipeline.stageCounts.find((entry) => entry.stage === "Stale Leads")?.count || 0;
  const instagramRow = sourceBreakdown.find((row) => row.source === "Instagram");
  const referralRow = sourceBreakdown.find((row) => row.source === "Referral");

  const insights: InsightItem[] = [
    { id: "close-rate", title: closeRate < 20 ? "Close rate needs attention" : "Close rate is holding", detail: closeRate < 20 ? `Close rate is ${round(closeRate)}%. Proposal quality or follow-up speed needs work.` : `Close rate is ${round(closeRate)}% and above the current operating floor.`, tone: closeRate < 20 ? "critical" : "positive" },
    { id: "instagram", title: "Instagram momentum check", detail: instagramRow ? `Instagram delivered ${instagramRow.leadCount} leads with ${instagramRow.qualifiedPct}% qualified and ${instagramRow.conversionPct}% converted.` : "Instagram has no signal in the current filter state.", tone: instagramRow && instagramRow.trendPct >= 0 ? "positive" : "warning" },
    { id: "referral", title: "Highest ROI source", detail: referralRow ? `Referral traffic is the strongest ROI channel at ${round(referralRow.roiPct)}% with ${money(referralRow.revenue)} in net revenue.` : "No referral performance signal is available.", tone: "positive" },
    { id: "stale", title: "Reactivation queue", detail: `${staleCount} stale leads are eligible for reactivation and ${pipeline.overdueFollowUps.length} opportunities are overdue on follow-up.`, tone: staleCount >= 2 ? "warning" : "positive" },
    { id: "proposal", title: "Proposal-to-close efficiency", detail: `Proposal-to-close rate is ${round(proposalToCloseRate)}%. ${proposalToCloseRate < 35 ? "Tighten proposal quality and post-proposal follow-up." : "The proposal stage is performing cleanly."}`, tone: proposalToCloseRate < 35 ? "warning" : "positive" },
  ];

  const bestChannel = sourceBreakdown[0];
  const worstChannel = [...sourceBreakdown].sort((a, b) => a.roiPct - b.roiPct)[0];
  const bestCampaign = revenueByCampaign[0]
    ? {
        name: revenueByCampaign[0].campaign,
        revenue: revenueByCampaign[0].revenue,
        conversionPct: round(
          safePct(
            filteredSales.filter((sale) => campaignNameById(bundle, sale.campaignId) === revenueByCampaign[0].campaign).length,
            filteredLeads.filter((lead) => campaignNameById(bundle, lead.campaignId) === revenueByCampaign[0].campaign).length
          )
        ),
      }
    : undefined;

  return {
    filters,
    filteredLeads,
    filteredOpportunities,
    filteredSales,
    filteredExpenses,
    filteredActivities,
    kpis,
    funnel,
    pipeline,
    sourceBreakdown,
    salesTrend,
    revenueByOffer,
    revenueByCampaign,
    revenueByOwner,
    roiByChannel,
    insights,
    projectedRevenue: round(netRevenue + filteredOpportunities.reduce((sum, opp) => sum + opp.weightedValue, 0) * 0.42, 0),
    bestChannel,
    worstChannel,
    bestCampaign,
    highestConvertingSource: [...sourceBreakdown].sort((a, b) => b.conversionPct - a.conversionPct)[0],
  };
}
