import { z } from "zod";

export interface ToolExecutionContext {
  requestId: string;
}

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TSchema;
  group: string;
  destructive?: boolean;
  handler: (input: z.infer<TSchema>, context: ToolExecutionContext) => Promise<unknown>;
}

export interface ToolGroupDefinition {
  key: string;
  label: string;
  enabled: boolean;
  tools: ToolDefinition[];
}
