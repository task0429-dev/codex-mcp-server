#!/usr/bin/env node
import { spawn } from "child_process";

const port = process.env.HTTP_PORT || "3499";
const host = process.env.HTTP_HOST || "127.0.0.1";
const baseUrl = `http://${host}:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await sleep(750);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.HTTP_API_KEY ? { "x-api-key": process.env.HTTP_API_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

const server = spawn("node", ["dist/index-http.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HTTP_PORT: port,
    HTTP_HOST: host,
    HTTP_API_KEY: "",
  },
  stdio: "inherit",
});

try {
  await waitFor(`${baseUrl}/health`);

  const proof = await getJson("/api/c2/v1/proof");
  const unified = await getJson("/api/c2/v1/unified");
  const agents = await getJson("/api/c2/v1/agents");
  const tools = await getJson("/api/c2/v1/tools");
  const monitoring = await getJson("/api/c2/v1/monitoring/overview");
  const rexDiagnostics = await getJson("/api/c2/v1/rex/diagnostics");
  const memory = await getJson("/api/c2/v1/memory/search?q=log&limit=5");
  const commandCenter = await getJson("/api/command-center");
  const rexChat = await postJson("/api/c2/v1/rex/chat", {
    message: "Summarize current monitoring risk.",
    context: "verification",
  });
  const rexAudit = await postJson("/api/c2/v1/rex/audit", {});

  const execution = await postJson("/api/c2/v1/executions", {
    toolId: "memory.search",
    agentId: "abdi",
    intent: "Verify live memory retrieval through the upgraded C2 backend.",
    payload: { q: "log", limit: 3, cursor: 0 },
  });

  const summary = {
    proofMounted: proof.data.mounted,
    unifiedMounted: unified.data.proof.mounted,
    routeCount: proof.data.routes.length,
    agentCount: agents.data.length,
    toolCount: tools.data.length,
    monitoringStatus: monitoring.data.overallStatus,
    rexAlerts: rexDiagnostics.data.alerts.length,
    rexReply: typeof rexChat.data.reply === "string" && rexChat.data.reply.length > 0,
    rexAuditOk: rexAudit.data.ok,
    memoryResults: memory.data.items.length,
    executionStatus: execution.data.status,
    commandCenterProofMounted: Boolean(commandCenter.c2Upgrade?.mounted),
  };

  console.log(JSON.stringify(summary, null, 2));
} finally {
  server.kill("SIGTERM");
}
