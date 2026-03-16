import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { runSafeCommand } from "../../services/command-service";
import { ToolDefinition } from "../../types/tool";
import { ToolError } from "../../utils/errors";
import { ensurePathAllowed } from "../../utils/paths";

const group = "git";

const RepoPathSchema = z.object({
  path: z.string().describe("Repository path."),
});

const BranchListSchema = RepoPathSchema.extend({
  all: z.boolean().optional().default(false),
});

const DiffSummarySchema = RepoPathSchema.extend({
  staged: z.boolean().optional().default(false),
});

const LogHistorySchema = RepoPathSchema.extend({
  limit: z.number().int().min(1).max(100).optional().default(hubConfig.git.defaultLogLimit),
});

const CommitHelperSchema = RepoPathSchema.extend({
  message: z.string().min(1),
  add_all: z.boolean().optional().default(false),
  files: z.array(z.string()).optional().default([]),
  confirm: z.boolean().optional().default(false),
});

function ensureRepoPath(repoPath: string): string {
  return ensurePathAllowed(repoPath, hubConfig.git.allowedRoots, hubConfig.filesystem.deniedPaths);
}

async function runGit(repoPath: string, args: string[]) {
  return runSafeCommand({ command: "git", args, cwd: ensureRepoPath(repoPath) });
}

export const gitTools: ToolDefinition[] = [
  {
    name: "git_status",
    description: "Show git status using porcelain output plus branch summary.",
    inputSchema: RepoPathSchema,
    group,
    handler: async (input) => {
      const result = await runGit(input.path, ["status", "--short", "--branch"]);
      return { path: input.path, output: result.stdout };
    },
  },
  {
    name: "git_branch_list",
    description: "List local or all branches.",
    inputSchema: BranchListSchema,
    group,
    handler: async (input) => {
      const result = await runGit(input.path, ["branch", ...(input.all ? ["-a"] : [])]);
      return {
        path: input.path,
        branches: result.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => line.trim()),
      };
    },
  },
  {
    name: "git_diff_summary",
    description: "Return a diff summary with file stats.",
    inputSchema: DiffSummarySchema,
    group,
    handler: async (input) => {
      const args = input.staged ? ["diff", "--cached", "--stat"] : ["diff", "--stat"];
      const result = await runGit(input.path, args);
      return { path: input.path, staged: input.staged, summary: result.stdout };
    },
  },
  {
    name: "git_changed_files",
    description: "List changed files in the repository.",
    inputSchema: RepoPathSchema,
    group,
    handler: async (input) => {
      const result = await runGit(input.path, ["status", "--short"]);
      const files = result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => ({
          status: line.slice(0, 2).trim(),
          path: line.slice(3).trim(),
        }));
      return { path: input.path, count: files.length, files };
    },
  },
  {
    name: "git_log_history",
    description: "Inspect recent commit history.",
    inputSchema: LogHistorySchema,
    group,
    handler: async (input) => {
      const result = await runGit(input.path, ["log", `-${input.limit}`, "--pretty=format:%H%x09%an%x09%ad%x09%s", "--date=iso"]);
      const commits = result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const [hash, author, date, subject] = line.split("\t");
          return { hash, author, date, subject };
        });
      return { path: input.path, count: commits.length, commits };
    },
  },
  {
    name: "git_commit_helper",
    description: "Optionally stage files and create a commit when enabled by policy.",
    inputSchema: CommitHelperSchema,
    group,
    destructive: true,
    handler: async (input) => {
      if (!hubConfig.git.allowCommit) {
        throw new ToolError("Git commit helper is disabled by policy. Set GIT_ALLOW_COMMIT=true to enable it.", {
          code: "permission_denied",
          statusCode: 403,
        });
      }
      if (!input.confirm) {
        throw new ToolError("Commit creation requires confirm=true.", {
          code: "bad_request",
          statusCode: 400,
        });
      }
      if (input.add_all) {
        await runGit(input.path, ["add", "--all"]);
      } else if (input.files.length > 0) {
        await runGit(input.path, ["add", ...input.files]);
      } else {
        throw new ToolError("Provide files or set add_all=true before committing.", {
          code: "bad_request",
          statusCode: 400,
        });
      }
      const result = await runGit(input.path, ["commit", "-m", input.message]);
      return { path: input.path, output: result.stdout || result.stderr };
    },
  },
  {
    name: "git_remote_info",
    description: "Show configured remotes for GitHub-ready workflows.",
    inputSchema: RepoPathSchema,
    group,
    handler: async (input) => {
      const result = await runGit(input.path, ["remote", "-v"]);
      return { path: input.path, remotes: result.stdout.split(/\r?\n/).filter(Boolean) };
    },
  },
];
