import { z } from "zod";
import { promises as fs } from "fs";
import * as path from "path";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";

const BrowseDirectorySchema = z.object({
  path: z.string().describe("Directory path to browse"),
  agentName: z.string().describe("Agent requesting access")
});

const ReadFileSchema = z.object({
  path: z.string().describe("File path to read"),
  agentName: z.string().describe("Agent requesting access")
});

const WriteFileSchema = z.object({
  path: z.string().describe("File path to write"),
  content: z.string().describe("Content to write"),
  agentName: z.string().describe("Agent requesting access")
});

const SearchFilesSchema = z.object({
  directory: z.string().describe("Directory to search in"),
  pattern: z.string().describe("Search pattern (glob or regex)"),
  agentName: z.string().describe("Agent requesting access")
});

/**
 * Filesystem integration with permission-based access control
 */
export class FilesystemIntegration {
  private static readonly ALLOWED_ROOTS = [
    process.cwd(),
    path.join(process.cwd(), ".."),
    "C:\\Users",
    "C:\\Program Files",
    "/home",
    "/usr"
  ];

  /**
   * Check if path is within allowed roots
   */
  private static isPathAllowed(filePath: string): boolean {
    const normalizedPath = path.resolve(filePath);
    return this.ALLOWED_ROOTS.some(root => normalizedPath.startsWith(path.resolve(root)));
  }

  /**
   * Browse directory contents
   */
  static async browseDirectory(input: z.infer<typeof BrowseDirectorySchema>) {
    const { path: dirPath, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "filesystem", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for filesystem`);
    }

    if (!this.isPathAllowed(dirPath)) {
      throw new Error(`Access denied: path ${dirPath} is outside allowed directories`);
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const result = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
        path: path.join(dirPath, entry.name)
      }));

      logger.info(`Agent ${agentName} browsed directory: ${dirPath}`);
      return result;
    } catch (error) {
      logger.error(`Filesystem browse error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Read file contents
   */
  static async readFile(input: z.infer<typeof ReadFileSchema>) {
    const { path: filePath, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "filesystem", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for filesystem`);
    }

    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: path ${filePath} is outside allowed directories`);
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      logger.info(`Agent ${agentName} read file: ${filePath}`);
      return { content, path: filePath };
    } catch (error) {
      logger.error(`Filesystem read error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Write file contents
   */
  static async writeFile(input: z.infer<typeof WriteFileSchema>) {
    const { path: filePath, content, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "filesystem", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for filesystem`);
    }

    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Access denied: path ${filePath} is outside allowed directories`);
    }

    try {
      await fs.writeFile(filePath, content, "utf-8");
      logger.info(`Agent ${agentName} wrote file: ${filePath}`);
      return { success: true, path: filePath };
    } catch (error) {
      logger.error(`Filesystem write error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Search files in directory
   */
  static async searchFiles(input: z.infer<typeof SearchFilesSchema>) {
    const { directory, pattern, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "filesystem", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for filesystem`);
    }

    if (!this.isPathAllowed(directory)) {
      throw new Error(`Access denied: path ${directory} is outside allowed directories`);
    }

    try {
      const results: string[] = [];

      async function search(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await search(fullPath);
          } else if (entry.isFile() && entry.name.includes(pattern)) {
            results.push(fullPath);
          }
        }
      }

      await search(directory);
      logger.info(`Agent ${agentName} searched files in: ${directory} for pattern: ${pattern}`);
      return { results, count: results.length };
    } catch (error) {
      logger.error(`Filesystem search error for ${agentName}: ${error}`);
      throw error;
    }
  }
}

// Tool definitions for MCP
export const filesystemTools = [
  {
    name: "filesystem_browse_directory",
    description: "Browse contents of a directory with permission check",
    inputSchema: BrowseDirectorySchema,
    handler: FilesystemIntegration.browseDirectory.bind(FilesystemIntegration)
  },
  {
    name: "filesystem_read_file",
    description: "Read contents of a file with permission check",
    inputSchema: ReadFileSchema,
    handler: FilesystemIntegration.readFile.bind(FilesystemIntegration)
  },
  {
    name: "filesystem_write_file",
    description: "Write content to a file with permission check",
    inputSchema: WriteFileSchema,
    handler: FilesystemIntegration.writeFile.bind(FilesystemIntegration)
  },
  {
    name: "filesystem_search_files",
    description: "Search for files matching a pattern in a directory",
    inputSchema: SearchFilesSchema,
    handler: FilesystemIntegration.searchFiles.bind(FilesystemIntegration)
  }
];