import { Client } from "@notionhq/client";
import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { ToolDefinition } from "../../types/tool";
import { ToolError } from "../../utils/errors";

const group = "notion";

const SearchSchema = z.object({
  query: z.string().min(1),
});

const PageSchema = z.object({
  page_id: z.string().min(1),
});

const CreatePageSchema = z.object({
  parent_id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
});

const UpdatePageSchema = z.object({
  page_id: z.string().min(1),
  title: z.string().optional(),
  append_content: z.string().optional(),
});

const QueryDatabaseSchema = z.object({
  database_id: z.string().min(1),
});

let client: Client | null = null;

function getClient(): Client {
  if (!hubConfig.notion.token) {
    throw new ToolError("Notion credentials are not configured. Set NOTION_TOKEN to enable these tools.", {
      code: "dependency_missing",
      statusCode: 503,
    });
  }

  if (!client) {
    client = new Client({ auth: hubConfig.notion.token });
  }

  return client;
}

function ensureWriteEnabled() {
  if (!hubConfig.notion.allowWrite) {
    throw new ToolError("Notion write actions are disabled by policy. Set NOTION_ALLOW_WRITE=true to enable them.", {
      code: "permission_denied",
      statusCode: 403,
    });
  }
}

export const notionTools: ToolDefinition[] = [
  {
    name: "notion_search_pages",
    description: "Search pages in the connected Notion workspace.",
    inputSchema: SearchSchema,
    group,
    handler: async (input) => {
      const response = await getClient().search({
        query: input.query,
        filter: { property: "object", value: "page" },
      });
      return {
        count: response.results.length,
        results: response.results.map((page: any) => ({
          id: page.id,
          url: page.url,
          last_edited_time: page.last_edited_time,
        })),
      };
    },
  },
  {
    name: "notion_get_page",
    description: "Read a Notion page plus its first-level blocks.",
    inputSchema: PageSchema,
    group,
    handler: async (input) => {
      const notion = getClient();
      const page = await notion.pages.retrieve({ page_id: input.page_id });
      const blocks = await notion.blocks.children.list({ block_id: input.page_id });
      return {
        page,
        blocks: blocks.results,
      };
    },
  },
  {
    name: "notion_create_page",
    description: "Create a Notion page when write access is enabled.",
    inputSchema: CreatePageSchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWriteEnabled();
      const response = await getClient().pages.create({
        parent: { page_id: input.parent_id },
        properties: {
          title: {
            title: [{ text: { content: input.title } }],
          },
        } as any,
        children: input.content
          ? [
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ type: "text", text: { content: input.content } }],
                },
              },
            ]
          : undefined,
      } as any);
      return { id: response.id, url: (response as any).url };
    },
  },
  {
    name: "notion_update_page",
    description: "Update a Notion page title or append content when writes are enabled.",
    inputSchema: UpdatePageSchema,
    group,
    destructive: true,
    handler: async (input) => {
      ensureWriteEnabled();
      const notion = getClient();
      if (input.title) {
        await notion.pages.update({
          page_id: input.page_id,
          properties: {
            title: {
              title: [{ text: { content: input.title } }],
            },
          } as any,
        });
      }
      if (input.append_content) {
        await notion.blocks.children.append({
          block_id: input.page_id,
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: input.append_content } }],
              },
            },
          ],
        } as any);
      }
      return { page_id: input.page_id, updated: true };
    },
  },
  {
    name: "notion_query_database",
    description: "Query a Notion database for rows.",
    inputSchema: QueryDatabaseSchema,
    group,
    handler: async (input) => {
      const response = await (getClient() as any).databases.query({
        database_id: input.database_id,
      });
      return {
        count: response.results.length,
        results: response.results,
      };
    },
  },
];
