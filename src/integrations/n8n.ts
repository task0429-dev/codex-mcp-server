import { z } from "zod";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";
import { requestJson } from "../core/api-client";

const ListWorkflowsSchema = z.object({
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional().describe("Filter by tag names"),
  name: z.string().optional().describe("Filter workflows by name"),
  projectId: z.string().optional().describe("Filter by project ID"),
  excludePinnedData: z.boolean().optional(),
  limit: z.number().int().min(1).max(250).optional().default(100),
  cursor: z.string().optional(),
  agentName: z.string().describe("Agent requesting access"),
});

const GetWorkflowSchema = z.object({
  id: z.string().describe("Workflow ID"),
  agentName: z.string().describe("Agent requesting access"),
});

const CreateWorkflowSchema = z.object({
  workflow: z.record(z.any()).describe("Workflow payload"),
  agentName: z.string().describe("Agent requesting access"),
});

const UpdateWorkflowSchema = z.object({
  id: z.string().describe("Workflow ID"),
  workflow: z.record(z.any()).describe("Updated workflow payload"),
  agentName: z.string().describe("Agent requesting access"),
});

const DeleteWorkflowSchema = z.object({
  id: z.string().describe("Workflow ID"),
  agentName: z.string().describe("Agent requesting access"),
});

const ActivateWorkflowSchema = z.object({
  id: z.string().describe("Workflow ID"),
  versionId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  agentName: z.string().describe("Agent requesting access"),
});

const DeactivateWorkflowSchema = z.object({
  id: z.string().describe("Workflow ID"),
  agentName: z.string().describe("Agent requesting access"),
});

const ListExecutionsSchema = z.object({
  includeData: z.boolean().optional(),
  status: z.enum(["canceled", "error", "running", "success", "waiting"]).optional(),
  workflowId: z.string().optional(),
  projectId: z.string().optional(),
  limit: z.number().int().min(1).max(250).optional().default(100),
  cursor: z.string().optional(),
  agentName: z.string().describe("Agent requesting access"),
});

const GetExecutionSchema = z.object({
  id: z.string().describe("Execution ID"),
  includeData: z.boolean().optional(),
  agentName: z.string().describe("Agent requesting access"),
});

export class N8nIntegration {
  private static getBaseUrl(): string {
    if (!config.N8N_BASE_URL) {
      throw new Error("n8n base URL not configured. Set N8N_BASE_URL in environment variables.");
    }

    const normalized = config.N8N_BASE_URL.replace(/\/$/, "");
    if (normalized.endsWith("/api/v1")) {
      return normalized;
    }

    return `${normalized}/api/v1`;
  }

  private static getHeaders(): Record<string, string> {
    if (!config.N8N_API_KEY) {
      throw new Error("n8n API key not configured. Set N8N_API_KEY in environment variables.");
    }

    return {
      "X-N8N-API-KEY": config.N8N_API_KEY,
      "Content-Type": "application/json",
    };
  }

