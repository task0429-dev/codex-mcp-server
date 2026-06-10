import fs from "fs";
import path from "path";

export type AwesomeWorldEntry = {
  id: string;
  name: string;
  title: string;
  kind: "agent" | "project";
  category: string;
  relativePath: string;
  absolutePath: string;
  depth: number;
  status: "installed" | "needs-config" | "source-only";
  runtime: string[];
  manifests: string[];
  readme?: string;
  description: string;
  tags: string[];
  launchHints: string[];
};

export type AwesomeWorldPayload = {
  generatedAt: string;
  root: string;
  remote: string;
  branch: string;
  commit: string;
  totals: {
    categories: number;
    projects: number;
    agents: number;
    packageJson: number;
    requirements: number;
    pythonFiles: number;
  };
  categories: Array<{ id: string; label: string; path: string; projects: number; agents: number }>;
  projects: AwesomeWorldEntry[];
  agents: AwesomeWorldEntry[];
  localOpenEnabled: boolean;
};

export type AwesomeWorldEntryDetail = {
  id: string;
  readmeExcerpt: string;
  files: string[];
  manifestContents: Record<string, string>;
  envVars: string[];
  frameworks: string[];
};

export type AwesomeWorldOpenTarget = "folder" | "readme";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");
const AWESOME_ROOT = path.resolve(process.env.AWESOME_LLM_APPS_ROOT || path.join(WORKSPACE_ROOT, "awesome-llm-apps"));
const REMOTE = "https://github.com/Shubhamsaboo/awesome-llm-apps.git";
const IGNORE = new Set([".git", ".github", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", "build", ".cache"]);

function safeRead(file: string, max = 4000) {
  try { return fs.readFileSync(file, "utf8").slice(0, max); } catch { return ""; }
}

function listDir(dir: string) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "entry";
}

function humanize(input: string) {
  return input.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function titleFromReadme(text: string, fallback: string) {
  const firstHeading = text.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return firstHeading ? firstHeading.replace(/^#\s+/, "").trim() : humanize(fallback);
}

function descriptionFromReadme(text: string, fallback: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const body = lines.find((line) => !line.startsWith("#") && !line.startsWith("!") && !line.startsWith("[!") && line.length > 30);
  return body ? body.replace(/[`*_]/g, "").slice(0, 220) : `${humanize(fallback)} from awesome-llm-apps.`;
}

function detectRuntime(files: string[]) {
  const runtime = new Set<string>();
  if (files.includes("package.json")) runtime.add("node");
  if (files.includes("requirements.txt") || files.some((f) => f.endsWith(".py"))) runtime.add("python");
  if (files.includes("pyproject.toml")) runtime.add("python/uv");
  if (files.includes("Dockerfile")) runtime.add("docker");
  if (files.includes("docker-compose.yml") || files.includes("compose.yml")) runtime.add("docker-compose");
  if (files.some((f) => f.endsWith(".ipynb"))) runtime.add("notebook");
  return Array.from(runtime);
}

function entryStatus(files: string[]) {
  if (files.includes(".env.example") || files.includes("requirements.txt") || files.includes("package.json")) return "needs-config" as const;
  if (files.some((f) => f.endsWith(".py") || f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js"))) return "source-only" as const;
  return "installed" as const;
}

function categoryOf(relativePath: string) {
  return relativePath.split(/[\\/]/)[0] || "root";
}

function tagsFor(relativePath: string, title: string, runtime: string[]) {
  const hay = `${relativePath} ${title}`.toLowerCase();
  const tags = new Set<string>(runtime);
  for (const [needle, tag] of [
    ["rag", "rag"], ["voice", "voice"], ["mcp", "mcp"], ["multi_agent", "multi-agent"], ["multi-agent", "multi-agent"],
    ["chat", "chat"], ["video", "video"], ["finance", "finance"], ["research", "research"], ["ui", "generative-ui"],
    ["agent", "agent"], ["game", "game"], ["podcast", "podcast"], ["sales", "sales"], ["legal", "legal"],
  ] as Array<[string, string]>) {
    if (hay.includes(needle)) tags.add(tag);
  }
  return Array.from(tags).slice(0, 10);
}

function isAgent(relativePath: string, title: string, readme: string) {
  const hay = `${relativePath}\n${title}\n${readme.slice(0, 1200)}`.toLowerCase();
  return /\bagent\b|agents|multi[_ -]?agent|crewai|autogen|agno|langgraph|assistant|voice/.test(hay);
}

function launchHints(files: string[], relativePath: string) {
  const hints: string[] = [];
  const cwd = `cd ${path.join(AWESOME_ROOT, relativePath)}`;
  if (files.includes("package.json")) hints.push(`${cwd} && npm install && npm run dev`);
  if (files.includes("requirements.txt")) hints.push(`${cwd} && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt`);
  if (files.some((f) => f === "app.py" || f === "streamlit_app.py")) hints.push(`${cwd} && streamlit run app.py`);
  if (files.includes("main.py")) hints.push(`${cwd} && python main.py`);
  if (files.includes("Dockerfile")) hints.push(`${cwd} && docker build .`);
  return hints;
}

const FRAMEWORK_SIGNATURES: Array<[string, RegExp]> = [
  ["LangChain", /langchain/i],
  ["CrewAI", /crewai/i],
  ["Agno", /\bagno\b/i],
  ["AutoGen", /autogen/i],
  ["LangGraph", /langgraph/i],
  ["LlamaIndex", /llama[_-]?index/i],
  ["OpenAI", /\bopenai\b/i],
  ["Anthropic", /anthropic/i],
  ["Streamlit", /streamlit/i],
  ["FastAPI", /fastapi/i],
  ["Next.js", /\bnext\b/i],
  ["Gradio", /gradio/i],
];

function detectFrameworks(manifestContents: Record<string, string>): string[] {
  const hay = Object.values(manifestContents).join("\n").toLowerCase();
  const found = new Set<string>();
  for (const [label, pattern] of FRAMEWORK_SIGNATURES) {
    if (pattern.test(hay)) found.add(label);
  }
  return Array.from(found);
}

function detectEnvVars(envExampleContent: string): string[] {
  return envExampleContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=")[0].trim())
    .filter(Boolean)
    .slice(0, 30);
}

function discoverEntries(root: string) {
  const entries: AwesomeWorldEntry[] = [];
  let packageJson = 0, requirements = 0, pythonFiles = 0;

  function walk(dir: string, depth: number) {
    const children = listDir(dir);
    const files = children.filter((c) => c.isFile()).map((c) => c.name);
    packageJson += files.filter((f) => f === "package.json").length;
    requirements += files.filter((f) => f === "requirements.txt").length;
    pythonFiles += files.filter((f) => f.endsWith(".py")).length;

    const hasManifest = files.some((f) => ["package.json", "requirements.txt", "pyproject.toml", "Dockerfile", "docker-compose.yml", "compose.yml"].includes(f));
    const hasCode = files.some((f) => /\.(py|js|ts|tsx|jsx|ipynb)$/.test(f));
    const hasReadme = files.some((f) => /^readme\.md$/i.test(f));
    const relativePath = path.relative(root, dir);

    if (relativePath && (hasManifest || (hasReadme && hasCode))) {
      const readmeName = files.find((f) => /^readme\.md$/i.test(f));
      const readmeText = readmeName ? safeRead(path.join(dir, readmeName)) : "";
      const runtime = detectRuntime(files);
      const title = titleFromReadme(readmeText, path.basename(dir));
      const kind = isAgent(relativePath, title, readmeText) ? "agent" : "project";
      entries.push({
        id: slug(relativePath),
        name: path.basename(dir),
        title,
        kind,
        category: categoryOf(relativePath),
        relativePath,
        absolutePath: dir,
        depth,
        status: entryStatus(files),
        runtime,
        manifests: files.filter((f) => ["package.json", "requirements.txt", "pyproject.toml", "Dockerfile", "docker-compose.yml", "compose.yml", ".env.example"].includes(f)),
        readme: readmeName ? path.join(relativePath, readmeName) : undefined,
        description: descriptionFromReadme(readmeText, path.basename(dir)),
        tags: tagsFor(relativePath, title, runtime),
        launchHints: launchHints(files, relativePath),
      });
    }

    if (depth >= 7) return;
    for (const child of children) {
      if (!child.isDirectory() || IGNORE.has(child.name)) continue;
      walk(path.join(dir, child.name), depth + 1);
    }
  }

  walk(root, 0);
  return { entries, packageJson, requirements, pythonFiles };
}

function gitValue(args: string[]) {
  try {
    const cp = require("child_process") as typeof import("child_process");
    return cp.execFileSync("git", args, { cwd: AWESOME_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return "unknown"; }
}

export function findEntryById(id: string): AwesomeWorldEntry | null {
  if (!fs.existsSync(AWESOME_ROOT)) return null;
  const { entries } = discoverEntries(AWESOME_ROOT);
  return entries.find((entry) => entry.id === id) || null;
}

export function buildAwesomeLlmAppsEntryDetail(id: string): AwesomeWorldEntryDetail | null {
  const entry = findEntryById(id);
  if (!entry) return null;

  const files = listDir(entry.absolutePath)
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort()
    .slice(0, 60);

  const manifestContents: Record<string, string> = {};
  for (const manifestName of entry.manifests) {
    if (manifestName === ".env.example") continue;
    manifestContents[manifestName] = safeRead(path.join(entry.absolutePath, manifestName), 2000);
  }

  const envVars = entry.manifests.includes(".env.example")
    ? detectEnvVars(safeRead(path.join(entry.absolutePath, ".env.example"), 4000))
    : [];

  const readmeExcerpt = entry.readme ? safeRead(path.join(AWESOME_ROOT, entry.readme), 6000) : "";

  return {
    id: entry.id,
    readmeExcerpt,
    files,
    manifestContents,
    envVars,
    frameworks: detectFrameworks(manifestContents),
  };
}

export function resolveAwesomeEntryOpenPath(id: string, target: AwesomeWorldOpenTarget): string | null {
  const entry = findEntryById(id);
  if (!entry) return null;
  if (target === "readme") {
    if (!entry.readme) return null;
    const readmePath = path.join(AWESOME_ROOT, entry.readme);
    return fs.existsSync(readmePath) ? readmePath : null;
  }
  return fs.existsSync(entry.absolutePath) ? entry.absolutePath : null;
}

export function buildAwesomeLlmAppsWorld(): AwesomeWorldPayload {
  if (!fs.existsSync(AWESOME_ROOT)) {
    return {
      generatedAt: new Date().toISOString(),
      root: AWESOME_ROOT,
      remote: REMOTE,
      branch: "missing",
      commit: "missing",
      totals: { categories: 0, projects: 0, agents: 0, packageJson: 0, requirements: 0, pythonFiles: 0 },
      categories: [],
      projects: [],
      agents: [],
      localOpenEnabled: process.env.LLM_WORLD_LOCAL_OPEN === "true",
    };
  }

  const { entries, packageJson, requirements, pythonFiles } = discoverEntries(AWESOME_ROOT);
  entries.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  const agents = entries.filter((entry) => entry.kind === "agent");
  const projects = entries;
  const categoryMap = new Map<string, { id: string; label: string; path: string; projects: number; agents: number }>();
  for (const entry of entries) {
    if (!categoryMap.has(entry.category)) categoryMap.set(entry.category, { id: entry.category, label: humanize(entry.category), path: path.join(AWESOME_ROOT, entry.category), projects: 0, agents: 0 });
    const row = categoryMap.get(entry.category)!;
    row.projects += 1;
    if (entry.kind === "agent") row.agents += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    root: AWESOME_ROOT,
    remote: REMOTE,
    branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: gitValue(["rev-parse", "--short", "HEAD"]),
    totals: {
      categories: categoryMap.size,
      projects: projects.length,
      agents: agents.length,
      packageJson,
      requirements,
      pythonFiles,
    },
    categories: Array.from(categoryMap.values()),
    projects,
    agents,
    localOpenEnabled: process.env.LLM_WORLD_LOCAL_OPEN === "true",
  };
}
