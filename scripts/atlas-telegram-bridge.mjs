import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const ENV_PATH = path.join(ROOT, ".env");
const STATE_DIR = path.join(ROOT, "data", "telegram", "atlas");
const STATE_PATH = path.join(STATE_DIR, "offset.json");

function parseEnv(filePath) {
  const out = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function loadOffset() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    return Number(parsed.offset) || 0;
  } catch {
    return 0;
  }
}

function saveOffset(offset) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ offset, updatedAt: new Date().toISOString() }, null, 2));
}

function replyFor(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t || t === "/start") {
    return "Atlas is online. Send /status to confirm health.";
  }
  if (t === "/status") {
    return "Atlas status: ONLINE. Telegram bridge active and responding.";
  }
  if (t === "/help") {
    return "Available commands: /status, /help.\nAtlas chat bridge is active.";
  }
  return "Atlas received your message. I am online and routing is active.";
}

async function main() {
  const env = parseEnv(ENV_PATH);
  const token = env.ATLAS_TELEGRAM_BOT_TOKEN;
  if (!token || token === "your_telegram_bot_token_here") {
    throw new Error("ATLAS_TELEGRAM_BOT_TOKEN missing in .env");
  }

  const base = `${env.TELEGRAM_API_BASE || "https://api.telegram.org"}/bot${token}`;
  let offset = loadOffset();
  console.log(`[atlas-telegram-bridge] started with offset ${offset}`);

  while (true) {
    try {
      const updatesResp = await fetch(`${base}/getUpdates?timeout=25&limit=20&offset=${offset}`);
      const updatesJson = await updatesResp.json();
      const updates = Array.isArray(updatesJson?.result) ? updatesJson.result : [];

      for (const u of updates) {
        const nextOffset = Number(u.update_id) + 1;
        if (nextOffset > offset) {
          offset = nextOffset;
          saveOffset(offset);
        }

        const msg = u.message;
        if (!msg || !msg.chat || typeof msg.chat.id === "undefined") continue;

        // Ignore bot-originated messages to avoid loops.
        if (msg.from?.is_bot) continue;

        const text = String(msg.text || "");
        const reply = replyFor(text);

        const sendResp = await fetch(`${base}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            text: reply,
            reply_to_message_id: msg.message_id
          })
        });
        const sendJson = await sendResp.json();
        if (!sendJson?.ok) {
          console.error("[atlas-telegram-bridge] sendMessage failed", sendJson);
        }
      }
    } catch (err) {
      console.error("[atlas-telegram-bridge] loop error", err?.message || err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((err) => {
  console.error("[atlas-telegram-bridge] fatal", err?.message || err);
  process.exit(1);
});
