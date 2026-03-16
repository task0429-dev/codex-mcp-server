import { z } from "zod";
import { Client } from "@notionhq/client";
import { AccessPolicy } from "../policies/policies";
import { logger } from "../core/logger";
import { config } from "../config/config";

const SearchPagesSchema = z.object({
  query: z.string().describe("Search query for pages"),
  agentName: z.string().describe("Agent requesting access")
});

const GetPageSchema = z.object({
  pageId: z.string().describe("Notion page ID"),
  agentName: z.string().describe("Agent requesting access")
});

const CreatePageSchema = z.object({
  parentId: z.string().describe("Parent page/database ID"),
  title: z.string().describe("Page title"),
  content: z.string().optional().describe("Page content"),
  agentName: z.string().describe("Agent requesting access")
});

const UpdatePageSchema = z.object({
  pageId: z.string().describe("Page ID to update"),
  properties: z.record(z.any()).optional().describe("Page properties to update"),
  content: z.string().optional().describe("New content to append"),
  agentName: z.string().describe("Agent requesting access")
});

/**
 * Notion integration using Notion API with permission controls
 */
export class NotionIntegration {
  private static client: Client | null = null;

  private static toRichText(content: string) {
    return [{ type: "text", text: { content } }];
  }

  private static parseContentToBlocks(content: string): any[] {
    const allowedCodeLanguages = new Set([
      "abap", "abc", "agda", "arduino", "ascii art", "assembly", "bash", "basic", "bnf", "c", "c#", "c++",
      "clojure", "coffeescript", "coq", "css", "dart", "dhall", "diff", "docker", "ebnf", "elixir", "elm",
      "erlang", "f#", "flow", "fortran", "gherkin", "glsl", "go", "graphql", "groovy", "haskell", "hcl",
      "html", "idris", "java", "javascript", "json", "julia", "kotlin", "latex", "less", "lisp", "livescript",
      "llvm ir", "lua", "makefile", "markdown", "markup", "matlab", "mathematica", "mermaid", "nix",
      "notion formula", "objective-c", "ocaml", "pascal", "perl", "php", "plain text", "powershell", "prolog",
      "protobuf", "purescript", "python", "r", "racket", "reason", "ruby", "rust", "sass", "scala", "scheme",
      "scss", "shell", "smalltalk", "solidity", "sql", "swift", "toml", "typescript", "vb.net", "verilog",
      "vhdl", "visual basic", "webassembly", "xml", "yaml", "java/c/c++/c#"
    ]);
    const normalizeCodeLanguage = (language: string): string => {
      const normalized = (language || "").trim().toLowerCase();
      if (!normalized || normalized === "text" || normalized === "txt") return "plain text";
      return allowedCodeLanguages.has(normalized) ? normalized : "plain text";
    };

    const lines = content.replace(/\r/g, "").split("\n");
    const blocks: any[] = [];
    let inCodeBlock = false;
    let codeLanguage = "plain text";
    let codeLines: string[] = [];

    const pushCodeBlock = () => {
      if (!inCodeBlock) return;
      blocks.push({
        object: "block",
        type: "code",
        code: {
          language: normalizeCodeLanguage(codeLanguage),
          rich_text: NotionIntegration.toRichText(codeLines.join("\n") || " ")
        }
      });
      inCodeBlock = false;
      codeLanguage = "plain text";
      codeLines = [];
    };

    for (const rawLine of lines) {
      const line = rawLine ?? "";
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim() || "plain text";
          codeLines = [];
        } else {
          pushCodeBlock();
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      if (!trimmed) continue;

      if (trimmed === "---") {
        blocks.push({ object: "block", type: "divider", divider: {} });
        continue;
      }

      if (trimmed.startsWith("### ")) {
        blocks.push({
          object: "block",
          type: "heading_3",
          heading_3: { rich_text: NotionIntegration.toRichText(trimmed.slice(4).trim()) }
        });
        continue;
      }

      if (trimmed.startsWith("## ")) {
        blocks.push({
          object: "block",
          type: "heading_2",
          heading_2: { rich_text: NotionIntegration.toRichText(trimmed.slice(3).trim()) }
        });
        continue;
      }

      if (trimmed.startsWith("# ")) {
        blocks.push({
          object: "block",
          type: "heading_1",
          heading_1: { rich_text: NotionIntegration.toRichText(trimmed.slice(2).trim()) }
        });
        continue;
      }

      if (trimmed.startsWith("- [ ] ")) {
        blocks.push({
          object: "block",
          type: "to_do",
          to_do: {
            rich_text: NotionIntegration.toRichText(trimmed.slice(6).trim()),
            checked: false
          }
        });
        continue;
      }

      if (trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
        blocks.push({
          object: "block",
          type: "to_do",
          to_do: {
            rich_text: NotionIntegration.toRichText(trimmed.slice(6).trim()),
            checked: true
          }
        });
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        blocks.push({
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: NotionIntegration.toRichText(trimmed.replace(/^\d+\.\s+/, ""))
          }
        });
        continue;
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        blocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: NotionIntegration.toRichText(trimmed.slice(2).trim())
          }
        });
        continue;
      }

      if (trimmed.startsWith("> ")) {
        blocks.push({
          object: "block",
          type: "quote",
          quote: {
            rich_text: NotionIntegration.toRichText(trimmed.slice(2).trim())
          }
        });
        continue;
      }

      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: NotionIntegration.toRichText(trimmed)
        }
      });
    }

    pushCodeBlock();
    return blocks;
  }

  private static async appendBlocksInChunks(client: Client, blockId: string, blocks: any[]) {
    const chunkSize = 90;
    for (let i = 0; i < blocks.length; i += chunkSize) {
      const chunk = blocks.slice(i, i + chunkSize);
      if (!chunk.length) continue;
      await client.blocks.children.append({
        block_id: blockId,
        children: chunk
      });
    }
  }

  /**
   * Initialize Notion client
   */
  private static getClient(): Client {
    if (!this.client) {
      const token = config.NOTION_TOKEN;
      if (!token) {
        throw new Error("Notion token not configured. Set NOTION_TOKEN in environment variables.");
      }
      this.client = new Client({ auth: token });
    }
    return this.client;
  }

  /**
   * Search pages
   */
  static async searchPages(input: z.infer<typeof SearchPagesSchema>) {
    const { query, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "notion", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Notion`);
    }

    try {
      const client = NotionIntegration.getClient();
      const response = await client.search({
        query,
        filter: { property: "object", value: "page" }
      });

      const pages = response.results.map((page: any) => ({
        id: page.id,
        title: page.properties?.title?.title?.[0]?.plain_text || "Untitled",
        url: page.url,
        last_edited_time: page.last_edited_time,
        created_time: page.created_time
      }));

      logger.info(`Agent ${agentName} searched Notion pages: "${query}" - ${pages.length} results`);
      return { pages, count: pages.length };
    } catch (error) {
      logger.error(`Notion search error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Get page content
   */
  static async getPage(input: z.infer<typeof GetPageSchema>) {
    const { pageId, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "notion", "read")) {
      throw new Error(`Agent ${agentName} does not have read permission for Notion`);
    }

    try {
      const client = NotionIntegration.getClient();

      // Get page metadata
      const page = await client.pages.retrieve({ page_id: pageId });

      // Get page content (blocks)
      const blocks = await client.blocks.children.list({ block_id: pageId });

      const content = blocks.results.map((block: any) => {
        if (block.type === "paragraph") {
          return block.paragraph.rich_text.map((text: any) => text.plain_text).join("");
        }
        return `[${block.type}]`;
      }).join("\n");

      logger.info(`Agent ${agentName} retrieved Notion page: ${pageId}`);
      return {
        page: {
          id: page.id,
          title: (page as any).properties?.title?.title?.[0]?.plain_text || "Untitled",
          url: (page as any).url,
          content
        }
      };
    } catch (error) {
      logger.error(`Notion get page error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Create a new page
   */
  static async createPage(input: z.infer<typeof CreatePageSchema>) {
    const { parentId, title, content, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "notion", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Notion`);
    }

    try {
      const client = NotionIntegration.getClient();

      const pageData: any = {
        parent: { page_id: parentId },
        properties: {
          title: {
            title: [{ text: { content: title } }]
          }
        }
      };

      const parsedBlocks = content ? NotionIntegration.parseContentToBlocks(content) : [];
      if (parsedBlocks.length) {
        pageData.children = parsedBlocks.slice(0, 90);
      }

      const response = await client.pages.create(pageData);
      if (parsedBlocks.length > 90) {
        await NotionIntegration.appendBlocksInChunks(client, response.id, parsedBlocks.slice(90));
      }

      logger.info(`Agent ${agentName} created Notion page: ${title}`);
      return {
        page: {
          id: response.id,
          title,
          url: (response as any).url
        }
      };
    } catch (error) {
      logger.error(`Notion create page error for ${agentName}: ${error}`);
      throw error;
    }
  }

  /**
   * Update a page
   */
  static async updatePage(input: z.infer<typeof UpdatePageSchema>) {
    const { pageId, properties, content, agentName } = input;

    if (!AccessPolicy.hasPermission(agentName, "notion", "write")) {
      throw new Error(`Agent ${agentName} does not have write permission for Notion`);
    }

    try {
      const client = NotionIntegration.getClient();
      let response: any = null;

      if (properties) {
        response = await client.pages.update({
          page_id: pageId,
          properties
        });
      } else {
        response = await client.pages.retrieve({ page_id: pageId });
      }

      if (content) {
        const parsedBlocks = NotionIntegration.parseContentToBlocks(content);
        await NotionIntegration.appendBlocksInChunks(client, pageId, parsedBlocks);
      }

      logger.info(`Agent ${agentName} updated Notion page: ${pageId}`);
      return {
        success: true,
        pageId,
        url: (response as any).url
      };
    } catch (error) {
      logger.error(`Notion update page error for ${agentName}: ${error}`);
      throw error;
    }
  }
}

// Tool definitions for MCP
export const notionTools = [
  {
    name: "notion_search_pages",
    description: "Search for pages in Notion workspace",
    inputSchema: SearchPagesSchema,
    handler: NotionIntegration.searchPages.bind(NotionIntegration)
  },
  {
    name: "notion_get_page",
    description: "Get content of a Notion page",
    inputSchema: GetPageSchema,
    handler: NotionIntegration.getPage.bind(NotionIntegration)
  },
  {
    name: "notion_create_page",
    description: "Create a new page in Notion",
    inputSchema: CreatePageSchema,
    handler: NotionIntegration.createPage.bind(NotionIntegration)
  },
  {
    name: "notion_update_page",
    description: "Update an existing Notion page",
    inputSchema: UpdatePageSchema,
    handler: NotionIntegration.updatePage.bind(NotionIntegration)
  }
];

