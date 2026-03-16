#!/usr/bin/env node

/**
 * Local stdio entry point for Codex Windows app
 *
 * Usage:
 *   npm run start:stdio
 *   or
 *   node dist/index-stdio.js
 *
 * This starts the MCP server in stdio mode for local Codex integration.
 * The Codex app communicates with this process via JSON-RPC on stdin/stdout.
 */

import { createStdioTransport } from "./core/stdio";

async function main() {
  try {
    await createStdioTransport();
    // The server will run until the parent process (Codex) closes stdin
  } catch (err) {
    console.error("Fatal error starting stdio transport:", err);
    process.exit(1);
  }
}

main();
