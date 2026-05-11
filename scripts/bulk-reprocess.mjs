// Bulk reprocess all conversations using heuristic path (no LLM, uses force: true).
// Run: node scripts/bulk-reprocess.mjs
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable LLM keys so maybeSummarizeWithLlm returns null instantly
process.env.DAME_OPENROUTER_API_KEY = "";
process.env.AYUB_OPENROUTER_API_KEY = "";
process.env.C2_DATA_DIR = path.resolve(__dirname, "../data/c2");

const storeFile = path.resolve(__dirname, "../data/c2/conversation-intelligence.json");
const store = JSON.parse(fs.readFileSync(storeFile, "utf8"));

console.log(`Reprocessing ${store.conversations.length} conversations (heuristic, no LLM)...`);

const { ConversationIntelligenceService } = await import(
  pathToFileURL(path.resolve(__dirname, "../dist/services/conversation-intelligence-service.js")).href
);

let success = 0, skipped = 0;

for (const conv of store.conversations) {
  try {
    const result = await ConversationIntelligenceService.reprocessConversationHeuristic(conv.file);
    if (result) {
      success++;
      if (success % 20 === 0) console.log(`  ${success} done...`);
    } else {
      skipped++;
    }
  } catch (err) {
    skipped++;
    console.error(`  FAIL: ${path.basename(conv.file)} — ${err?.message?.slice(0, 60)}`);
  }
}

const updated = JSON.parse(fs.readFileSync(storeFile, "utf8"));
console.log(`\nDone. Updated: ${success}, Skipped/missing: ${skipped}`);
console.log("\nSample titles:");
for (const conv of updated.conversations.slice(0, 12)) {
  console.log(`  [${conv.source}] ${conv.title}`);
}
