/**
 * Microsoft Edge TTS client — uses the same WebSocket endpoint as the Edge browser's
 * Read Aloud feature. No API key required. Returns MP3 audio buffer.
 *
 * Voices: https://speech.microsoft.com/portal/voicegallery
 */
"use strict";

const { randomUUID } = require("crypto");
const { WebSocket } = require("undici");

const ENDPOINT =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
  "?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4" +
  "&ConnectionId=";

// Agent → Edge neural voice mapping
const AGENT_VOICES = {
  abdi:  "en-US-GuyNeural",        // confident, professional male
  ahmed: "en-US-ChristopherNeural",// calm, organised male
  dame:  "en-US-EricNeural",       // deep, calm male
  rex:   "en-US-BrandonNeural",    // strong, direct male
  prime: "en-US-RogerNeural",      // professional male
  ayub:  "en-US-SteffanNeural",    // energetic male
  atlas: "en-US-AndrewNeural",     // warm, marketing male
  sygma: "en-US-AriaNeural",       // natural female
};

function makeTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildMessage(headers, body) {
  return Object.entries(headers).map(([k, v]) => `${k}:${v}`).join("\r\n") + "\r\n\r\n" + body;
}

/**
 * Synthesise text via Edge TTS.
 * @param {string} text
 * @param {string} agentId
 * @param {number} ratePercent  e.g. 120 → "+20%"
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
function synthesize(text, agentId, ratePercent = 120) {
  return new Promise((resolve, reject) => {
    const voice = AGENT_VOICES[agentId.toLowerCase()] || "en-US-GuyNeural";
    const rateStr = ratePercent >= 100
      ? `+${ratePercent - 100}%`
      : `-${100 - ratePercent}%`;

    const connectionId = randomUUID().replace(/-/g, "");
    const url = ENDPOINT + connectionId;

    const ws = new WebSocket(url, {
      headers: {
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
      },
    });
    ws.binaryType = "arraybuffer";

    const audioChunks = [];
    let done = false;

    ws.addEventListener("open", () => {
      // 1. Send speech config
      ws.send(buildMessage(
        {
          "X-Timestamp": makeTimestamp(),
          "Content-Type": "application/json; charset=utf-8",
          "Path": "speech.config",
        },
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: "false", wordBoundaryEnabled: "false" },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        })
      ));

      // 2. Send SSML request
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>` +
        `<prosody rate='${rateStr}'>${text.replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]))}</prosody>` +
        `</voice></speak>`;

      ws.send(buildMessage(
        {
          "X-RequestId": randomUUID().replace(/-/g, ""),
          "Content-Type": "application/ssml+xml",
          "X-Timestamp": makeTimestamp(),
          "Path": "ssml",
        },
        ssml
      ));
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end") && !done) {
          done = true;
          ws.close();
          resolve(Buffer.concat(audioChunks));
        }
      } else {
        // Binary frame: first 2 bytes = header length (big-endian), rest = audio
        const buf = event.data instanceof ArrayBuffer
          ? Buffer.from(event.data)
          : Buffer.isBuffer(event.data) ? event.data : Buffer.from(event.data);
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          const headerStr = buf.slice(2, 2 + headerLen).toString();
          if (headerStr.includes("Path:audio")) {
            audioChunks.push(buf.slice(2 + headerLen));
          }
        }
      }
    });

    ws.addEventListener("error", (err) => {
      if (!done) { done = true; reject(new Error(String(err.message || err))); }
    });

    ws.addEventListener("close", () => {
      if (!done) { done = true; resolve(Buffer.concat(audioChunks)); }
    });

    // Timeout safety
    setTimeout(() => {
      if (!done) {
        done = true;
        ws.close();
        if (audioChunks.length > 0) resolve(Buffer.concat(audioChunks));
        else reject(new Error("Edge TTS timeout"));
      }
    }, 15000);
  });
}

module.exports = { synthesize, AGENT_VOICES };
