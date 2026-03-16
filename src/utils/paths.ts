import path from "path";
import { ToolError } from "./errors";

export function resolveUserPath(inputPath: string): string {
  return path.resolve(inputPath);
}

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function ensurePathAllowed(targetPath: string, allowedRoots: string[], deniedPaths: string[]): string {
  const resolvedPath = resolveUserPath(targetPath);
  const withinAllowedRoots = allowedRoots.some((root) => isPathInside(root, resolvedPath));
  if (!withinAllowedRoots) {
    throw new ToolError(`Path is outside allowed roots: ${resolvedPath}`, {
      code: "permission_denied",
      statusCode: 403,
      details: { resolvedPath, allowedRoots },
    });
  }

  const withinDeniedPath = deniedPaths.some((entry) => isPathInside(entry, resolvedPath));
  if (withinDeniedPath) {
    throw new ToolError(`Path is inside a denied location: ${resolvedPath}`, {
      code: "permission_denied",
      statusCode: 403,
      details: { resolvedPath, deniedPaths },
    });
  }

  return resolvedPath;
}

export function getPathKind(targetPath: string): "file" | "directory" | "missing" {
  try {
    const stat = require("fs").statSync(targetPath);
    if (stat.isDirectory()) {
      return "directory";
    }
    if (stat.isFile()) {
      return "file";
    }
    return "missing";
  } catch {
    return "missing";
  }
}
