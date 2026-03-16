import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { ToolDefinition } from "../../types/tool";
import { ToolError, assertCondition } from "../../utils/errors";
import { ensurePathAllowed, getPathKind } from "../../utils/paths";

const group = "filesystem";

const ListDirectorySchema = z.object({
  path: z.string().describe("Directory path to list."),
  recursive: z.boolean().optional().default(false),
  include_hidden: z.boolean().optional().default(false),
  max_entries: z.number().int().min(1).max(1000).optional().default(200),
});

const ReadFileSchema = z.object({
  path: z.string().describe("File path to read."),
  encoding: z.enum(["utf8", "base64"]).optional().default("utf8"),
  max_bytes: z.number().int().min(1).max(hubConfig.filesystem.maxReadBytes).optional(),
});

const WriteFileSchema = z.object({
  path: z.string().describe("File path to write."),
  content: z.string().describe("Content to write."),
  overwrite: z.boolean().optional().default(true),
  create_directories: z.boolean().optional().default(true),
});

const PatchFileSchema = z.object({
  path: z.string().describe("File path to patch."),
  search: z.string().describe("Text to search for."),
  replace: z.string().describe("Replacement text."),
  replace_all: z.boolean().optional().default(false),
  expected_occurrences: z.number().int().min(1).optional(),
});

const SearchFilesSchema = z.object({
  path: z.string().describe("Directory to search."),
  pattern: z.string().describe("Substring or regex-like pattern for file names."),
  content_pattern: z.string().optional().describe("Optional substring to search inside file contents."),
  include_hidden: z.boolean().optional().default(false),
  max_results: z.number().int().min(1).max(1000).optional().default(hubConfig.filesystem.maxSearchResults),
});

const CreateDirectorySchema = z.object({
  path: z.string().describe("Directory path to create."),
});

const MovePathSchema = z.object({
  source: z.string().describe("Source path."),
  destination: z.string().describe("Destination path."),
  overwrite: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
});

const CopyPathSchema = z.object({
  source: z.string().describe("Source path."),
  destination: z.string().describe("Destination path."),
  overwrite: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
});

const DeletePathSchema = z.object({
  path: z.string().describe("Path to delete."),
  recursive: z.boolean().optional().default(false),
  confirm: z.boolean().optional().default(false),
});

function ensureWritable() {
  if (hubConfig.filesystem.readOnly) {
    throw new ToolError("Filesystem tools are currently in read-only mode.", {
      code: "permission_denied",
      statusCode: 403,
    });
  }
}

async function listEntries(dirPath: string, recursive: boolean, includeHidden: boolean, maxEntries: number) {
  const results: Array<{ name: string; path: string; type: string }> = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      results.push({
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      });

      if (results.length >= maxEntries) {
        return;
      }

      if (recursive && entry.isDirectory()) {
        await walk(entryPath);
        if (results.length >= maxEntries) {
          return;
        }
      }
    }
  }

  await walk(dirPath);
  return results;
}

async function searchFilesRecursive(input: z.infer<typeof SearchFilesSchema>) {
  const rootPath = ensurePathAllowed(input.path, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
  const results: Array<{ path: string; kind: string; matched: string[] }> = [];
  const pattern = input.pattern.toLowerCase();
  const contentPattern = input.content_pattern?.toLowerCase();

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!input.include_hidden && entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        if (results.length >= input.max_results) {
          return;
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const matched: string[] = [];
      if (entry.name.toLowerCase().includes(pattern)) {
        matched.push("name");
      }

      if (contentPattern) {
        const stat = await fs.stat(entryPath);
        if (stat.size <= hubConfig.filesystem.maxReadBytes) {
          const content = await fs.readFile(entryPath, "utf8").catch(() => "");
          if (content.toLowerCase().includes(contentPattern)) {
            matched.push("content");
          }
        }
      }

      if (matched.length > 0) {
        results.push({ path: entryPath, kind: "file", matched });
      }

      if (results.length >= input.max_results) {
        return;
      }
    }
  }

  await walk(rootPath);
  return results;
}