  private static buildUrl(path: string, query?: URLSearchParams): string {
    const base = this.getBaseUrl();
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${base}${normalizedPath}`;
    const queryString = query?.toString();
    return queryString ? `${url}?${queryString}` : url;
  }

  static async listWorkflows(input: z.infer<typeof ListWorkflowsSchema>) {
    const { active, tags, name, projectId, excludePinnedData, limit, cursor, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for n8n`);
    }

    const params = new URLSearchParams();
    if (active !== undefined) params.set("active", String(active));
    if (tags?.length) params.set("tags", tags.join(","));
    if (name) params.set("name", name);
    if (projectId) params.set("projectId", projectId);
    if (excludePinnedData !== undefined) params.set("excludePinnedData", String(excludePinnedData));
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);

    const data = await requestJson<Record<string, unknown>>(this.buildUrl("/workflows", params), {
      headers: this.getHeaders(),
    });

    logger.info(`Agent ${agentName} listed n8n workflows`);
    return data;
  }

  static async getWorkflow(input: z.infer<typeof GetWorkflowSchema>) {
    const { id, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for n8n`);
    }

    const data = await requestJson<Record<string, unknown>>(this.buildUrl(`/workflows/${id}`), {
      headers: this.getHeaders(),
    });

    logger.info(`Agent ${agentName} fetched n8n workflow`, { id });
    return data;
  }

  static async createWorkflow(input: z.infer<typeof CreateWorkflowSchema>) {
    const { workflow, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for n8n`);
    }

    const data = await requestJson<Record<string, unknown>>(this.buildUrl("/workflows"), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(workflow),
    });

    logger.info(`Agent ${agentName} created n8n workflow`);
    return data;
  }

  static async updateWorkflow(input: z.infer<typeof UpdateWorkflowSchema>) {
    const { id, workflow, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for n8n`);
    }

    const data = await requestJson<Record<string, unknown>>(this.buildUrl(`/workflows/${id}`), {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(workflow),
    });

    logger.info(`Agent ${agentName} updated n8n workflow`, { id });
    return data;
  }

  static async deleteWorkflow(input: z.infer<typeof DeleteWorkflowSchema>) {
    const { id, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for n8n`);
    }

    const data = await requestJson<Record<string, unknown>>(this.buildUrl(`/workflows/${id}`), {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    logger.info(`Agent ${agentName} deleted n8n workflow`, { id });
    return data;
  }

  static async activateWorkflow(input: z.infer<typeof ActivateWorkflowSchema>) {
    const { id, versionId, name, description, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for n8n`);
    }

    const payload: Record<string, string> = {};
    if (versionId) payload.versionId = versionId;
    if (name) payload.name = name;
    if (description) payload.description = description;

    const data = await requestJson<Record<string, unknown>>(this.buildUrl(`/workflows/${id}/activate`), {
      method: "POST",
      headers: this.getHeaders(),
      body: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
    });

    logger.info(`Agent ${agentName} activated n8n workflow`, { id });
    return data;
  }

  static async deactivateWorkflow(input: z.infer<typeof DeactivateWorkflowSchema>) {
    const { id, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for n8n`);
    }

    const data = await requestJson<Record<string, unknown>>(this.buildUrl(`/workflows/${id}/deactivate`), {
      method: "POST",
      headers: this.getHeaders(),
    });

    logger.info(`Agent ${agentName} deactivated n8n workflow`, { id });
    return data;
  }

  static async listExecutions(input: z.infer<typeof ListExecutionsSchema>) {
    const { includeData, status, workflowId, projectId, limit, cursor, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for n8n`);
    }

    const params = new URLSearchParams();
    if (includeData !== undefined) params.set("includeData", String(includeData));
    if (status) params.set("status", status);
    if (workflowId) params.set("workflowId", workflowId);
    if (projectId) params.set("projectId", projectId);
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);

    const data = await requestJson<Record<string, unknown>>(this.buildUrl("/executions", params), {
      headers: this.getHeaders(),
    });

    logger.info(`Agent ${agentName} listed n8n executions`);
    return data;
  }

  static async getExecution(input: z.infer<typeof GetExecutionSchema>) {
    const { id, includeData, agentName } = input;
    if (!AccessPolicy.hasPermission(agentName, "n8n", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for n8n`);
    }

    const params = new URLSearchParams();
    if (includeData !== undefined) params.set("includeData", String(includeData));

    const data = await requestJson<Record<string, unknown>>(this.buildUrl(`/executions/${id}`, params), {
      headers: this.getHeaders(),
    });

    logger.info(`Agent ${agentName} fetched n8n execution`, { id });
    return data;
  }
}

export const n8nTools = [
  {
    name: "n8n_list_workflows",
    description: "List workflows from n8n",
    inputSchema: ListWorkflowsSchema,
    handler: N8nIntegration.listWorkflows.bind(N8nIntegration),
  },
  {
    name: "n8n_get_workflow",
    description: "Get a single workflow from n8n",
    inputSchema: GetWorkflowSchema,
    handler: N8nIntegration.getWorkflow.bind(N8nIntegration),
  },
  {
    name: "n8n_create_workflow",
    description: "Create a workflow in n8n",
    inputSchema: CreateWorkflowSchema,
    handler: N8nIntegration.createWorkflow.bind(N8nIntegration),
  },
  {
    name: "n8n_update_workflow",
    description: "Update an existing workflow in n8n",
    inputSchema: UpdateWorkflowSchema,
    handler: N8nIntegration.updateWorkflow.bind(N8nIntegration),
  },
  {
    name: "n8n_delete_workflow",
    description: "Delete a workflow in n8n",
    inputSchema: DeleteWorkflowSchema,
    handler: N8nIntegration.deleteWorkflow.bind(N8nIntegration),
  },
  {
    name: "n8n_activate_workflow",
    description: "Activate (publish) a workflow in n8n",
    inputSchema: ActivateWorkflowSchema,
    handler: N8nIntegration.activateWorkflow.bind(N8nIntegration),
  },
  {
    name: "n8n_deactivate_workflow",
    description: "Deactivate a workflow in n8n",
    inputSchema: DeactivateWorkflowSchema,
    handler: N8nIntegration.deactivateWorkflow.bind(N8nIntegration),
  },
  {
    name: "n8n_list_executions",
    description: "List executions from n8n",
    inputSchema: ListExecutionsSchema,
    handler: N8nIntegration.listExecutions.bind(N8nIntegration),
  },
  {
    name: "n8n_get_execution",
    description: "Get a single execution from n8n",
    inputSchema: GetExecutionSchema,
    handler: N8nIntegration.getExecution.bind(N8nIntegration),
  },
];
