import { Policy, AgentPermissions, PermissionLevel } from "../types/permissions";

export class AccessPolicy {
  private static policies: Policy[] = [
    {
      agentName: "Abdi",
      permissions: {
        notion: "write",
        docker: "admin",
        filesystem: "admin",
        github: "write",
        terminal: "admin",
        desktop: "admin",
        agent_core: "admin",
        monitoring: "admin",
        discord: "write",
        telegram: "write",
        google_drive: "write",
        supabase: "write",
        stripe: "write",
        airtable: "write",
        n8n: "admin",
        hubspot: "admin"
      },
      allowedCommands: ["*"],
      maxExecutionTime: 120
    },
    {
      agentName: "Ahmed",
      permissions: {
        notion: "write",
        docker: "none",
        filesystem: "write",
        github: "read",
        terminal: "read",
        desktop: "execute",
        agent_core: "read",
        monitoring: "read",
        discord: "read",
        telegram: "read",
        google_drive: "write",
        supabase: "read",
        stripe: "none",
        airtable: "write",
        n8n: "write",
        hubspot: "read"
      },
      allowedCommands: ["find", "ls", "grep"],
      maxExecutionTime: 10
    },
    {
      agentName: "Dame",
      permissions: {
        notion: "write",
        docker: "admin",
        filesystem: "admin",
        github: "write",
        terminal: "admin",
        desktop: "admin",
        agent_core: "admin",
        monitoring: "admin",
        discord: "read",
        telegram: "read",
        google_drive: "read",
        supabase: "admin",
        stripe: "read",
        airtable: "read",
        n8n: "admin",
        hubspot: "write"
      },
      allowedCommands: ["*", "sudo", "systemctl", "docker", "ps", "top", "netstat"],
      maxExecutionTime: 60
    },
    {
      agentName: "Rex",
      permissions: {
        notion: "write",
        docker: "write",
        filesystem: "read",
        github: "read",
        terminal: "execute",
        desktop: "execute",
        agent_core: "read",
        monitoring: "read",
        discord: "read",
        telegram: "read",
        google_drive: "read",
        supabase: "read",
        stripe: "read",
        airtable: "read",
        n8n: "read",
        hubspot: "read"
      },
      allowedCommands: ["netstat", "nmap", "iptables", "docker inspect", "ps", "ss"],
      maxExecutionTime: 20
    },
    {
      agentName: "Prime",
      permissions: {
        notion: "write",
        docker: "read",
        filesystem: "write",
        github: "read",
        terminal: "execute",
        desktop: "admin",
        agent_core: "read",
        monitoring: "read",
        discord: "read",
        telegram: "write",
        google_drive: "write",
        supabase: "write",
        stripe: "write",
        airtable: "write",
        n8n: "write",
        hubspot: "read"
      },
      allowedCommands: ["*"],
      maxExecutionTime: 120
    },
    {
      agentName: "Atlas",
      permissions: {
        notion: "write",
        docker: "admin",
        filesystem: "admin",
        github: "write",
        terminal: "admin",
        desktop: "admin",
        agent_core: "admin",
        monitoring: "admin",
        discord: "write",
        telegram: "write",
        google_drive: "write",
        supabase: "write",
        stripe: "write",
        airtable: "write",
        n8n: "admin",
        hubspot: "write"
      },
      allowedCommands: ["*"],
      maxExecutionTime: 120
    },
    {
      agentName: "Ayub",
      permissions: {
        notion: "write",
        docker: "admin",
        filesystem: "admin",
        github: "write",
        terminal: "admin",
        desktop: "admin",
        agent_core: "read",
        monitoring: "write",
        discord: "write",
        telegram: "write",
        google_drive: "write",
        supabase: "write",
        stripe: "read",
        airtable: "write",
        n8n: "admin",
        hubspot: "write"
      },
      allowedCommands: ["*"],
      maxExecutionTime: 120
    },
    {
      agentName: "Sygma",
      permissions: {
        notion: "write",
        docker: "read",
        filesystem: "write",
        github: "read",
        terminal: "read",
        desktop: "execute",
        agent_core: "read",
        monitoring: "read",
        discord: "write",
        telegram: "write",
        google_drive: "write",
        supabase: "write",
        stripe: "write",
        airtable: "write",
        n8n: "write",
        hubspot: "write"
      },
      allowedCommands: ["ls", "cat", "grep"],
      maxExecutionTime: 10
    }
  ];

  static getPolicy(agentName: string): Policy | undefined {
    return this.policies.find((p) => p.agentName.toLowerCase() === agentName.toLowerCase());
  }

  static hasPermission(
    agentName: string,
    integration: keyof AgentPermissions,
    requiredLevel: PermissionLevel
  ): boolean {
    const policy = this.getPolicy(agentName);
    if (!policy) return false;

    const currentLevel = policy.permissions[integration] ?? "none";
    const levels: PermissionLevel[] = ["none", "read", "write", "execute", "admin"];

    return levels.indexOf(currentLevel) >= levels.indexOf(requiredLevel);
  }

  static isCommandAllowed(agentName: string, command: string): boolean {
    const policy = this.getPolicy(agentName);
    if (!policy || !policy.allowedCommands) return false;

    if (policy.allowedCommands.includes("*")) return true;
    return policy.allowedCommands.some((allowed) => command.startsWith(allowed));
  }

  static getMaxExecutionTime(agentName: string): number {
    const policy = this.getPolicy(agentName);
    return policy?.maxExecutionTime || 10;
  }

  static listPolicies(): Policy[] {
    return [...this.policies];
  }
}
