import fs from "node:fs";
import path from "node:path";
import { Client } from "@notionhq/client";
import { runVerification } from "./project2_launch_gate_verify.mjs";

const root = process.cwd();
const envPath = path.join(root, ".env");
const defaultNotionCheckpointPageId = "3211b447cb62811e8c26f59c0c64debd";
const launchPackDir = path.join(root, "docs", "project-2-launch-pack");
const driveManifestPath = path.join(root, "data", "project-2", "drive-artifacts", "manifest.json");
const runsDir = path.join(root, "data", "project-2", "runs");
const blockersDir = path.join(root, "data", "project-2", "blockers");
const notionDir = path.join(root, "data", "project-2", "notion");
const notionTargetStatePath = path.join(notionDir, "checkpoint-target.json");
const notionQueuePath = path.join(notionDir, "pending-sync-queue.json");
const legacyNotionQueuePath = path.join(notionDir, "checkpoint-retry-queue.json");
const latestStatusPath = path.join(root, "data", "project-2", "evidence", "latest-status.json");

const ownerByPath = [
  { match: "landing-page", owner: "Atlas", nextAction: "Connect live landing endpoint and validate schema in staging." },
  { match: "n8n", owner: "Ayub", nextAction: "Import workflow and activate in n8n with production credentials." },
  { match: "crm-sync", owner: "Ayub", nextAction: "Run 100-record CRM sync dry-run and store evidence." },
  { match: "outreach", owner: "Atlas", nextAction: "Map sequence assignment to CRM stage transitions." },
  { match: "kpi", owner: "Prime", nextAction: "Enable daily KPI ingestion and drift alerts." },
  { match: "sop", owner: "Sygma", nextAction: "Enforce owner/status/next-action fields for all blockers." }
];

const gateByFolder = {
  "landing-page": "landing_page_package_ready",
  "n8n": "n8n_workflow_active",
  "crm-sync": "crm_sync_dry_run_100_records",
  "outreach": "outreach_stage_transition_mapping",
  "kpi": "kpi_daily_feed_and_drift_alert",
  "sop": "sop_handoff_fields_present"
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

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

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files.sort();
}

function selectOwner(fullPath) {
  const hit = ownerByPath.find((rule) => fullPath.includes(`${path.sep}${rule.match}${path.sep}`));
  if (!hit) return { owner: "Abdi", nextAction: "Review and approve for launch gate." };
  return { owner: hit.owner, nextAction: hit.nextAction };
}

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeNotionId(id) {
  return cleanValue(id).replace(/-/g, "");
}

function formatNotionUrl(id) {
  const clean = normalizeNotionId(id);
  return clean ? `https://www.notion.so/${clean}` : "";
}

function isNotionObjectNotFound(error) {
  return String(error?.code || "").toLowerCase() === "object_not_found"
    || String(error?.message || "").includes("Could not find block with ID");
}

