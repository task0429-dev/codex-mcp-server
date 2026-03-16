import path from "path";
import dotenv from "dotenv";
import { Client } from "@notionhq/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const token = process.env.NOTION_TOKEN;
if (!token) {
  throw new Error("NOTION_TOKEN is missing in mcp-server/.env");
}

const notion = new Client({ auth: token });
const STYLE_MARKER = "Style Layer 2026-03-12 | Pass V4";
const ROOT_PARENT_ID = "3211b447-cb62-8134-b620-ee717484671b";

const pages = [
  {
    id: "3211b447-cb62-8134-b620-ee717484671b",
    title: "Project #2 - Introduction + Agent Task Assignment",
    mission:
      "This page is the operating intro, ownership map, and execution charter for Project #2. Every agent has a concrete lane and measurable output.",
    visual: `flowchart LR
  A["Vision + Scope"] --> B["Agent Assignments"]
  B --> C["Build + QA Sprints"]
  C --> D["Deploy + Measure"]
  D --> E["Daily Review + Optimization"]`,
  },
  {
    id: "3211b447-cb62-81a1-a057-dcb4143625e0",
    title: "00 - Project HQ Home | Premium V3.1",
    mission:
      "Central command layer for acquisition strategy, delivery sequencing, and system health across all connected tools.",
    visual: `flowchart LR
  A["Traffic Sources"] --> B["Lead Capture"]
  B --> C["n8n Routing"]
  C --> D["CRM + Notion + Sheets"]
  D --> E["Sales Pipeline"]
  E --> F["Reporting + Forecasts"]`,
  },
  {
    id: "3211b447-cb62-81e7-811e-ebb4d285d7e5",
    title: "01 - Operating Doctrine & Governance | Premium V3.1",
    mission:
      "Defines governance, acceptance criteria, handoff conditions, and the no-drop operational rules for Project #2.",
    visual: `flowchart TD
  A["Standards"] --> B["Execution Rules"]
  B --> C["Quality Gates"]
  C --> D["Escalation Paths"]
  D --> E["Decision Log"]`,
  },
  {
    id: "3211b447-cb62-81bf-8bd9-edb8db38c3dc",
    title: "02 - Offer, ICP, and Segment Blueprint | Premium V3.1",
    mission:
      "Pins the most sellable offer stack to specific ICP segments and pain maps for higher outbound and inbound conversion.",
    visual: `flowchart LR
  A["ICP Segment"] --> B["Pain Hypothesis"]
  B --> C["Offer Match"]
  C --> D["Message Angle"]
  D --> E["Channel + CTA"]`,
  },
  {
    id: "3211b447-cb62-81e7-9784-fac4b4aace00",
    title: "03 - Lead Generation Command Center | Premium V3.1",
    mission:
      "Controls lead discovery, qualification, enrichment, dedupe, scoring, assignment, and outreach readiness.",
    visual: `flowchart LR
  A["Prospecting Inputs"] --> B["Qualification Rules"]
  B --> C["Enrichment + Dedupe"]
  C --> D["Lead Scoring"]
  D --> E["Outreach Queue"]`,
  },
  {
    id: "3211b447-cb62-8156-8b52-e2d32ee03df3",
    title: "04 - Landing Page & Conversion Intelligence | Premium V3.1",
    mission:
      "Tracks headline, offer, form UX, conversion behavior, and downstream quality signals to improve close rates.",
    visual: `flowchart LR
  A["Ad / Social Click"] --> B["Landing Experience"]
  B --> C["Form Submit"]
  C --> D["Auto-Response + Routing"]
  D --> E["Booked Call / Nurture"]`,
  },
  {
    id: "3211b447-cb62-8115-b061-e73a389df3f0",
    title: "05 - n8n Automation Control Plane | Premium V3.1",
    mission:
      "Defines trigger routing, retries, error handling, audit logging, and recovery paths for all automation lanes.",
    visual: `flowchart TD
  A["Trigger"] --> B["Validate Payload"]
  B --> C["Route by Source"]
  C --> D["Write CRM"]
  C --> E["Write Sheets"]
  C --> F["Write Notion"]
  D --> G["Notify Owner"]
  E --> G
  F --> G`,
  },
  {
    id: "3211b447-cb62-817b-9cfa-c51847ea9e5a",
    title: "06 - CRM Field Dictionary & Pipeline Schema | Premium V3.1",
    mission:
      "Locks the canonical CRM object model, pipeline stages, lifecycle states, and sync-safe field naming.",
    visual: `flowchart LR
  A["Lead Object"] --> B["Contact Object"]
  B --> C["Company Object"]
  C --> D["Deal Object"]
  D --> E["Activity Timeline"]`,
  },
  {
    id: "3211b447-cb62-8110-9dff-f7f2dea37024",
    title: "07 - Notion Architecture + Naming Conventions | Premium V3.1",
    mission:
      "Establishes clean page hierarchy, database standards, update cadence, and naming patterns for long-term clarity.",
    visual: `flowchart TD
  A["HQ"] --> B["Databases"]
  B --> C["Templates"]
  C --> D["Relations + Rollups"]
  D --> E["Weekly Hygiene Review"]`,
  },
  {
    id: "3211b447-cb62-81ac-a45a-e3d0a28d4aa2",
    title: "08 - Google Sheets + Drive Ops Schema | Premium V3.1",
    mission:
      "Defines operational sheets, validation rules, handoff columns, folder structures, and archival behavior.",
    visual: `flowchart LR
  A["Lead Capture"] --> B["Master Lead Sheet"]
  B --> C["Campaign Tracker"]
  C --> D["Outreach Tracker"]
  D --> E["Drive Archive"]`,
  },
  {
    id: "3211b447-cb62-814d-9cf1-dee470f80826",
    title: "09 - Sales Process + Outreach Cadence | Premium V3.1",
    mission:
      "Standardizes first touch to close, message sequencing, objection handling, and reactivation loops.",
    visual: `flowchart LR
  A["Lead In"] --> B["Qualify"]
  B --> C["Discovery"]
  C --> D["Proposal"]
  D --> E["Close / Follow-up"]`,
  },
  {
    id: "3211b447-cb62-8121-abaf-c7878d98eb4f",
    title: "10 - Social Media Operating System | Premium V3.1",
    mission:
      "Coordinates content planning, posting, DM handling, repurposing, and attribution back to pipeline outcomes.",
    visual: `flowchart LR
  A["Content Plan"] --> B["Multi-Platform Posting"]
  B --> C["Engagement + DM"]
  C --> D["Lead Capture"]
  D --> E["CRM Attribution"]`,
  },
  {
    id: "3211b447-cb62-81c7-a7c6-d49f60f2c626",
    title: "11 - KPI & Forecasting Command Center | Premium V3.1",
    mission:
      "Monitors lead volume, response rates, meetings, stage conversion, CAC trends, and forecast confidence.",
    visual: `flowchart TD
  A["Daily Inputs"] --> B["KPI Baseline"]
  B --> C["Drift Detection"]
  C --> D["Action Recommendation"]
  D --> E["Scale / Cut Decision"]`,
  },
  {
    id: "3211b447-cb62-81e3-b5a7-d9e383295453",
    title: "12 - Security, QA, and Incident Response | Premium V3.1",
    mission:
      "Defines access controls, secret boundaries, QA checks, incident triage, and post-incident learning loops.",
    visual: `flowchart TD
  A["Access Policy"] --> B["Runtime Checks"]
  B --> C["Error Detection"]
  C --> D["Incident Log"]
  D --> E["Fix + Prevention"]`,
  },
  {
    id: "3211b447-cb62-815a-a7c7-c8e4096500b9",
    title: "13 - 30/60/90 Rollout + Daily Runbook | Premium V3.1",
    mission:
      "Turns strategy into day-by-day execution with owner-specific tasks, timelines, and done-state controls.",
    visual: `flowchart LR
  A["Phase 1 Foundation"] --> B["Phase 2 Systems"]
  B --> C["Phase 3 Prospecting"]
  C --> D["Phase 4 Outreach"]
  D --> E["Phase 5+ Optimization"]`,
  },
];

