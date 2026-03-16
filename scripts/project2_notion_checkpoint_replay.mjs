import fs from "node:fs";
import path from "node:path";
import { Client } from "@notionhq/client";

const root = process.cwd();
const envPath = path.join(root, ".env");
const notionStatePath = path.join(root, "data", "project-2", "notion", "checkpoint-target.json");
const notionQueuePath = path.join(root, "data", "project-2", "notion", "pending-sync-queue.json");
const legacyNotionQueuePath = path.join(root, "data", "project-2", "notion", "checkpoint-retry-queue.json");
const latestStatusPath = path.join(root, "data", "project-2", "evidence", "latest-status.json");
const latestBlockersPath = path.join(root, "data", "project-2", "blockers", "latest-blockers.md");

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function cleanValue(value) {
  const out = String(value || "").trim();
  if ((out.startsWith("\"") && out.endsWith("\"")) || (out.startsWith("'") && out.endsWith("'"))) {
    return out.slice(1, -1).trim();
  }
  return out;
}

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeNotionId(value) {
  return cleanValue(value).replace(/-/g, "");
}

function queueItems(state) {
  return Array.isArray(state?.queue) ? state.queue : [];
}

function mergeQueueStates(primary, legacy) {
  const byPageId = new Map();
  for (const state of [primary, legacy]) {
    for (const item of queueItems(state)) {
      if (!item || String(item?.status || "") !== "pending_retry") continue;
      const key = normalizeNotionId(item.page_id || "");
      const prev = byPageId.get(key);
      const prevTs = Date.parse(prev?.queued_at_utc || prev?.last_attempt_utc || 0);
      const nextTs = Date.parse(item?.queued_at_utc || item?.last_attempt_utc || 0);
      if (!prev || nextTs >= prevTs) byPageId.set(key, item);
    }
  }
  return Array.from(byPageId.values());
}

function writeQueueState(queue) {
  const payload = { updated_at_utc: utcNow(), queue };
  writeJson(notionQueuePath, payload);
  writeJson(legacyNotionQueuePath, payload);
}

function isNotionObjectNotFound(error) {
  return String(error?.code || "").toLowerCase() === "object_not_found"
    || String(error?.message || "").includes("Could not find block with ID");
}

function pageTitleFromSearchResult(result) {
  const titleProp = Object.values(result?.properties || {}).find((prop) => prop?.type === "title");
  const title = (titleProp?.title || []).map((t) => t?.plain_text || "").join("").trim();
  return title || "Untitled";
}

async function discoverNotionCheckpointPage(notion) {
  const queries = ["Project HQ Home", "Project #2", "Strike Build", "Task Enterprise"];
  for (const query of queries) {
    const response = await notion.search({
      query,
      filter: { property: "object", value: "page" },
      sort: { timestamp: "last_edited_time", direction: "descending" },
      page_size: 10
    });
    const page = (response?.results || []).find((r) => r?.object === "page" && r?.id);
    if (page) return { id: page.id, title: pageTitleFromSearchResult(page), source: `search:${query}` };
  }

  const fallbackResponse = await notion.search({
    filter: { property: "object", value: "page" },
    sort: { timestamp: "last_edited_time", direction: "descending" },
    page_size: 10
  });
  const page = (fallbackResponse?.results || []).find((r) => r?.object === "page" && r?.id);
  if (!page) return null;
  return { id: page.id, title: pageTitleFromSearchResult(page), source: "search:any-page" };
}

