/**
 * test-screen-visibility.mjs
 * Tests that every agent can capture and describe the screen.
 * Requires the HTTP server to be running: npm run dev:http
 */

const BASE_URL = process.env.MCP_URL || "http://localhost:3000";
const AGENTS = ["Abdi", "Ahmed", "Dame", "Rex", "Prime", "Atlas", "Ayub", "Sygma"];
const TASK = "Use desktop_get_screen_base64 to capture a screenshot of my screen right now. Describe exactly what you see — applications open, content visible, anything notable. Be specific.";

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, body: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, body: { raw: text } }; }
}

async function checkServerHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function testScreenCaptureTool() {
  const res = await post("/api/tools/desktop_get_screen_base64", {
    arguments: { scale: 1280, quality: 60 }
  });
  if (!res.ok) return { ok: false, error: res.body?.error || `HTTP ${res.status}` };
  const result = res.body?.result;
  if (!result?.base64) return { ok: false, error: "No base64 in result" };
  return {
    ok: true,
    width: result.width,
    height: result.height,
    base64_len: result.base64.length,
  };
}

async function testAgent(name) {
  const res = await post("/api/tools/ask_agent", {
    arguments: { name, task: TASK }
  });
  if (!res.ok) return { ok: false, error: res.body?.error || `HTTP ${res.status}` };
  const result = res.body?.result;
  if (!result) return { ok: false, error: "No result returned" };
  if (result.status === "error") return { ok: false, error: result.message };
  return { ok: true, response: result.message };
}

function truncate(str, max = 300) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

async function run() {
  console.log(`\n${BOLD}${CYAN}=== Screen Visibility Test ===${RESET}`);
  console.log(`Target: ${BASE_URL}\n`);

  // Check server
  const alive = await checkServerHealth();
  if (!alive) {
    console.error(`${RED}Server not reachable at ${BASE_URL}${RESET}`);
    console.error(`Start it with: npm run dev:http`);
    process.exit(1);
  }
  console.log(`${GREEN}Server: online${RESET}\n`);

  // Test raw tool first
  process.stdout.write(`${BOLD}[TOOL]${RESET} desktop_get_screen_base64 ... `);
  const toolTest = await testScreenCaptureTool();
  if (toolTest.ok) {
    console.log(`${GREEN}PASS${RESET} — ${toolTest.width}x${toolTest.height}, base64 len=${toolTest.base64_len}`);
  } else {
    console.log(`${RED}FAIL${RESET} — ${toolTest.error}`);
    console.error("\nScreen capture tool failed. Ensure the server is running on Windows (not in Docker).");
    process.exit(1);
  }

  console.log(`\n${BOLD}Testing each agent (this will make LLM API calls)...${RESET}\n`);

  const results = [];
  for (const name of AGENTS) {
    process.stdout.write(`${BOLD}[${name}]${RESET} asking to describe screen ... `);
    try {
      const r = await testAgent(name);
      if (r.ok) {
        console.log(`${GREEN}PASS${RESET}`);
        console.log(`  ${CYAN}→${RESET} ${truncate(r.response)}\n`);
      } else {
        console.log(`${YELLOW}SKIP/ERROR${RESET} — ${truncate(r.error, 120)}\n`);
      }
      results.push({ name, ...r });
    } catch (err) {
      console.log(`${RED}FAIL${RESET} — ${err.message}\n`);
      results.push({ name, ok: false, error: err.message });
    }
  }

  // Summary
  const passed = results.filter(r => r.ok).length;
  const skipped = results.filter(r => !r.ok && (r.error?.includes("API key") || r.error?.includes("missing a valid"))).length;
  const failed = results.length - passed - skipped;

  console.log(`${BOLD}=== Summary ===${RESET}`);
  console.log(`${GREEN}Passed:${RESET}  ${passed}/${AGENTS.length}`);
  console.log(`${YELLOW}Skipped:${RESET} ${skipped} (no API key configured)`);
  if (failed > 0) console.log(`${RED}Failed:${RESET}  ${failed}`);

  for (const r of results) {
    const icon = r.ok ? `${GREEN}✓${RESET}` : r.error?.includes("API key") || r.error?.includes("missing a valid") ? `${YELLOW}–${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${r.name}`);
  }
  console.log();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
