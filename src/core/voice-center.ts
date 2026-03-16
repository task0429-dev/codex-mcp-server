function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function buildVoiceCenterPayload(baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: normalizedBaseUrl,
    status: {
      label: "Voice Center Ready",
      summary:
        "A dedicated browser voice page is now available here. No separate standalone web voice dashboard was detected on this machine, so this page becomes the control surface.",
    },
    links: [
      {
        label: "Voice Center",
        url: `${normalizedBaseUrl}/voice`,
        description: "Voice operations dashboard",
      },
      {
        label: "MCP Command Center",
        url: normalizedBaseUrl,
        description: "Main MCP operations page",
      },
      {
        label: "n8n",
        url: "http://localhost:5678",
        description: "Automation workflows and speech-related flows",
      },
      {
        label: "LM Studio API",
        url: "http://localhost:1234",
        description: "OpenAI-compatible local model endpoint",
      },
      {
        label: "Ollama",
        url: "http://localhost:11434",
        description: "Local model runtime",
      },
    ],
    voiceSurfaces: [
      {
        name: "Windows Voice Access",
        type: "desktop",
        status: "detected locally",
        notes: "Voice Access is a Windows desktop app, not a browser page.",
      },
      {
        name: "LM Studio",
        type: "local api",
        status: "listening on localhost:1234",
        notes: "Useful for speech or assistant pipelines that need a local OpenAI-style endpoint.",
      },
      {
        name: "Ollama",
        type: "local api",
        status: "listening on localhost:11434",
        notes: "Useful for local speech or voice-adjacent model workflows.",
      },
      {
        name: "n8n",
        type: "workflow ui",
        status: "listening on localhost:5678",
        notes: "Best place to wire voice automations, speech ingestion, and call workflows.",
      },
    ],
    configPaths: [
      "C:\\Users\\offic\\AppData\\Roaming\\VoiceAccess\\CustomCommands",
      "C:\\Users\\offic\\AppData\\Roaming\\VoiceAccess\\UserPhrases",
      "C:\\Users\\offic\\AppData\\Roaming\\VoiceAccess\\EditHistory",
      "C:\\Users\\offic\\Documents\\Codex\\mcp-server",
      "C:\\Users\\offic\\n8n-nodes-google-speech-main",
    ],
    voiceCapabilities: [
      "Voice Access command phrases and custom commands",
      "Local model endpoints for voice-adjacent workflows",
      "n8n for speech automation and orchestration",
      "OpenClaw/OpenAI-style voice plugin configuration references in the local schema files",
    ],
    note:
      "If TASK meant a different voice product, it is not currently exposing a confirmed web dashboard URL on this machine. This page provides the working local links and configuration entry points that are actually present.",
  };
}

