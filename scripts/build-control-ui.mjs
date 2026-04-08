import path from "path";
import { fileURLToPath } from "url";
import { copyFile, mkdir, readdir, readFile, writeFile } from "fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "control-ui-src");
const outputRoot = path.join(projectRoot, "control-ui");
const assetRoot = path.join(outputRoot, "assets");
const buildId = Date.now().toString();
const entryBaseName = `app-${buildId}`;

// Keep older bundles so cached index.html references never 404.
// Cloudflare sees a new URL each build → always fetches fresh.
await mkdir(assetRoot, { recursive: true });

await build({
  entryPoints: [path.join(sourceRoot, "main.tsx")],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  jsx: "automatic",
  sourcemap: false,
  minify: true,
  outdir: assetRoot,
  entryNames: entryBaseName,
  assetNames: `${entryBaseName}-[name]`,
  loader: {
    ".png": "file",
    ".svg": "file",
  },
});

const indexTemplate = await readFile(path.join(sourceRoot, "index.html"), "utf8");
const versionedIndex = indexTemplate
  .replace("/assets/app.css", `/assets/${entryBaseName}.css?v=${buildId}`)
  .replace("/assets/app.js", `/assets/${entryBaseName}.js?v=${buildId}`);

await writeFile(path.join(outputRoot, "index.html"), versionedIndex, "utf8");
// Also write stable app.js/app.css for any code that references them directly
await copyFile(path.join(assetRoot, `${entryBaseName}.css`), path.join(assetRoot, "app.css"));
await copyFile(path.join(assetRoot, `${entryBaseName}.js`), path.join(assetRoot, "app.js"));

// Copy static assets (images, fonts) from control-ui-src/assets to control-ui/assets
const srcAssets = path.join(sourceRoot, "assets");
try {
  const files = await readdir(srcAssets);
  for (const file of files) {
    await copyFile(path.join(srcAssets, file), path.join(assetRoot, file));
  }
} catch { /* no assets dir — skip */ }
