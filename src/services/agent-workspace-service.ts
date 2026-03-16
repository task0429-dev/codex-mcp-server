import { AgentRuntimeRegistry } from "../agents/runtime-profiles";

export class AgentWorkspaceService {
  static getWorkspace(agentName: string) {
    return AgentRuntimeRegistry.find(agentName)?.workspace;
  }

  static getRuntimeProfile(agentName: string) {
    return AgentRuntimeRegistry.find(agentName);
  }
}
