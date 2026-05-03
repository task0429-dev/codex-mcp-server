export interface PlanTask {
  id: string;
  title: string;
  owner: string;
  status: "todo" | "in_progress" | "done" | string;
  notes: string;
}

export interface ThirtyDayPlan {
  goal: string;
  scope: string;
  tasks: PlanTask[];
}

export class NotionOperator {
  // Placeholder operator for local/offline mode. Keeps command-center actions responsive.
  static async syncPlan(plan: ThirtyDayPlan): Promise<{ created: boolean; url: string }> {
    const slug = (plan.goal || "plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return {
      created: false,
      url: `https://www.notion.so/task-enterprise/${slug || "plan"}`,
    };
  }

  static async createTask(
    plan: ThirtyDayPlan,
    args: { id: string; title: string; owner: string },
    notes = ""
  ): Promise<PlanTask> {
    const task: PlanTask = {
      id: args.id,
      title: args.title,
      owner: args.owner,
      status: "todo",
      notes,
    };
    plan.tasks = [...(plan.tasks || []), task];
    return task;
  }
}
