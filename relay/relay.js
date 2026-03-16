/**
 * Task Enterprise – Windows Host Relay
 * Runs NATIVELY on Windows (outside Docker). The Docker container POSTs
 * PowerShell scripts here; this process executes them on the real Windows
 * desktop and returns stdout/stderr.
 *
 * Start: node relay/relay.js
 * Or double-click: relay/start-relay.bat
 */
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const edgeTts = require("./edge-tts");

const PORT = process.env.RELAY_PORT || 3099;

const server = http.createServer((req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, cors);
    return res.end(JSON.stringify({ ok: true, platform: process.platform }));
  }

  if (req.method === "POST" && req.url === "/execute") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let encodedScript, timeoutMs;
      try {
        ({ encodedScript, timeoutMs = 30000 } = JSON.parse(body));
      } catch (e) {
        res.writeHead(400, cors);
        return res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const child = spawn("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-STA",
        "-EncodedCommand",
        encodedScript,
      ]);

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      child.on("close", (code) => {
        clearTimeout(timer);
        res.writeHead(200, cors);
        res.end(
          JSON.stringify({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? 0,
            timedOut,
          })
        );
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        res.writeHead(500, cors);
        res.end(JSON.stringify({ error: err.message }));
      });
    });
    return;
  }

  // ── Google Translate TTS proxy — each agent gets a different locale for a distinct voice ──
  // Locales: en-US (US), en-GB (British), en-AU (Australian), en-IN (Indian), en-NG (Nigerian)
  // Combined with per-agent playbackRate in browser → each agent sounds unique
  const AGENT_LOCALES = {
    abdi:  "en-JM",   // Jamaican English
    ahmed: "en-IN",   // Indian English — calm, clear
    dame:  "en-GB",   // British English — professional
    rex:   "en-AU",   // Australian English — strong, direct
    prime: "en-US",   // American — standard
    ayub:  "en-IN",   // Indian English
    atlas: "en-GB",   // British — polished
    sygma: "en-AU",   // Australian English female
  };

  if (req.method === "POST" && req.url === "/tts-google") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let text, agentId;
      try { ({ text, agentId = "prime" } = JSON.parse(body)); } catch (e) {
        res.writeHead(400, cors); return res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      if (!text) { res.writeHead(400, cors); return res.end(JSON.stringify({ error: "Missing text" })); }

      const locale = AGENT_LOCALES[(agentId || "").toLowerCase().replace(/[^a-z]/g, "")] || "en-US";
      const encoded = encodeURIComponent(String(text).slice(0, 200));
      const options = {
        hostname: "translate.google.com",
        path: `/translate_tts?ie=UTF-8&q=${encoded}&tl=${locale}&client=tw-ob`,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
          Referer: "https://translate.google.com/",
        },
      };
      const upstream = https.request(options, (upRes) => {
        if (upRes.statusCode !== 200) {
          res.writeHead(upRes.statusCode, cors);
          return res.end(JSON.stringify({ error: `Google TTS ${upRes.statusCode}` }));
        }
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
        upRes.pipe(res);
      });
      upstream.on("error", (err) => { res.writeHead(500, cors); res.end(JSON.stringify({ error: err.message })); });
      upstream.end();
    });
    return;
  }

  // ── ttsmp3.com proxy — Amazon Polly neural voices, free, no API key ──
  if (req.method === "POST" && req.url === "/tts-polly") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let voice, text;
      try { ({ voice, text } = JSON.parse(body)); } catch (e) {
        res.writeHead(400, cors); return res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
      if (!text || !voice) {
        res.writeHead(400, cors); return res.end(JSON.stringify({ error: "Missing text or voice" }));
      }
      const postData = `msg=${encodeURIComponent(String(text).slice(0, 500))}&lang=${encodeURIComponent(voice)}&source=ttsmp3`;
      // Step 1: get MP3 URL from ttsmp3.com
      const step1 = https.request(
        { hostname: "ttsmp3.com", path: "/makemp3_new.php", method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData), "User-Agent": "Mozilla/5.0" } },
        (r1) => {
          let d = "";
          r1.on("data", c => d += c);
          r1.on("end", () => {
            let mp3Url;
            try { mp3Url = JSON.parse(d).URL; } catch (e) { /* fall through */ }
            if (!mp3Url) { res.writeHead(502, cors); return res.end(JSON.stringify({ error: "No URL from ttsmp3" })); }
            // Step 2: fetch and stream the MP3
            const parsed = new URL(mp3Url);
            const step2 = https.request(
              { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: "GET", headers: { "User-Agent": "Mozilla/5.0" } },
              (r2) => {
                if (r2.statusCode !== 200) { res.writeHead(r2.statusCode, cors); return res.end(JSON.stringify({ error: `MP3 fetch ${r2.statusCode}` })); }
                res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
                r2.pipe(res);
              }
            );
            step2.on("error", err => { res.writeHead(500, cors); res.end(JSON.stringify({ error: err.message })); });
            step2.end();
          });
        }
      );
      step1.on("error", err => { res.writeHead(500, cors); res.end(JSON.stringify({ error: err.message })); });
      step1.write(postData);
      step1.end();
    });
    return;
  }

  // ── ElevenLabs TTS proxy (called from Docker — uses host Windows IP, not Docker NAT) ──
  if (req.method === "POST" && req.url === "/tts") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let voiceId, text, apiKey;
      try {
        ({ voiceId, text, apiKey } = JSON.parse(body));
      } catch (e) {
        res.writeHead(400, cors);
        return res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
      if (!apiKey || !text || !voiceId) {
        res.writeHead(400, cors);
        return res.end(JSON.stringify({ error: "Missing apiKey, text, or voiceId" }));
      }

      const payload = JSON.stringify({
        text: String(text).slice(0, 1000),
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.55, similarity_boost: 0.85, style: 0.4, use_speaker_boost: true },
      });

      const options = {
        hostname: "api.elevenlabs.io",
        path: `/v1/text-to-speech/${voiceId}`,
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
          "Content-Length": Buffer.byteLength(payload),
        },
      };

      const upstream = https.request(options, (upRes) => {
        if (upRes.statusCode !== 200) {
          let errBody = "";
          upRes.on("data", (d) => (errBody += d));
          upRes.on("end", () => {
            res.writeHead(upRes.statusCode, cors);
            res.end(JSON.stringify({ error: errBody }));
          });
          return;
        }
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
        upRes.pipe(res);
      });

      upstream.on("error", (err) => {
        res.writeHead(500, cors);
        res.end(JSON.stringify({ error: err.message }));
      });

      upstream.write(payload);
      upstream.end();
    });
    return;
  }

  // Unknown route
  res.writeHead(404, cors);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Host Relay] Listening on port ${PORT}  (platform: ${process.platform})`);
  console.log(`[Host Relay] Docker container should use: http://host.docker.internal:${PORT}`);
});
