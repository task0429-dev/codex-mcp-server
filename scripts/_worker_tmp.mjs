
process.env.C2_DATA_DIR = "C:\\Users\\offic\\Sync\\repos\\codex-mcp-server\\data\\c2";
const { pathToFileURL } = await import("url");
const { ConversationIntelligenceService } = await import(pathToFileURL("C:\\Users\\offic\\Sync\\repos\\codex-mcp-server\\dist\\services\\conversation-intelligence-service.js").href);
const result = await ConversationIntelligenceService.reprocessConversation("C:\\Users\\offic\\.codex\\sessions\\2026\\03\\26\\rollout-2026-03-26T19-17-39-019d2ca7-5f18-7251-9da5-96e2d018b3e1.jsonl");
if (result) process.stdout.write(JSON.stringify({ ok: true, title: result.title }) + "\n");
else process.stdout.write(JSON.stringify({ ok: false }) + "\n");
