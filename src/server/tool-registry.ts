import { hubConfig } from "../config/hub-config";
import { ToolDefinition, ToolGroupDefinition } from "../types/tool";
import { agentCoreTools } from "../tools/agent-core";
import { databaseTools } from "../tools/database";
import { dockerTools } from "../tools/docker";
import { desktopTools } from "../tools/desktop";
import { filesystemTools } from "../tools/filesystem";
import { gitTools } from "../tools/git";
import { legacyCloudTools } from "../tools/legacy-cloud";
import { notionTools } from "../tools/notion";
import { systemTools } from "../tools/system";
import { terminalTools } from "../tools/terminal";
import { webTools } from "../tools/web";
import { ToolError } from "../utils/errors";

const groups: ToolGroupDefinition[] = [
  { key: "agent-core", label: "Agent Core", enabled: hubConfig.features.agentCore, tools: agentCoreTools },
  { key: "filesystem", label: "Filesystem", enabled: hubConfig.features.filesystem, tools: filesystemTools },
  { key: "terminal", label: "Terminal", enabled: hubConfig.features.terminal, tools: terminalTools },
  { key: "desktop", label: "Desktop", enabled: hubConfig.features.desktop, tools: desktopTools },
  { key: "docker", label: "Docker", enabled: hubConfig.features.docker, tools: dockerTools },
  { key: "git", label: "Git", enabled: hubConfig.features.git, tools: gitTools },
  { key: "notion", label: "Notion", enabled: hubConfig.features.notion, tools: notionTools },
  { key: "database", label: "Database", enabled: hubConfig.features.database, tools: databaseTools },
  { key: "web", label: "Web", enabled: hubConfig.features.web, tools: webTools },
  { key: "system", label: "System", enabled: hubConfig.features.system, tools: systemTools },
  { key: "legacy-cloud", label: "Legacy Cloud", enabled: hubConfig.features.legacyCloud, tools: legacyCloudTools },
];

const enabledGroups = groups.filter((group) => group.enabled);
const enabledTools = enabledGroups.flatMap((group) => group.tools);

const toolMap = new Map<string, ToolDefinition>();
for (const tool of enabledTools) {
  if (toolMap.has(tool.name)) {
    throw new ToolError(`Duplicate MCP tool registration detected: ${tool.name}`);
  }
  toolMap.set(tool.name, tool);
}

export function getEnabledToolGroups(): ToolGroupDefinition[] {
  return enabledGroups;
}

export function getAllTools(): ToolDefinition[] {
  return enabledTools;
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function getStartupSummary() {
  return enabledGroups.map((group) => ({
    key: group.key,
    label: group.label,
    toolCount: group.tools.length,
  }));
}

export function getToolCatalog() {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    enabled: group.enabled,
    toolCount: group.tools.length,
    tools: group.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      group: tool.group,
      destructive: Boolean(tool.destructive),
      schema: (tool.inputSchema as any).toJSON?.() || {},
    })),
  }));
}