function notionRecoveryHint(reason) {
  if (String(reason || "").includes("Could not find block with ID")) {
    return "Auto-discovery could not find an accessible Notion page. Share a checkpoint page with this integration or set PROJECT2_NOTION_CHECKPOINT_PAGE_ID to an accessible page.";
  }
  if (String(reason || "").toLowerCase().includes("unauthorized")) {
    return "NOTION_TOKEN is invalid or lacks access. Rotate token and re-run.";
  }
  if (String(reason || "").toLowerCase().includes("fetch failed")) {
    return "Runtime cannot reach Notion API. Run `npm run project2:notion:replay` in a network-enabled environment.";
  }
  return "Retry Notion publish with current fallback payload and verify integration access.";
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
    if (page) {
      return { id: page.id, title: pageTitleFromSearchResult(page), source: `search:${query}` };
    }
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

function folderFromPath(fullPath) {
  const normalized = fullPath.replaceAll("\\", "/");
  const marker = "/docs/project-2-launch-pack/";
  const idx = normalized.indexOf(marker);
  if (idx === -1) return null;
  const rel = normalized.slice(idx + marker.length);
  return rel.split("/")[0] || null;
}

function gateMapFromResult(gateResult) {
  const map = {};
  for (const gate of gateResult.gates || []) map[gate.key] = gate;
  return map;
}

function gateStatusForArtifact(fullPath, gateMap) {
  const folder = folderFromPath(fullPath);
  const gateKey = folder ? gateByFolder[folder] : null;
  if (!gateKey) return { status: "In Progress", detail: "No direct launch gate mapping." };
  const gate = gateMap[gateKey];
  if (!gate) return { status: "In Progress", detail: "Gate status unavailable." };
  return { status: gate.passed ? "Done" : "Blocked", detail: gate.details };
}

function blockerOwner(gateKey) {
  if (gateKey.includes("kpi")) return "Prime";
  if (gateKey.includes("outreach") || gateKey.includes("landing")) return "Atlas";
  if (gateKey.includes("sop")) return "Sygma";
  return "Ayub";
}

function writeNotionFallback({ now, slug, pageId, reason, runSummaryPath, manifestPath }) {
  ensureDir(notionDir);
  const fallback = {
    generated_at_utc: now,
    page_id: pageId,
    page_url: `https://www.notion.so/${String(pageId || "").replace(/-/g, "")}`,
    status: "pending_sync",
    reason,
    run_summary: path.relative(root, runSummaryPath).replaceAll("\\", "/"),
    drive_manifest: path.relative(root, manifestPath).replaceAll("\\", "/")
  };

  const timestampedPath = path.join(notionDir, `checkpoint-payload-${slug}.json`);
  const latestPath = path.join(notionDir, "latest-checkpoint-payload.json");
  fs.writeFileSync(timestampedPath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  fs.writeFileSync(latestPath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  return {
    timestamped: path.relative(root, timestampedPath).replaceAll("\\", "/"),
    latest: path.relative(root, latestPath).replaceAll("\\", "/")
  };
}


function isTransientNotionConnectivityError(reason) {
  const value = String(reason || "").toLowerCase();
  return value.includes("fetch failed")
    || value.includes("network")
    || value.includes("timeout")
    || value.includes("etimedout")
    || value.includes("enotfound")
    || value.includes("econnrefused")
    || value.includes("eai_again");
}

function queueNotionCheckpointForRetry({ now, slug, pageId, reason, fallbackPaths }) {
  ensureDir(notionDir);
  const current = readJsonIfExists(notionQueuePath);
  const queue = Array.isArray(current?.queue) ? current.queue : [];
  const normalizedPageId = normalizeNotionId(pageId);

  const existingPending = queue.find((item) => String(item?.status || "") === "pending_retry"
    && normalizeNotionId(item?.page_id) === normalizedPageId);

  const filteredQueue = queue.filter((item) => {
    const samePendingPage = String(item?.status || "") === "pending_retry"
      && normalizeNotionId(item?.page_id) === normalizedPageId;
    return !samePendingPage;
  });

  filteredQueue.push({
    ...(existingPending || {}),
    queued_at_utc: now,
    run_slug: slug,
    page_id: pageId,
    reason,
    fallback_timestamped: fallbackPaths?.timestamped || null,
    fallback_latest: fallbackPaths?.latest || null,
    status: "pending_retry"
  });

  const payload = {
    updated_at_utc: now,
    queue: filteredQueue
  };
  writeJson(notionQueuePath, payload);
  writeJson(legacyNotionQueuePath, payload);
  return {
    queue_path: path.relative(root, notionQueuePath).replaceAll("\\", "/"),
    pending_count: filteredQueue.filter((item) => String(item?.status || "") === "pending_retry").length
  };
}
function writeBlockers(now, slug, gateResult, extraBlockers = []) {
  ensureDir(blockersDir);
  const gateBlockers = (gateResult.gates || []).filter((g) => !g.passed).map((g) => ({
    key: g.key,
    name: g.name,
    details: g.details,
    owner: blockerOwner(g.key)
  }));

  const blockers = [...gateBlockers, ...extraBlockers];
  const completed = (gateResult.gates || []).filter((g) => g.passed);

  const blockerJson = {
    generated_at_utc: now,
    launch_ready: gateResult.launch_ready,
    passed_gates: completed.length,
    total_gates: (gateResult.gates || []).length,
    completed_this_run: completed.map((g) => ({
      key: g.key,
      name: g.name,
      details: g.details
    })),
    active_blockers: blockers.map((b) => ({
      key: b.key,
      name: b.name,
      details: b.details,
      owner: b.owner || "Abdi"
    }))
  };

  const timestampedJsonPath = path.join(blockersDir, `blockers-${slug}.json`);
  const timestampedMdPath = path.join(blockersDir, `blockers-${slug}.md`);
  const latestJsonPath = path.join(blockersDir, "latest-blockers.json");
  const latestMdPath = path.join(blockersDir, "latest-blockers.md");

  const blockerMdLines = [
    `# Project #2 Blocker Register (${now})`,
    "",
    "## Completed This Run",
    ...(completed.length ? completed.map((g) => `- ${g.name}`) : ["- No additional gates cleared this run."]),
    "- Refreshed launch pack artifact inventory.",
    "- Regenerated Drive artifact manifest for sync/import.",
    "- Evaluated launch gates with evidence snapshots.",
    "",
    "## Active Blockers",
    ...(blockers.length
      ? blockers.flatMap((b, i) => [
          `${i + 1}. **${b.name}** (${b.owner || "Abdi"})`,
          `   - Reason: ${b.details}`
        ])
      : ["1. None"]),
    "",
    "## Next Actions",
    ...(blockers.length ? blockers.map((b, i) => `${i + 1}. ${b.details}`) : ["1. Launch gate is clear. Proceed to sign-off."]),
    ""
  ];

  const blockerJsonContent = `${JSON.stringify(blockerJson, null, 2)}\n`;
  const blockerMdContent = `${blockerMdLines.join("\n")}\n`;
  fs.writeFileSync(timestampedJsonPath, blockerJsonContent, "utf8");
  fs.writeFileSync(timestampedMdPath, blockerMdContent, "utf8");
  fs.writeFileSync(latestJsonPath, blockerJsonContent, "utf8");
  fs.writeFileSync(latestMdPath, blockerMdContent, "utf8");

  return {
    timestamped_json: path.relative(root, timestampedJsonPath).replaceAll("\\", "/"),
    timestamped_md: path.relative(root, timestampedMdPath).replaceAll("\\", "/"),
    latest_json: path.relative(root, latestJsonPath).replaceAll("\\", "/"),
    latest_md: path.relative(root, latestMdPath).replaceAll("\\", "/")
  };
}

async function postNotionCheckpoint({ env, gateResult, blockerFiles, runSummaryPath, manifestPath }) {
  const token = cleanValue(env.NOTION_TOKEN);
  const pageId = cleanValue(env.PROJECT2_NOTION_CHECKPOINT_PAGE_ID || defaultNotionCheckpointPageId);
  if (!token || !pageId) {
    return { skipped: true, reason: "NOTION_TOKEN or checkpoint page id missing." };
  }

  const blockers = (gateResult.gates || []).filter((g) => !g.passed);
  const completed = (gateResult.gates || []).filter((g) => g.passed);
  const notion = new Client({ auth: token });

  const children = [
    {
      object: "block",
      type: "heading_3",
      heading_3: { rich_text: [{ type: "text", text: { content: `Strike Build Checkpoint ${utcNow()}` } }] }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Launch Ready: ${gateResult.launch_ready ? "YES" : "NO"}` } }] }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Gates Passed: ${completed.length}/${(gateResult.gates || []).length}` } }] }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Run Summary: ${path.relative(root, runSummaryPath).replaceAll("\\", "/")}` } }] }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Drive Manifest: ${path.relative(root, manifestPath).replaceAll("\\", "/")}` } }] }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Blocker Register: ${blockerFiles.latest_md}` } }] }
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{
          type: "text",
          text: {
            content: blockers.length
              ? blockers.map((b, i) => `${i + 1}) ${b.name}: ${b.details}`).join(" | ")
              : "No active blockers."
          }
        }]
      }
    }
  ];

  const appendWithRetry = async (targetPageId) => {
    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await notion.blocks.children.append({
          block_id: targetPageId,
          children
        });
        return null;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) await sleep(attempt * 1000);
      }
    }
    return lastError;
  };

  const cachedTarget = readJsonIfExists(notionTargetStatePath);
  const candidates = [];
  for (const candidateId of [pageId, cachedTarget?.page_id]) {
    const clean = cleanValue(candidateId);
    if (!clean) continue;
    if (!candidates.includes(clean)) candidates.push(clean);
  }

  let resolvedPageId = null;
  let resolvedSource = null;
  let lastError = null;

  for (const candidate of candidates) {
    const error = await appendWithRetry(candidate);
    if (!error) {
      resolvedPageId = candidate;
      resolvedSource = candidate === pageId ? "configured-page-id" : "cached-page-id";
      break;
    }
    lastError = error;
    if (!isNotionObjectNotFound(error)) throw error;
  }

  if (!resolvedPageId) {
    const discovered = await discoverNotionCheckpointPage(notion);
    if (discovered?.id) {
      const error = await appendWithRetry(discovered.id);
      if (!error) {
        resolvedPageId = discovered.id;
        resolvedSource = discovered.source;
      } else {
        lastError = error;
      }
    }
  }

  if (!resolvedPageId) throw lastError || new Error("Notion checkpoint page resolution failed.");

  writeJson(notionTargetStatePath, {
    updated_at_utc: utcNow(),
    page_id: resolvedPageId,
    source: resolvedSource
  });

  return {
    skipped: false,
    page_id: resolvedPageId,
    page_url: formatNotionUrl(resolvedPageId),
    source: resolvedSource
  };
}

async function run() {
  const runStartMs = Date.now();
  ensureDir(path.dirname(driveManifestPath));
  ensureDir(runsDir);
  ensureDir(blockersDir);

  if (!fs.existsSync(launchPackDir)) {
    throw new Error(`Launch pack directory missing: ${launchPackDir}`);
  }

  const env = { ...parseEnvFile(envPath), ...process.env };
  const gateResult = await runVerification();
  const gateMap = gateMapFromResult(gateResult);
  const checkpointPageId = cleanValue(env.PROJECT2_NOTION_CHECKPOINT_PAGE_ID || defaultNotionCheckpointPageId);

  const files = listFiles(launchPackDir);
  const now = utcNow();
  const slug = now.replace(/[-:TZ]/g, "").slice(0, 14);

  const artifacts = files.map((fullPath) => {
    const stat = fs.statSync(fullPath);
    const { owner, nextAction } = selectOwner(fullPath);
    const gateState = gateStatusForArtifact(fullPath, gateMap);
    return {
      path: fullPath,
      relative_path: path.relative(root, fullPath).replaceAll("\\", "/"),
      bytes: stat.size,
      last_write_utc: stat.mtime.toISOString().replace(/\.\d{3}Z$/, "Z"),
      owner,
      status: gateState.status,
      next_action: gateState.status === "Done" ? "Monitor in daily ops cadence." : nextAction,
      gate_detail: gateState.detail
    };
  });

  const reportJsonPath = path.join(root, gateResult.report_json);
  const reportMdPath = path.join(root, gateResult.report_md);
  for (const reportPath of [reportJsonPath, reportMdPath]) {
    if (!fs.existsSync(reportPath)) continue;
    const stat = fs.statSync(reportPath);
    artifacts.push({
      path: reportPath,
      relative_path: path.relative(root, reportPath).replaceAll("\\", "/"),
      bytes: stat.size,
      last_write_utc: stat.mtime.toISOString().replace(/\.\d{3}Z$/, "Z"),
      owner: "Abdi",
      status: "Done",
      next_action: "Post launch-gate evidence to Notion HQ.",
      gate_detail: "Generated this run."
    });
  }

  const completed = (gateResult.gates || []).filter((g) => g.passed);
  const runSummaryPath = path.join(runsDir, `run-${slug}.md`);

  let notionCheckpoint = { skipped: true, reason: "Not attempted." };
  try {
    notionCheckpoint = await postNotionCheckpoint({
      env,
      gateResult,
      blockerFiles: { latest_md: "data/project-2/blockers/latest-blockers.md" },
      runSummaryPath,
      manifestPath: driveManifestPath
    });
  } catch (error) {
    notionCheckpoint = { skipped: true, reason: error?.message || String(error) };
  }

  const operationalBlockers = [];
  let notionDeferredSync = null;
  let notionFallback = null;
  if (notionCheckpoint.skipped) {
  notionFallback = writeNotionFallback({
    now,
    slug,
    pageId: checkpointPageId,
    reason: notionCheckpoint.reason || "Notion checkpoint failed.",
    runSummaryPath,
    manifestPath: driveManifestPath
  });
  notionDeferredSync = queueNotionCheckpointForRetry({
    now,
    slug,
    pageId: checkpointPageId,
    reason: notionCheckpoint.reason || "unknown",
    fallbackPaths: notionFallback
  });
  const transientFailure = isTransientNotionConnectivityError(notionCheckpoint.reason);
  const actionPrefix = transientFailure
    ? "Deferred sync due runtime connectivity."
    : "Sync failed and requires credential/page access remediation.";
  operationalBlockers.push({
    key: "notion_checkpoint_publish",
    name: transientFailure
      ? "Notion HQ checkpoint sync deferred"
      : "Notion HQ checkpoint publish failed",
    details: `${actionPrefix} ${notionRecoveryHint(notionCheckpoint.reason)} Fallback payload: ${notionFallback.latest}. Reason: ${notionCheckpoint.reason || "unknown"}.`,
    owner: "Abdi"
  });
}

const blockerFiles = writeBlockers(now, slug, gateResult, operationalBlockers);
  for (const blockerRelPath of Object.values(blockerFiles)) {
    const blockerPath = path.join(root, blockerRelPath);
    if (!fs.existsSync(blockerPath)) continue;
    const stat = fs.statSync(blockerPath);
    artifacts.push({
      path: blockerPath,
      relative_path: path.relative(root, blockerPath).replaceAll("\\", "/"),
      bytes: stat.size,
      last_write_utc: stat.mtime.toISOString().replace(/\.\d{3}Z$/, "Z"),
      owner: "Abdi",
      status: "Done",
      next_action: "Share blocker register with owners and track closure.",
      gate_detail: "Generated this run."
    });
  }

  if (notionFallback) {
    for (const fallbackRelPath of [notionFallback.timestamped, notionFallback.latest]) {
      const fallbackPath = path.join(root, fallbackRelPath);
      if (!fs.existsSync(fallbackPath)) continue;
      const stat = fs.statSync(fallbackPath);
      artifacts.push({
        path: fallbackPath,
        relative_path: path.relative(root, fallbackPath).replaceAll("\\", "/"),
        bytes: stat.size,
        last_write_utc: stat.mtime.toISOString().replace(/\.\d{3}Z$/, "Z"),
        owner: "Abdi",
        status: operationalBlockers.length ? "Blocked" : "In Progress",
        next_action: "Retry Notion HQ checkpoint publish using fallback payload.",
        gate_detail: notionCheckpoint.reason || "Notion checkpoint publish failed."
      });
    }
  }


  const blockers = [
    ...(gateResult.gates || []).filter((g) => !g.passed).map((g) => ({ name: g.name, details: g.details })),
    ...operationalBlockers.map((b) => ({ name: b.name, details: b.details }))
  ];

  const runSummary = [
    `# Project #2 Strike Build Run Summary (${now})`,
    "",
    `- Launch Ready: **${gateResult.launch_ready ? "YES" : "NO"}**`,
    `- Gates Passed: ${completed.length}/${(gateResult.gates || []).length}`,
    `- Gate Report: \`${gateResult.report_md}\``,
    `- Blocker Register: \`${blockerFiles.latest_md}\``,
    "",
    "## Completed This Run",
    ...(completed.length ? completed.map((g) => `- ${g.name} (${g.details})`) : ["- No additional gates cleared this run."]),
    "- Refreshed launch pack artifact inventory.",
    "- Regenerated Drive artifact manifest for sync/import.",
    "- Generated launch gate evidence (JSON + Markdown).",
    "- Generated blocker register (timestamped + latest).",
    ...(notionFallback ? [`- Generated Notion fallback payload: \`${notionFallback.latest}\`.`] : ["- Published Notion HQ checkpoint update."]),
    "",
    "## Active Blockers",
    ...(blockers.length ? blockers.map((b, i) => `${i + 1}. ${b.name} - ${b.details}`) : ["1. None"]),
    "",
    "## Next Actions",
    ...(blockers.length ? blockers.map((b, i) => `${i + 1}. ${b.details}`) : ["1. Monitor production for 24h and prepare launch sign-off."]),
    ""
  ].join("\n");
  fs.writeFileSync(runSummaryPath, runSummary, "utf8");

  const manifest = {
    generated_at_utc: now,
    project: "Task Enterprise Project #2 Strike Build",
    launch_ready: gateResult.launch_ready,
    passed_gates: gateResult.passed_count,
    total_gates: (gateResult.gates || []).length,
    report_json: gateResult.report_json,
    report_md: gateResult.report_md,
    blocker_latest_json: blockerFiles.latest_json,
    blocker_latest_md: blockerFiles.latest_md,
    artifact_count: artifacts.length,
    artifacts
  };
  fs.writeFileSync(driveManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const latestStatus = {
    checked_at_utc: now,
    launch_ready: gateResult.launch_ready,
    passed_gates: completed.length,
    total_gates: (gateResult.gates || []).length,
    report_json: gateResult.report_json,
    report_md: gateResult.report_md,
    blocker_latest_json: blockerFiles.latest_json,
    blocker_latest_md: blockerFiles.latest_md,
    run_summary: path.relative(root, runSummaryPath).replaceAll("\\", "/"),
    drive_manifest: path.relative(root, driveManifestPath).replaceAll("\\", "/"),
    notion_checkpoint: notionCheckpoint,
    gates: gateResult.gates
  };
  ensureDir(path.dirname(latestStatusPath));
  fs.writeFileSync(latestStatusPath, `${JSON.stringify(latestStatus, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({
    manifest: driveManifestPath,
    runSummary: runSummaryPath,
    blockerLatest: path.join(root, blockerFiles.latest_md),
    launchReady: gateResult.launch_ready,
    passedGates: completed.length,
    totalGates: (gateResult.gates || []).length,
    blockers: blockers.map((b) => b.details),
    notionCheckpoint,
    notionFallback
  })}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exit(1);
});











