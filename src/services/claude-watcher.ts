import { ClaudeConversationsService } from "./claude-conversations-service";

let timer: NodeJS.Timeout | null = null;

export function startClaudeWatcher(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      ClaudeConversationsService.listProjects();
    } catch {
      // keep watcher resilient; this is best-effort warm-up
    }
  }, 60_000);
}

export function stopClaudeWatcher(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
