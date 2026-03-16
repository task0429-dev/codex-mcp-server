#!/usr/bin/env node

import { createHttpTransport } from "./core/http";
import { startAllAgentTelegramBridges } from "./services/agent-telegram-bridge";
import { logger } from "./core/logger";

async function checkRelay(): Promise<void> {
  const relayUrl = process.env.DESKTOP_RELAY_URL;
  if (!relayUrl) {
    logger.warn("relay_not_configured", { hint: "Set DESKTOP_RELAY_URL=http://host.docker.internal:3099 in .env" });
    return;
  }
  try {
    const res = await fetch(`${relayUrl}/health`, { signal: AbortSignal.timeout(5000) });
    const json = await res.json() as { ok?: boolean; platform?: string };
    if (json.ok) {
      logger.info("relay_connected", { url: relayUrl, platform: json.platform });
    } else {
      logger.warn("relay_unhealthy", { url: relayUrl });
    }
  } catch (err: any) {
    logger.warn("relay_unreachable", {
      url: relayUrl,
      message: err?.message,
      hint: "Make sure relay/relay.js (or start-relay.bat) is running on your Windows machine",
    });
  }
}

async function main() {
  try {
    await createHttpTransport();
    void checkRelay();
    startAllAgentTelegramBridges();
  } catch (err) {
    console.error("Fatal error starting HTTP transport:", err);
    process.exit(1);
  }
}

main();