export function renderVoiceCenterHtml(baseUrl: string): string {
  const payload = buildVoiceCenterPayload(baseUrl);
  const payloadJson = escapeHtml(JSON.stringify(payload));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Task Enterprise Voice Center</title>
  <style>
    :root {
      color-scheme: dark;
      --bg-1: #120914;
      --bg-2: #1d1028;
      --panel: rgba(19, 10, 30, 0.82);
      --panel-strong: rgba(26, 13, 39, 0.94);
      --border: rgba(239, 132, 208, 0.2);
      --text: #fff1fb;
      --muted: #d3a8c5;
      --accent: #ff8ad6;
      --accent-2: #ffd08f;
      --shadow: 0 24px 60px rgba(0, 0, 0, 0.32);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(255, 138, 214, 0.16), transparent 30%),
        radial-gradient(circle at top right, rgba(255, 208, 143, 0.12), transparent 25%),
        linear-gradient(145deg, var(--bg-1) 0%, #170d22 48%, var(--bg-2) 100%);
    }

    .shell {
      width: min(1240px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 48px;
    }

    .hero, .panel {
      border: 1px solid var(--border);
      border-radius: 24px;
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }

    .hero {
      padding: 28px;
      background:
        linear-gradient(180deg, rgba(37, 18, 53, 0.96), rgba(19, 10, 30, 0.9)),
        var(--panel);
    }

    .eyebrow {
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(34px, 5vw, 58px);
      line-height: 1;
    }

    .lede {
      margin: 16px 0 0;
      max-width: 860px;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.6;
    }

    .grid,
    .link-grid,
    .surface-grid {
      display: grid;
      gap: 16px;
      margin-top: 20px;
    }

    .grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }

    .link-grid,
    .surface-grid {
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .panel {
      margin-top: 18px;
      padding: 22px;
    }

    .section-title {
      margin: 0;
      font-size: 22px;
    }

    .section-copy {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.5;
    }

    .card {
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 18px;
      background: var(--panel-strong);
    }

    .label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .value {
      display: block;
      margin-top: 10px;
      font-size: 28px;
      font-weight: 700;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 999px;
      text-decoration: none;
      color: var(--text);
      border: 1px solid rgba(255, 138, 214, 0.28);
      background: rgba(255, 138, 214, 0.1);
      font-weight: 700;
    }

    ul {
      margin: 12px 0 0;
      padding-left: 18px;
      color: var(--muted);
    }

    li + li {
      margin-top: 8px;
    }

    code, pre {
      font-family: Consolas, "Courier New", monospace;
    }

    pre {
      margin: 12px 0 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 18px;
      padding: 14px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <p class="eyebrow">Task Enterprise LLC</p>
      <h1>Voice Command Center</h1>
      <p class="lede">
        This is the voice operations page for TASK. A separate standalone web voice dashboard was not detectable on this machine, so this page now acts as the working control surface and quick-link center for the voice stack that is actually present.
      </p>
      <div class="link-grid" id="links"></div>
    </section>

    <section class="panel">
      <h2 class="section-title">Status</h2>
      <p class="section-copy" id="status-summary"></p>
      <div class="grid" id="stats"></div>
    </section>

    <section class="panel">
      <h2 class="section-title">Voice Surfaces</h2>
      <p class="section-copy">These are the voice-related apps and local endpoints currently mapped into this machine's workflow.</p>
      <div class="surface-grid" id="surfaces"></div>
    </section>

    <section class="panel">
      <h2 class="section-title">Config Paths</h2>
      <p class="section-copy">These folders are the fastest places to inspect or manage voice-related setup on this system.</p>
      <pre id="paths"></pre>
    </section>

    <section class="panel">
      <h2 class="section-title">Current Capabilities</h2>
      <ul id="capabilities"></ul>
      <p class="section-copy" id="note"></p>
    </section>
  </div>

  <script id="voice-center-data" type="application/json">${payloadJson}</script>
  <script>
    (function () {
      const data = JSON.parse(document.getElementById("voice-center-data").textContent);

      document.getElementById("status-summary").textContent = data.status.summary;
      document.getElementById("note").textContent = data.note;

      document.getElementById("links").innerHTML = data.links.map(function (link) {
        return '<a class="button" href="' + link.url + '" target="_blank" rel="noreferrer">' + link.label + '</a>';
      }).join("");

      document.getElementById("stats").innerHTML = [
        ["Voice Links", data.links.length],
        ["Voice Surfaces", data.voiceSurfaces.length],
        ["Config Paths", data.configPaths.length],
        ["Updated", data.generatedAt]
      ].map(function (entry) {
        return '<article class="card">' +
          '<span class="label">' + entry[0] + '</span>' +
          '<span class="value">' + entry[1] + '</span>' +
        '</article>';
      }).join("");

      document.getElementById("surfaces").innerHTML = data.voiceSurfaces.map(function (surface) {
        return '<article class="card">' +
          '<span class="label">' + surface.type + '</span>' +
          '<div style="margin-top:10px; font-size:20px; font-weight:700;">' + surface.name + '</div>' +
          '<div style="margin-top:10px; color:var(--accent-2);">' + surface.status + '</div>' +
          '<div style="margin-top:10px; color:var(--muted); line-height:1.5;">' + surface.notes + '</div>' +
        '</article>';
      }).join("");

      document.getElementById("paths").textContent = data.configPaths.join("\\n");

      document.getElementById("capabilities").innerHTML = data.voiceCapabilities.map(function (item) {
        return '<li>' + item + '</li>';
      }).join("");
    })();
  </script>
</body>
</html>`;
}
