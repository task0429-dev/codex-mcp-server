import { MemoryAccessContext, MemoryAccessPolicy } from "./access-policy";
import { buildMemoryError } from "./contracts/v1";
import { MemoryRepository } from "./repository";

export class MemoryApiService {
  static parseAccessContext(headers: Record<string, unknown>): MemoryAccessContext {
    return MemoryAccessPolicy.fromHeaders(headers);
  }

  static async getHealth(context: MemoryAccessContext) {
    if (!MemoryAccessPolicy.canViewHealth(context)) {
      throw Object.assign(new Error("Insufficient permissions to view memory health."), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
    return MemoryRepository.getHealth();
  }

  static async getFacets(context: MemoryAccessContext) {
    if (!MemoryAccessPolicy.canViewFacets(context)) {
      throw Object.assign(new Error("Insufficient permissions to view memory facets."), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
    return MemoryRepository.getFacets();
  }

  static buildErrorResponse(requestId: string, err: any) {
    const statusCode = Number(err?.statusCode) || 500;
    const code = typeof err?.code === "string"
      ? err.code
      : statusCode === 403
      ? "FORBIDDEN"
      : statusCode === 401
      ? "UNAUTHORIZED"
      : statusCode === 404
      ? "NOT_FOUND"
      : statusCode === 409
      ? "CONFLICT"
      : statusCode >= 500
      ? "INTERNAL_ERROR"
      : "BAD_REQUEST";

    return {
      statusCode,
      body: buildMemoryError(requestId, code as any, err?.message || "Memory API request failed."),
    };
  }
}