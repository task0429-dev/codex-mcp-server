import { z } from "zod";

export const AgentMetadataSchema = z.object({
  name: z.string(),
  role: z.string(),
  description: z.string(),
  allowedActions: z.array(z.string()),
  supportedTransports: z.array(z.enum(["stdio", "http"])).default(["stdio", "http"]),
  status: z.string().optional(),
});

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

/**
 * Central registry of all agents in the OpenClaw ecosystem.
 * This is the single source of truth for agent metadata.
 * Customize by editing the agents array below.
 *
 * FUTURE: Replace with dynamic loading from OpenClaw config/database.
 */
export class AgentRegistry {
  private static agents: AgentMetadata[] = [
    {
      name: "Abdi",
      role: "CEO / Supervisor / Strategist / Business Operator",
      description: "Central orchestrator for agent coordination, strategic decision-making, and business operations",
      allowedActions: ["ask", "status", "restart", "list", "unlock", "search"],
      supportedTransports: ["stdio", "http"],
    },
    {
      name: "Ahmed",
      role: "Organizer / File-Finder / Documentation Manager",
      description: "File and knowledge organization, taxonomy, metadata management, and structure specialist",
      allowedActions: ["ask", "status", "list", "search"],
      supportedTransports: ["stdio", "http"],
    },
    {
      name: "Dame",
      role: "Local Machine Operator / Systems Specialist",
      description: "Local and remote machine administration, Windows/Linux systems, terminal, and file execution",
      allowedActions: ["ask", "status", "restart", "list", "unlock", "search"],
      supportedTransports: ["stdio", "http"],
    },
    {
      name: "Rex",
      role: "Network / Infrastructure / Cybersecurity Specialist",
      description: "Network management, cybersecurity, threat analysis, diagnostics, and system hardening",
      allowedActions: ["ask", "status", "list", "search"],
      supportedTransports: ["stdio", "http"],
    },
    {
      name: "Prime",
      role: "Trading Research and Systems Specialist",
      description: "Trading analysis, market strategy, financial instruments, and trading systems",
      allowedActions: ["ask", "status", "list", "search"],
      supportedTransports: ["stdio", "http"],
    },
    {
      name: "Atlas",
      role: "Director of Marketing / Growth / SEO / Social Media",
      description: "Marketing strategy, campaigns, brand management, SEO, social media, and customer acquisition",
      allowedActions: ["ask", "status", "list", "search"],
      supportedTransports: ["stdio", "http"],
    },
    {
      name: "Ayub",
      role: "Builder / Coder / Implementation Specialist",
      description: "Code building, implementation, development, and technical execution specialist",
      allowedActions: ["ask", "status", "list", "search"],
      supportedTransports: ["stdio", "http"],
    },
    {
      name: "Sygma",
      role: "Assisted-Living / Operations / Compliance Specialist",
      description: "Operations management, compliance, process management, and assisted-living workflows",
      allowedActions: ["ask", "status", "list", "search"],
      supportedTransports: ["stdio", "http"],
    },
  ];

  /**
   * Get all agents as a list
   */
  static list(): AgentMetadata[] {
    return this.agents.map((a) => ({ ...a }));
  }

  /**
   * Find an agent by name (case-insensitive)
   */
  static find(name: string): AgentMetadata | undefined {
    return this.agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Check if agent exists
   */
  static exists(name: string): boolean {
    return !!this.find(name);
  }

  /**
   * Get all agents that support a specific transport
   */
  static byTransport(transport: "stdio" | "http"): AgentMetadata[] {
    return this.agents.filter((a) => a.supportedTransports.includes(transport));
  }
}