function buildChildren({ launchReady, passed, total, runSummary, driveManifest, blockersRef, runSlug }) {
  return [
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: `Checkpoint Replay ${utcNow()}` } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Launch Ready: ${launchReady}` } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Gates Passed: ${passed}/${total}` } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Run Summary: ${runSummary || "n/a"}` } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Drive Manifest: ${driveManifest || "n/a"}` } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Blocker Register: ${blockersRef}` } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: `Queue Source Run: ${runSlug || "latest-status"}` } }]
      }
    }
  ];
}

async function appendCheckpoint(notion, pageId, children) {
  await notion.blocks.children.append({
    block_id: pageId,
    children
  });
}

async function appendWithFallbackPage({ notion, preferredPageId, children }) {
  try {
    await appendCheckpoint(notion, preferredPageId, children);
    return { pageId: preferredPageId, source: "configured-or-state" };
  } catch (error) {
    if (!isNotionObjectNotFound(error)) throw error;
  }

  const discovered = await discoverNotionCheckpointPage(notion);
  if (!discovered?.id) throw new Error("No accessible Notion page discovered for checkpoint replay.");

  await appendCheckpoint(notion, discovered.id, children);
  return { pageId: discovered.id, source: discovered.source, title: discovered.title };
}

async function run() {
  const env = { ...parseEnvFile(envPath), ...process.env };
  const token = cleanValue(env.NOTION_TOKEN);
  const explicitPage = cleanValue(env.PROJECT2_NOTION_CHECKPOINT_PAGE_ID);
  const state = readJson(notionStatePath);
  const queueState = readJson(notionQueuePath);
  const legacyQueueState = readJson(legacyNotionQueuePath);
  const latestStatus = readJson(latestStatusPath);

  const defaultPageId = cleanValue(explicitPage || state?.page_id || latestStatus?.notion_checkpoint?.page_id);
  if (!token) throw new Error("NOTION_TOKEN is missing.");
  if (!defaultPageId) throw new Error("No Notion checkpoint page id is available.");

  const blockersMdExists = fs.existsSync(latestBlockersPath);
  const blockersRef = blockersMdExists
    ? path.relative(root, latestBlockersPath).replaceAll("\\", "/")
    : "data/project-2/blockers/latest-blockers.md";

  const launchReady = latestStatus?.launch_ready ? "YES" : "NO";
  const passed = Number(latestStatus?.passed_gates ?? 0);
  const total = Number(latestStatus?.total_gates ?? 0);

  const queue = mergeQueueStates(queueState, legacyQueueState);
  const pendingIndexes = [];
  for (let i = 0; i < queue.length; i += 1) {
    if (String(queue[i]?.status || "") === "pending_retry") pendingIndexes.push(i);
  }

  const notion = new Client({ auth: token });

  let attempted = 0;
  let synced = 0;
  let lastSyncedPageId = null;
  let pageSource = "configured-or-state";

  if (!pendingIndexes.length) {
    const children = buildChildren({
      launchReady,
      passed,
      total,
      runSummary: latestStatus?.run_summary,
      driveManifest: latestStatus?.drive_manifest,
      blockersRef,
      runSlug: null
    });
    const appendResult = await appendWithFallbackPage({ notion, preferredPageId: defaultPageId, children });
    attempted = 1;
    synced = 1;
    lastSyncedPageId = appendResult.pageId;
    pageSource = appendResult.source || pageSource;
  } else {
    for (const index of pendingIndexes) {
      const item = queue[index] || {};
      const targetPageId = cleanValue(item.page_id || defaultPageId);
      const children = buildChildren({
        launchReady,
        passed,
        total,
        runSummary: latestStatus?.run_summary,
        driveManifest: latestStatus?.drive_manifest,
        blockersRef,
        runSlug: item.run_slug || null
      });

      attempted += 1;
      try {
        const appendResult = await appendWithFallbackPage({ notion, preferredPageId: targetPageId, children });
        synced += 1;
        lastSyncedPageId = appendResult.pageId;
        pageSource = appendResult.source || pageSource;
        queue[index] = {
          ...item,
          page_id: appendResult.pageId,
          status: "synced",
          synced_at_utc: utcNow(),
          last_error: null
        };
      } catch (error) {
        queue[index] = {
          ...item,
          status: "pending_retry",
          last_attempt_utc: utcNow(),
          last_error: error?.message || String(error)
        };
        writeQueueState(queue);
        throw error;
      }
    }
  }

  writeQueueState(queue);

  const resolvedPageId = lastSyncedPageId || defaultPageId;
  writeJson(notionStatePath, {
    updated_at_utc: utcNow(),
    page_id: resolvedPageId,
    source: pageSource
  });

  const out = {
    status: "ok",
    page_id: resolvedPageId,
    page_url: `https://www.notion.so/${normalizeNotionId(resolvedPageId)}`,
    replayed_at_utc: utcNow(),
    attempted,
    synced,
    pending_remaining: queue.filter((item) => String(item?.status || "") === "pending_retry").length
  };
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exit(1);
});