export const filesystemTools: ToolDefinition[] = [
  {
    name: "filesystem_list_directory",
    description: "List directory contents with project-scoped guardrails.",
    inputSchema: ListDirectorySchema,
    group,
    handler: async (input) => {
      const dirPath = ensurePathAllowed(input.path, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      assertCondition(getPathKind(dirPath) === "directory", `Directory not found: ${dirPath}`, { code: "not_found", statusCode: 404 });
      const entries = await listEntries(dirPath, input.recursive, input.include_hidden, input.max_entries);
      return { path: dirPath, count: entries.length, entries };
    },
  },
  {
    name: "filesystem_browse_directory",
    description: "Compatibility alias for directory listing.",
    inputSchema: ListDirectorySchema,
    group,
    handler: async (input, context) => filesystemTools[0].handler(input, context),
  },
  {
    name: "filesystem_read_file",
    description: "Read a file with size limits and allowed-root checks.",
    inputSchema: ReadFileSchema,
    group,
    handler: async (input) => {
      const filePath = ensurePathAllowed(input.path, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      assertCondition(getPathKind(filePath) === "file", `File not found: ${filePath}`, { code: "not_found", statusCode: 404 });
      const stat = await fs.stat(filePath);
      const maxBytes = input.max_bytes || hubConfig.filesystem.maxReadBytes;
      assertCondition(stat.size <= maxBytes, `File is larger than the allowed read limit (${maxBytes} bytes).`, {
        code: "permission_denied",
        statusCode: 403,
      });
      const content = await fs.readFile(filePath, input.encoding === "base64" ? undefined : "utf8");
      return {
        path: filePath,
        size: stat.size,
        encoding: input.encoding,
        content: input.encoding === "base64" ? (content as Buffer).toString("base64") : content,
      };
    },
  },
  {
    name: "filesystem_write_file",
    description: "Write a file with overwrite controls and allowed-root checks.",
    inputSchema: WriteFileSchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWritable();
      const filePath = ensurePathAllowed(input.path, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      const existingKind = getPathKind(filePath);
      if (existingKind === "directory") {
        throw new ToolError(`Cannot overwrite a directory: ${filePath}`, { code: "bad_request", statusCode: 400 });
      }
      if (existingKind === "file" && !input.overwrite) {
        throw new ToolError(`File already exists and overwrite=false: ${filePath}`, { code: "bad_request", statusCode: 400 });
      }
      if (Buffer.byteLength(input.content, "utf8") > hubConfig.filesystem.maxFileSizeBytes) {
        throw new ToolError("Content exceeds FILESYSTEM_MAX_FILE_SIZE_BYTES.", { code: "bad_request", statusCode: 400 });
      }
      if (input.create_directories) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
      }
      await fs.writeFile(filePath, input.content, "utf8");
      return { path: filePath, bytes_written: Buffer.byteLength(input.content, "utf8") };
    },
  },
  {
    name: "filesystem_patch_file",
    description: "Apply a simple text patch by replacing a matching string.",
    inputSchema: PatchFileSchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWritable();
      const filePath = ensurePathAllowed(input.path, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      assertCondition(getPathKind(filePath) === "file", `File not found: ${filePath}`, { code: "not_found", statusCode: 404 });
      const content = await fs.readFile(filePath, "utf8");
      const occurrences = content.split(input.search).length - 1;
      assertCondition(occurrences > 0, `Search text not found in ${filePath}`, { code: "bad_request", statusCode: 400 });
      if (input.expected_occurrences !== undefined && occurrences !== input.expected_occurrences) {
        throw new ToolError(`Expected ${input.expected_occurrences} occurrences but found ${occurrences}.`, {
          code: "bad_request",
          statusCode: 400,
        });
      }
      const nextContent = input.replace_all ? content.split(input.search).join(input.replace) : content.replace(input.search, input.replace);
      await fs.writeFile(filePath, nextContent, "utf8");
      return { path: filePath, occurrences, replaced_all: input.replace_all };
    },
  },
  {
    name: "filesystem_search_files",
    description: "Search for files by name and optional content within allowed roots.",
    inputSchema: SearchFilesSchema,
    group,
    handler: async (input) => {
      const results = await searchFilesRecursive(input);
      return { path: path.resolve(input.path), count: results.length, results };
    },
  },
  {
    name: "filesystem_create_directory",
    description: "Create a directory inside an allowed root.",
    inputSchema: CreateDirectorySchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWritable();
      const dirPath = ensurePathAllowed(input.path, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      await fs.mkdir(dirPath, { recursive: true });
      return { path: dirPath, created: true };
    },
  },
  {
    name: "filesystem_move_path",
    description: "Move or rename a file/directory with confirmation.",
    inputSchema: MovePathSchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWritable();
      assertCondition(hubConfig.filesystem.allowMove, "Move operations are disabled by policy.", { code: "permission_denied", statusCode: 403 });
      assertCondition(input.confirm, "Move operations require confirm=true.", { code: "bad_request", statusCode: 400 });
      const source = ensurePathAllowed(input.source, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      const destination = ensurePathAllowed(input.destination, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      const destinationKind = getPathKind(destination);
      if (destinationKind !== "missing" && !input.overwrite) {
        throw new ToolError(`Destination already exists: ${destination}`, { code: "bad_request", statusCode: 400 });
      }
      if (destinationKind !== "missing" && input.overwrite) {
        await fs.rm(destination, { recursive: true, force: true });
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.rename(source, destination);
      return { source, destination, moved: true };
    },
  },
  {
    name: "filesystem_copy_path",
    description: "Copy a file/directory with confirmation.",
    inputSchema: CopyPathSchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWritable();
      assertCondition(hubConfig.filesystem.allowCopy, "Copy operations are disabled by policy.", { code: "permission_denied", statusCode: 403 });
      assertCondition(input.confirm, "Copy operations require confirm=true.", { code: "bad_request", statusCode: 400 });
      const source = ensurePathAllowed(input.source, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      const destination = ensurePathAllowed(input.destination, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      const destinationKind = getPathKind(destination);
      if (destinationKind !== "missing" && !input.overwrite) {
        throw new ToolError(`Destination already exists: ${destination}`, { code: "bad_request", statusCode: 400 });
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.cp(source, destination, { recursive: true, force: input.overwrite });
      return { source, destination, copied: true };
    },
  },
  {
    name: "filesystem_delete_path",
    description: "Delete a file/directory with explicit confirmation and policy checks.",
    inputSchema: DeletePathSchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWritable();
      assertCondition(hubConfig.filesystem.allowDelete, "Delete operations are disabled by policy.", { code: "permission_denied", statusCode: 403 });
      assertCondition(input.confirm, "Delete operations require confirm=true.", { code: "bad_request", statusCode: 400 });
      const targetPath = ensurePathAllowed(input.path, hubConfig.filesystem.allowedRoots, hubConfig.filesystem.deniedPaths);
      await fs.rm(targetPath, { recursive: input.recursive, force: false });
      return { path: targetPath, deleted: true };
    },
  },
];
