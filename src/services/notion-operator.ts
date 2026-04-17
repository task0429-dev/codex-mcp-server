/**
 * Notion Operator — Task Enterprise LLC
 * Sub-agent that mirrors the 30-day marketing plan to Notion.
 * Target parent: Zero-Budget-Marketing-Engine-Task-Enterprise-HQ
 */

import { NotionIntegration } from "../integrations/notion";
import { logger } from "../core/logger";

const AGENT_NAME = "Abdi"; // Notion write permission holder
const HQ_PAGE_ID = "3401b447cb628126a039eb470c1d9823";
const PLAN_PAGE_TITLE = "30-Day Marketing Plan — Live Tracker";

export interface PlanTask {
  id: string;
  title: string;
  agent: string;
  status: "not-started" | "active" | "done";
  notes: string;
}

export interface PlanDay {
  day: number;
  theme: string;
  tasks: PlanTask[];
}

function statusEmoji(status: string): string {
  switch (status) {
    case "done": return "✅";
    case "active": return "🔄";
    default: return "⬜";
  }
}

function buildPlanContent(plan: PlanDay[]): string {
  const lines: string[] = [
    `# ${PLAN_PAGE_TITLE}`,
    ``,
    `> Auto-synced by Notion-Operator agent · Task Enterprise LLC`,
    ``,
  ];

  for (const day of plan) {
    const completed = day.tasks.filter((t) => t.status === "done").length;
    const total = day.tasks.length;
    lines.push(`## Day ${day.day} — ${day.theme} (${completed}/${total})`);
    lines.push(``);
    for (const task of day.tasks) {
      lines.push(`${statusEmoji(task.status)} **${task.title}**`);
      lines.push(`   - Agent: ${task.agent} | Status: ${task.status}${task.notes ? ` | Notes: ${task.notes}` : ""}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

export class NotionOperator {
  /**
   * Create or update the 30-day plan child page under the HQ.
   * Uses search to find existing page before creating.
   */
  static async syncPlan(plan: PlanDay[]): Promise<{ url: string; pageId: string; created: boolean }> {
    const content = buildPlanContent(plan);

    // Try to find existing tracker page
    try {
      const searchResult = await NotionIntegration.searchPages({
        query: PLAN_PAGE_TITLE,
        agentName: AGENT_NAME,
      });

      const existing = searchResult.pages?.find(
        (p: any) => p.title === PLAN_PAGE_TITLE
      );

      if (existing?.id) {
        // Update existing
        await NotionIntegration.updatePage({
          pageId: existing.id,
          content,
          agentName: AGENT_NAME,
        });
        logger.info("notion_operator_plan_updated", { pageId: existing.id });
        return { url: existing.url || "", pageId: existing.id, created: false };
      }
    } catch (err: any) {
      logger.warn("notion_operator_search_failed", { error: err?.message });
    }

    // Create new child page under HQ
    const result = await NotionIntegration.createPage({
      parentId: HQ_PAGE_ID,
      title: PLAN_PAGE_TITLE,
      content,
      agentName: AGENT_NAME,
    });

    logger.info("notion_operator_plan_created", { pageId: result.page.id });
    return { url: result.page.url || "", pageId: result.page.id, created: true };
  }

  /**
   * Update a specific day's task status in Notion.
   * Re-syncs the full page with the updated plan data.
   */
  static async updateDayProgress(
    plan: PlanDay[],
    day: number,
    taskId: string,
    status: PlanTask["status"],
    notes?: string
  ): Promise<void> {
    const dayEntry = plan.find((d) => d.day === day);
    if (!dayEntry) return;
    const task = dayEntry.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = status;
    if (notes) task.notes = notes;
    await NotionOperator.syncPlan(plan);
  }
}
