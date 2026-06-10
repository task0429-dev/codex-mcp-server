export type WorldEntry = {
  id: string;
  name: string;
  title: string;
  kind: "agent" | "project";
  category: string;
  relativePath: string;
  absolutePath: string;
  status: "installed" | "needs-config" | "source-only";
  runtime: string[];
  manifests: string[];
  readme?: string;
  description: string;
  tags: string[];
  launchHints: string[];
};

export type WorldCategory = { id: string; label: string; path: string; projects: number; agents: number };

export type WorldPayload = {
  generatedAt: string;
  root: string;
  remote: string;
  branch: string;
  commit: string;
  localOpenEnabled: boolean;
  totals: {
    categories: number;
    projects: number;
    agents: number;
    packageJson: number;
    requirements: number;
    pythonFiles: number;
  };
  categories: WorldCategory[];
  projects: WorldEntry[];
  agents: WorldEntry[];
};

export type EntryDetail = {
  id: string;
  readmeExcerpt: string;
  files: string[];
  manifestContents: Record<string, string>;
  envVars: string[];
  frameworks: string[];
};

export type Readiness =
  | "ready"
  | "needs-env"
  | "needs-install"
  | "missing-readme"
  | "unknown-runtime"
  | "source-only";

export const READINESS_LABEL: Record<Readiness, string> = {
  ready: "Ready (detected)",
  "needs-env": "Needs env (detected)",
  "needs-install": "Needs install (detected)",
  "missing-readme": "Missing README (detected)",
  "unknown-runtime": "Unknown runtime (detected)",
  "source-only": "Source only (detected)",
};

export const READINESS_TONE: Record<Readiness, "green" | "yellow" | "red" | "neutral"> = {
  ready: "green",
  "needs-env": "yellow",
  "needs-install": "yellow",
  "missing-readme": "red",
  "unknown-runtime": "neutral",
  "source-only": "neutral",
};

/**
 * Derived purely from fields the scanner already returns — order matters,
 * the most actionable signal wins first so the badge tells the user what to fix next.
 */
export function deriveReadiness(entry: WorldEntry): Readiness {
  const hasLaunchCandidate = entry.launchHints.length > 0;
  const hasDependencyManifest = entry.manifests.some((m) => m === "requirements.txt" || m === "package.json" || m === "pyproject.toml");
  const needsEnv = entry.manifests.includes(".env.example");
  const hasReadme = Boolean(entry.readme);
  const hasRuntime = entry.runtime.length > 0;

  if (!hasRuntime) return "unknown-runtime";
  if (!hasReadme) return "missing-readme";
  if (needsEnv) return "needs-env";
  if (entry.status === "needs-config" && hasDependencyManifest) return "needs-install";
  if (entry.status === "source-only" && !hasLaunchCandidate) return "source-only";
  if (hasLaunchCandidate && hasDependencyManifest && hasReadme) return "ready";
  return "source-only";
}

export type RuntimeKind = "python" | "node" | "mixed" | "unknown";

export function deriveRuntimeKind(runtime: string[]): RuntimeKind {
  const hasPython = runtime.some((r) => r.startsWith("python"));
  const hasNode = runtime.includes("node");
  if (hasPython && hasNode) return "mixed";
  if (hasPython) return "python";
  if (hasNode) return "node";
  return "unknown";
}

export type ExplorerMode = "all" | "agents" | "projects" | "tutorials";
export type RuntimeFilter = "all" | "python" | "node" | "mixed" | "unknown";
export type ReadinessFilter = "all" | Readiness;
export type SortKey = "name" | "category" | "readiness" | "type";

export function isTutorial(entry: WorldEntry): boolean {
  return entry.tags.includes("tutorial") || /tutorial/i.test(entry.relativePath) || /tutorial/i.test(entry.title);
}