function richText(content) {
  return [{ type: "text", text: { content } }];
}

function heading2(content) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: richText(content) },
  };
}

function heading3(content) {
  return {
    object: "block",
    type: "heading_3",
    heading_3: { rich_text: richText(content) },
  };
}

function paragraph(content) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(content) },
  };
}

function callout(content) {
  return {
    object: "block",
    type: "callout",
    callout: {
      rich_text: richText(content),
      color: "gray_background",
    },
  };
}

function code(language, content) {
  return {
    object: "block",
    type: "code",
    code: {
      language,
      rich_text: richText(content),
    },
  };
}

function divider() {
  return {
    object: "block",
    type: "divider",
    divider: {},
  };
}

function todo(content, checked = false) {
  return {
    object: "block",
    type: "to_do",
    to_do: {
      rich_text: richText(content),
      checked,
    },
  };
}

function quote(content) {
  return {
    object: "block",
    type: "quote",
    quote: {
      rich_text: richText(content),
    },
  };
}

function matrixForPage(pageTitle) {
  return `+----------------------------+-------------+------------------+-----------------------------+
| Workstream                 | Owner       | Cadence          | Completion Rule             |
+----------------------------+-------------+------------------+-----------------------------+
| Page quality + hierarchy   | Ahmed       | Daily            | Structured + linked + clear |
| Automation execution       | Ayub        | Daily            | Trigger to destination live |
| Content + conversion angle | Atlas       | 3x weekly        | CTA and audience aligned    |
| Metrics + drift checks     | Prime       | Daily            | KPI delta interpreted       |
| Security + access checks   | Rex         | Weekly + events  | No unsafe permissions       |
| Operations discipline      | Sygma       | Daily standup    | No orphaned tasks           |
| Coordination + escalation  | Abdi        | 4-hour loop      | Blockers resolved fast      |
| Tooling + file integrity   | Dame        | Daily QA         | Assets saved + synced       |
+----------------------------+-------------+------------------+-----------------------------+
Context Page: ${pageTitle}`;
}

