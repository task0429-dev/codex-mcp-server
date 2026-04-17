import path from "path";
import { fileURLToPath } from "url";
import { mkdir, writeFile } from "fs/promises";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(projectRoot, "control-ui-src");
const outputRoot = path.join(projectRoot, "monitoring-ui");
const assetRoot = path.join(outputRoot, "assets");

await mkdir(assetRoot, { recursive: true });

await build({
  entryPoints: [path.join(sourceRoot, "monitoring-main.tsx")],
  bundle: true,
  format: "esm",
  target: ["es2022"],
  jsx: "automatic",
  sourcemap: false,
  minify: true,
  outdir: assetRoot,
  entryNames: "mon",
  assetNames: "mon",
  loader: { ".png": "file", ".svg": "file", ".css": "css" },
});

console.log("Monitoring UI built →", assetRoot);
