const assert = require("assert");
const path = require("path");

const { __conversationParser } = require(path.join(__dirname, "..", "dist", "services", "claude-conversations-service.js"));

function runClaudeFixture() {
  const fixture = [
    JSON.stringify({
      type: "attachment",
      attachment: {
        type: "hook_additional_context",
        content: ["launching skill: something noisy"],
      },
      timestamp: "2026-04-23T19:17:25.000Z",
    }),
    JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: "Install this repo and use it- https://github.com/thedotmack/claude-mem" }],
      },
      timestamp: "2026-04-23T19:17:23.666Z",
    }),
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "I'll clone and install the `claude-mem` repo now." }],
      },
      timestamp: "2026-04-23T19:17:27.916Z",
    }),
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", name: "Bash" }],
      },
      timestamp: "2026-04-23T19:17:28.000Z",
    }),
  ].join("\n");

  const messages = __conversationParser.parseMessages(fixture);
  assert.equal(messages.length, 2, "Claude fixture should keep only readable conversation messages.");
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].text, "Install this repo and use it- https://github.com/thedotmack/claude-mem");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].text, "I'll clone and install the `claude-mem` repo now.");
}

function runCodexFixture() {
  const fixture = [
    JSON.stringify({
      timestamp: "2026-03-10T05:32:22.047Z",
      type: "session_meta",
      payload: { cwd: "C:\\Users\\offic\\Documents\\Codex" },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T05:32:22.055Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "# AGENTS.md instructions for C:\\Users\\offic\\Documents\\Codex" }],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T05:32:22.057Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "r u connected to my mcp server now?\n" }],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T05:32:22.058Z",
      type: "event_msg",
      payload: { type: "user_message", message: "r u connected to my mcp server now?\n" },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T05:32:26.581Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Not necessarily. I don't currently see an explicit MCP connection." }],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-10T05:32:27.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: "{\"timestamp\":\"2026-03-10T05:32:26.999Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"function_call_output\",\"call_id\":\"abc\",\"output\":\"noisy\"}}",
        }],
      },
    }),
  ].join("\n");

  const messages = __conversationParser.parseMessages(fixture);
  assert.equal(messages.length, 2, "Codex fixture should skip setup noise and duplicate event echos.");
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].text, "r u connected to my mcp server now?");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].text, "Not necessarily. I don't currently see an explicit MCP connection.");
}

function runTruncatedJsonFixture() {
  const fixture = [
    "{\"timestamp\":\"2026-04-29T19:40:29.168Z\",\"type\":\"response_item\"",
    "assistant: this is readable",
  ].join("\n");

  const messages = __conversationParser.parseMessages(fixture);
  assert.equal(messages.length, 1, "Malformed JSON fragments should be ignored rather than shown as transcript text.");
  assert.equal(messages[0].text, "this is readable");
}

runClaudeFixture();
runCodexFixture();
runTruncatedJsonFixture();

console.log("Conversation parser verification passed.");