function buildBlocks(page) {
  return [
    heading2(STYLE_MARKER),
    callout(page.mission),
    paragraph(
      "This visual layer is the executive view for this page. It maps flow, ownership, cadence, and done-state so execution is obvious at a glance."
    ),
    divider(),
    heading3("Visual System Map"),
    code("mermaid", page.visual),
    heading3("Execution Matrix"),
    code("plain text", matrixForPage(page.title)),
    heading3("Agent Action Board"),
    todo("Abdi: Review lane priorities and clear escalations for this page."),
    todo("Dame: Verify linked files, exports, and local-to-cloud integrity for this page."),
    todo("Ayub: Confirm workflows and integration logic tied to this page are production-safe."),
    todo("Ahmed: Enforce naming, structure, and relationship consistency on this page."),
    todo("Rex: Validate permissions, token usage boundaries, and security notes for this page."),
    todo("Prime: Attach measurable KPI signals and threshold logic for this page."),
    todo("Atlas: Ensure messaging and conversion intent are reflected in page copy."),
    todo("Sygma: Check update cadence, task states, and blocker visibility for this page."),
    divider(),
    heading3("Checkpoint Rhythm"),
    paragraph("T+0 Setup Check"),
    paragraph("T+4 Progress Check"),
    paragraph("T+8 Conversion & Quality Check"),
    paragraph("T+24 Completion / Escalation Check"),
    quote("Definition of done: owner assigned, status current, next action explicit, and downstream sync validated."),
  ];
}

async function pageHasTextMarker(pageId, marker) {
  const firstPage = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
  const blocks = firstPage.results || [];
  for (const block of blocks) {
    if (!block?.type) continue;
    const text =
      block[block.type]?.rich_text?.map((t) => t?.plain_text || "").join("") ||
      block[block.type]?.text?.map((t) => t?.plain_text || "").join("") ||
      "";
    if (text.includes(marker)) return true;
  }
  return false;
}

async function pageHasMarker(pageId) {
  return pageHasTextMarker(pageId, STYLE_MARKER);
}

async function appendBlocks(blockId, blocks) {
  const chunkSize = 90;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize);
    await notion.blocks.children.append({
      block_id: blockId,
      children: chunk,
    });
  }
}

async function resolvePageId(page) {
  if (page.id) {
    try {
      await notion.pages.retrieve({ page_id: page.id });
      return page.id;
    } catch (_error) {
      // Fall through to title search.
    }
  }

  const response = await notion.search({
    query: page.title,
    filter: { property: "object", value: "page" },
    page_size: 20,
  });

  const match = (response.results || []).find((item) => {
    const titleProp = item?.properties?.title?.title?.[0]?.plain_text || "";
    return titleProp.trim().toLowerCase() === page.title.trim().toLowerCase();
  });

  return match?.id || null;
}

async function createPageUnderRoot(title) {
  const created = await notion.pages.create({
    parent: { page_id: ROOT_PARENT_ID },
    properties: {
      title: {
        title: [{ type: "text", text: { content: title } }],
      },
    },
  });
  return created.id;
}

async function appendRootIndex(entries) {
  const indexMarker = "Project #2 HQ Index | Premium V4";
  const hasIndex = await pageHasTextMarker(ROOT_PARENT_ID, indexMarker);
  if (hasIndex) return;

  const blocks = [
    heading2(indexMarker),
    paragraph("This is the primary command center index for all Project #2 pages."),
    divider(),
    ...entries.map((entry, idx) =>
      paragraph(`${idx + 1}. ${entry.title} -> ${entry.url || "pending"}`)
    ),
  ];
  await appendBlocks(ROOT_PARENT_ID, blocks);
}

async function main() {
  const results = [];
  for (const page of pages) {
    try {
      const resolvedId = await resolvePageId(page);
      let targetPageId = resolvedId;

      if (!targetPageId && page.id !== ROOT_PARENT_ID) {
        targetPageId = await createPageUnderRoot(page.title);
      }

      if (!targetPageId) {
        results.push({
          title: page.title,
          id: null,
          status: "skipped_not_found",
          url: null,
        });
        continue;
      }

      const alreadyApplied = await pageHasMarker(targetPageId);
      if (!alreadyApplied) {
        const blocks = buildBlocks(page);
        await appendBlocks(targetPageId, blocks);
      }

      results.push({
        title: page.title,
        id: targetPageId,
        status: alreadyApplied
          ? "already_applied"
          : resolvedId
            ? "updated"
            : "created_and_updated",
        url: `https://www.notion.so/${targetPageId.replace(/-/g, "")}`,
      });
    } catch (error) {
      results.push({
        title: page.title,
        id: page.id || null,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await appendRootIndex(results.filter((item) => item.url));
  console.log(JSON.stringify({ marker: STYLE_MARKER, results }, null, 2));
}

await main();
