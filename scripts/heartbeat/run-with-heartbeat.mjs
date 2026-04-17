#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = { passthrough: [] };
  let commandMode = false;

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--") {
      commandMode = true;
      continue;
    }

    if (commandMode) {
      out.passthrough.push(token);
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = "true";
      } else {
        out[key] = next;
        i += 1;
      }
    }
  }

  return out;
}

async function sendHeartbeat(clientPath, mode, args) {
  const hbArgs = [clientPath, "--mode", mode];
  if (args.url) hbArgs.push("--url", args.url);
  if (args.token) hbArgs.push("--token", args.token);
  if (args.base) hbArgs.push("--base", args.base);
  if (args.msg) hbArgs.push("--msg", args.msg);

  await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, hbArgs, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`heartbeat-client exited with ${code}`));
    });
  });
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.passthrough.length) {
    throw new Error("Usage: node run-with-heartbeat.mjs --url <push-url> -- <command> [args...]");
  }

  const clientPath = fileURLToPath(new URL("./heartbeat-client.mjs", import.meta.url));

  try {
    await sendHeartbeat(clientPath, "start", { ...args, msg: args.start_msg || "start" });
  } catch (error) {
    process.stderr.write(`Heartbeat start failed: ${error.message}\n`);
  }

  const [cmd, ...cmdArgs] = args.passthrough;

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(Number(code || 0)));
  });

  if (exitCode === 0) {
    await sendHeartbeat(clientPath, "success", { ...args, msg: args.success_msg || "success" });
    process.exit(0);
  } else {
    await sendHeartbeat(clientPath, "fail", { ...args, msg: args.fail_msg || `exit-${exitCode}` });
    process.exit(exitCode);
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exit(1);
});
