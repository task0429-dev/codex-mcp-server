import path from "path";
import { fileURLToPath } from "url";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "control-ui-src");
const outputRoot = path.join(projectRoot, "control-ui");
const assetRoot = path.join(outputRoot, "assets");
const buildId = Date.now().toString();

await rm(outputRoot, { recursive: true, force: true });
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
  entryNames: "app",
  assetNames: "app",
  loader: {
    ".png": "file",
    ".svg": "file",
  },
});

const indexTemplate = await readFile(path.join(sourceRoot, "index.html"), "utf8");
const versionedIndex = indexTemplate
  .replace("/assets/app.css", `/assets/app.css?v=${buildId}`)
  .replace("/assets/app.js", `/assets/app.js?v=${buildId}`);

await writeFile(path.join(outputRoot, "index.html"), versionedIndex, "utf8");

// Copy static assets (images, fonts) from control-ui-src/assets to control-ui/assets
const srcAssets = path.join(sourceRoot, "assets");
try {
  const files = await readdir(srcAssets);
  for (const file of files) {
    await copyFile(path.join(srcAssets, file), path.join(assetRoot, file));
  }
} catch { /* no assets dir — skip */ }
