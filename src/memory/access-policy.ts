import { MemoryRole } from "./contracts/v1";

export interface MemoryAccessContext {
  actorId: string;
  role: MemoryRole;
  scopeType: "global" | "agent" | "client" | "project" | "system";
  scopeId: string;
}

const ROLE_RANK: Record<MemoryRole, number> = {
  platform_admin: 100,
  operator: 90,
  reliability_engineer: 75,
  curation_manager: 75,
  oversight_viewer: 60,
  agent_service_role: 40,
  client_viewer: 20,
};

export class MemoryAccessPolicy {
  static canRead(context: MemoryAccessContext): boolean {
    return ROLE_RANK[context.role] >= ROLE_RANK.client_viewer;
  }

  static canWriteIngest(context: MemoryAccessContext): boolean {
    return ["platform_admin", "operator", "agent_service_role", "reliability_engineer"].includes(context.role);
  }

  static canViewHealth(context: MemoryAccessContext): boolean {
    return ["platform_admin", "operator", "reliability_engineer", "oversight_viewer"].includes(context.role);
  }

  static canViewFacets(context: MemoryAccessContext): boolean {
    return this.canRead(context);
  }

  static fromHeaders(headers: Record<string, unknown>): MemoryAccessContext {
    const role = (String(headers["x-memory-role"] || "operator") as MemoryRole);
    const actorId = String(headers["x-memory-actor"] || "system");
    const scopeTypeRaw = String(headers["x-memory-scope-type"] || "global");
    const scopeType = (["global", "agent", "client", "project", "system"].includes(scopeTypeRaw)
      ? scopeTypeRaw
      : "global") as MemoryAccessContext["scopeType"];

    return {
      actorId,
      role: ROLE_RANK[role] ? role : "operator",
      scopeType,
      scopeId: String(headers["x-memory-scope-id"] || "global"),
    };
  }
}