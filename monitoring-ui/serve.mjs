// Standalone static server for Rex Command Zone monitoring UI
// Usage: node monitoring-ui/serve.mjs
// Opens: http://localhost:3030

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3030;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff2":"font/woff2",
};

const server = http.createServer((req, res) => {
  // Strip query strings
  const urlPath = req.url.split("?")[0];

  // Resolve file path
  let filePath = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);

  // SPA fallback — anything without extension serves index.html
  if (!path.extname(filePath)) {
    filePath = path.join(__dirname, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // Try index.html as fallback
        fs.readFile(path.join(__dirname, "index.html"), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end("Not found"); return; }
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(d2);
        });
        return;
      }
      res.writeHead(500); res.end("Error"); return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n  ◈ Rex Command Zone`);
  console.log(`  → http://localhost:${PORT}\n`);
});
