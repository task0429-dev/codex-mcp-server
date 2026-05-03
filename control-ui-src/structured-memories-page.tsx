import { useCallback, useEffect, useMemo, useState } from "react";
import { Btn, StatusBadge } from "./shell";
import { formatRelative } from "./types";

type ProviderFilter = "all" | "claude" | "codex";
type MemoryView = "structured" | "segments" | "problems" | "plans" | "decisions" | "next" | "timeline" | "raw" | "search";
type OverviewOrder = "recent" | "oldest" | "project" | "most_segments";

type ConversationRecord = {
  id: string;
  file: string;
  source: string;
  title: string;
  summary: string;
  executiveSummary: string;
  project: string;
  projectLabel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceUpdatedAt?: string;
  segmentCount: number;
  hasBlockers: boolean;
  hasNextSteps: boolean;
  hasCodePlan: boolean;
  hasFailedAttempt: boolean;
  problemsIdentified: string[];
  plansProposed: string[];
  buildTasks: string[];
  codeTasks: string[];
  uiTasks: string[];
  backendTasks: string[];
  automationTasks: string[];
  followUpActions: string[];
  repoReferences: string[];
  toolReferences: string[];
  finalStatus: string;
};

type SegmentRecord = {
  id: string;
  conversationId: string;
  title: string;
  userRequest: string;
  problemOrGoal: string;
  assistantResponseSummary: string;
  assistantPlan: string;
  category: string;
  priority: string;
  currentStatus: string;
  blockers: string[];
  completedActions: string[];
  failedAttempts: string[];
  nextSteps: string[];
  filesOrReposMentioned: string[];
  commandsOrCodeMentioned: string[];
  decisionsMade: string[];
  relatedProject: string;
  sourceTool: string;
  timeline: Array<{ at: string | null; role: string; detail: string }>;
  createdAt: string;
  updatedAt: string;
};

type DecisionRecord = {
  id: string;
  segmentId: string;
  decision: string;
  reason: string;
  impact: string;
  createdAt: string;
};

type TaskRecord = {
  id: string;
  segmentId: string;
  task: string;
  owner: string;
  status: string;
  priority: string;
  dueDate: string | null;
  updatedAt: string;
};

type TimelineEntry = {
  id: string;
  conversationId: string;
  segmentId: string | null;
  at: string | null;
  type: string;
  title: string;
  detail: string;
  status: string;
  project: string;
};

type ConversationDetail = {
  conversation: ConversationRecord;
  segments: SegmentRecord[];
  decisions: DecisionRecord[];
  tasks: TaskRecord[];
};

type RawMessage = {
  role: string;
  text: string;
  ts?: string | null;
};

const STATUS_OPTIONS = ["all", "planned", "in_progress", "blocked", "completed", "failed", "needs_review"];
const PRIORITY_OPTIONS = ["all", "high", "medium", "low"];
const OVERVIEW_ORDER_OPTIONS: Array<{ id: OverviewOrder; label: string }> = [
  { id: "recent", label: "Most Recent First" },
  { id: "oldest", label: "Oldest First" },
  { id: "project", label: "Grouped By Project" },
  { id: "most_segments", label: "Most Segments First" },
];
const VIEW_OPTIONS: Array<{ id: MemoryView; label: string }> = [
  { id: "structured", label: "Structured Summaries" },
  { id: "segments", label: "Segments" },
  { id: "problems", label: "Problems / Blockers" },
  { id: "plans", label: "Build Plans" },
  { id: "decisions", label: "Decisions" },
  { id: "next", label: "Next Actions" },
  { id: "timeline", label: "Timeline" },
  { id: "raw", label: "Raw Conversations" },
  { id: "search", label: "Search" },
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function buildQuery(input: Record<string, string | undefined | boolean>) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (typeof value === "boolean") {
      if (value) params.set(key, "1");
      return;
    }
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function metricCard(_label: string, _value: string | number, tone: "red" | "amber" | "green" | "slate" = "slate"): React.CSSProperties {
  const palette = {
    red: { border: "rgba(224,53,53,0.28)", glow: "rgba(224,53,53,0.18)", text: "#ffd1d1" },
    amber: { border: "rgba(245,158,11,0.28)", glow: "rgba(245,158,11,0.12)", text: "#fde68a" },
    green: { border: "rgba(34,197,94,0.28)", glow: "rgba(34,197,94,0.12)", text: "#bbf7d0" },
    slate: { border: "rgba(255,255,255,0.08)", glow: "rgba(255,255,255,0.04)", text: "#f3f4f6" },
  }[tone];
  return {
    border: `1px solid ${palette.border}`,
    background: `linear-gradient(180deg, rgba(15,15,18,0.96), ${palette.glow})`,
    borderRadius: 18,
    padding: "16px 18px",
    minHeight: 96,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: `0 18px 40px ${palette.glow}`,
    color: palette.text,
  };
}

function tonePill(active: boolean): React.CSSProperties {
  return {
    minHeight: 38,
    padding: "9px 14px",
    borderRadius: 999,
    border: active ? "1px solid rgba(224,53,53,0.45)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(224,53,53,0.16)" : "rgba(255,255,255,0.035)",
    color: active ? "#ffb0b0" : "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: "pointer",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function railCardStyle(highlight = false): React.CSSProperties {
  return {
    border: `1px solid ${highlight ? "rgba(224,53,53,0.24)" : "rgba(255,255,255,0.08)"}`,
    background: highlight ? "linear-gradient(180deg, rgba(35,11,13,0.94), rgba(14,14,18,0.98))" : "rgba(15,15,18,0.92)",
    borderRadius: 20,
    padding: 22,
    boxShadow: highlight ? "0 18px 38px rgba(224,53,53,0.12)" : "none",
  };
}

function actionButtonStyle(variant: "primary" | "secondary" = "secondary"): React.CSSProperties {
  const primary = variant === "primary";
  return {
    minHeight: 42,
    width: "100%",
    padding: "10px 14px",
    borderRadius: 12,
    border: primary ? "1px solid rgba(224,53,53,0.42)" : "1px solid rgba(255,255,255,0.1)",
    background: primary ? "linear-gradient(180deg, rgba(224,53,53,0.2), rgba(120,20,20,0.16))" : "rgba(255,255,255,0.04)",
    color: primary ? "#ffd0d0" : "#f3f4f6",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };
}

function listBlock(title: string, items: string[], empty = "None captured yet.") {
  const rows = items.length ? items : [empty];
  return (
    <div style={railCardStyle()}>
      <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.map((item, index) => (
          <div
            key={`${title}-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "14px 1fr",
              gap: 10,
              padding: "10px 0",
              borderTop: index ? "1px solid rgba(255,255,255,0.08)" : "none",
            }}
          >
            <div style={{ color: items.length ? "#ff8d8d" : "rgba(255,255,255,0.32)", fontSize: 14, lineHeight: 1.4 }}>•</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: items.length ? "#f3f4f6" : "rgba(255,255,255,0.42)" }}>
              {items.length ? item : empty}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function sourceTone(source: string) {
  return source === "codex"
    ? { bg: "rgba(59,130,246,0.18)", fg: "#bfdbfe", border: "rgba(96,165,250,0.3)", glow: "rgba(59,130,246,0.12)" }
    : { bg: "rgba(224,53,53,0.16)", fg: "#ffb0b0", border: "rgba(224,53,53,0.24)", glow: "rgba(224,53,53,0.08)" };
}

function formatCalendarDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function compactCardText(value: string, max = 88) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function uniqueNonEmpty(values: Array<string | null | undefined>, limit = 12) {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const value of values) {
    const normalized = (value || "").replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(normalized);
    if (results.length >= limit) break;
  }
  return results;
}

function deriveConversationAngle(conversation: ConversationRecord, used: Set<string>) {
  const candidates = [
    ...conversation.problemsIdentified.map((entry) => `Problem: ${entry}`),
    ...conversation.plansProposed.map((entry) => `Plan: ${entry}`),
    ...conversation.followUpActions.map((entry) => `Next: ${entry}`),
    ...conversation.repoReferences.map((entry) => `Repo: ${entry}`),
    ...conversation.toolReferences.map((entry) => `Tool: ${entry}`),
    conversation.summary,
    conversation.executiveSummary,
    conversation.title,
  ]
    .map((entry) => compactCardText(entry))
    .filter(Boolean);

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return candidate;
    }
  }

  return compactCardText(conversation.title || "Conversation");
}

function bulletRows(items: string[], accent = "#ff8d8d", empty = "None captured yet.") {
  const rows = items.length ? items : [empty];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {rows.map((item, index) => (
        <div
          key={`${accent}-${index}-${item.slice(0, 18)}`}
          style={{
            display: "grid",
            gridTemplateColumns: "14px 1fr",
            gap: 10,
            padding: "10px 0",
            borderTop: index ? "1px solid rgba(255,255,255,0.08)" : "none",
          }}
        >
          <div style={{ color: items.length ? accent : "rgba(255,255,255,0.32)", fontSize: 14, lineHeight: 1.4 }}>•</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: items.length ? "#f3f4f6" : "rgba(255,255,255,0.42)" }}>{item}</div>
        </div>
      ))}
    </div>
  );
}

export function StructuredMemoriesPage() {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1600 : window.innerWidth
  );
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [view, setView] = useState<MemoryView>("structured");
  const [overviewOrder, setOverviewOrder] = useState<OverviewOrder>("recent");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [agentToolFilter, setAgentToolFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasBlockers, setHasBlockers] = useState(false);
  const [hasNextSteps, setHasNextSteps] = useState(false);
  const [hasCodePlan, setHasCodePlan] = useState(false);
  const [hasFailedAttempt, setHasFailedAttempt] = useState(false);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [searchResults, setSearchResults] = useState<Array<{ conversation: ConversationRecord; relevance: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  const selectedConversation = detail?.conversation || conversations.find((entry) => entry.id === selectedConversationId) || null;
  const segments = detail?.segments || [];
  const selectedSegment = segments.find((entry) => entry.id === selectedSegmentId) || segments[0] || null;
  const decisions = detail?.decisions || [];
  const tasks = detail?.tasks || [];
  const isConversationOpen = Boolean(selectedConversationId);

  const availableProjects = useMemo(() => {
    const map = new Map<string, string>();
    conversations.forEach((conversation) => {
      if (conversation.project) map.set(conversation.project, conversation.projectLabel || conversation.project);
    });
    return Array.from(map.entries()).sort((left, right) => left[1].localeCompare(right[1]));
  }, [conversations]);

  const availableCategories = useMemo(() => {
    const values = new Set<string>();
    segments.forEach((segment) => values.add(segment.category));
    return Array.from(values).sort();
  }, [segments]);

  const stats = useMemo(() => {
    const blocked = conversations.filter((entry) => entry.status === "blocked").length;
    const next = conversations.filter((entry) => entry.hasNextSteps).length;
    const failed = conversations.filter((entry) => entry.hasFailedAttempt).length;
    const totalSegments = conversations.reduce((sum, entry) => sum + (entry.segmentCount || 0), 0);
    return { blocked, next, failed, totalSegments };
  }, [conversations]);

  const projectGroups = useMemo(() => {
    const groups = new Map<string, { id: string; label: string; conversations: ConversationRecord[]; latestAt: string }>();
    conversations.forEach((conversation) => {
      const id = conversation.project || "unlinked";
      const label = conversation.projectLabel || conversation.project || "Unlinked Memory";
      const existing = groups.get(id);
      if (existing) {
        existing.conversations.push(conversation);
        if (new Date(conversation.createdAt || conversation.updatedAt).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = conversation.createdAt || conversation.updatedAt;
        }
        return;
      }
      groups.set(id, {
        id,
        label,
        conversations: [conversation],
        latestAt: conversation.createdAt || conversation.updatedAt,
      });
    });
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        conversations: [...group.conversations].sort((left, right) => new Date(right.createdAt || right.updatedAt).getTime() - new Date(left.createdAt || left.updatedAt).getTime()),
      }))
      .sort((left, right) => {
        if (right.conversations.length !== left.conversations.length) return right.conversations.length - left.conversations.length;
        return new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime();
      });
  }, [conversations]);

  const orderedOverviewConversations = useMemo(() => {
    const entries = [...conversations];
    const byDate = (left: ConversationRecord, right: ConversationRecord) =>
      new Date(right.createdAt || right.updatedAt).getTime() - new Date(left.createdAt || left.updatedAt).getTime();

    if (overviewOrder === "oldest") {
      return entries.sort((left, right) => -byDate(left, right));
    }

    if (overviewOrder === "most_segments") {
      return entries.sort((left, right) => {
        if ((right.segmentCount || 0) !== (left.segmentCount || 0)) {
          return (right.segmentCount || 0) - (left.segmentCount || 0);
        }
        return byDate(left, right);
      });
    }

    return entries.sort(byDate);
  }, [conversations, overviewOrder]);

  const loadConversations = useCallback(async (preferCurrentSelection = true) => {
    setLoading(true);
    setError("");
    try {
      const query = buildQuery({
        provider: provider === "all" ? undefined : provider,
        project: projectFilter === "all" ? undefined : projectFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        priority: priorityFilter === "all" ? undefined : priorityFilter,
        agentOrTool: agentToolFilter || undefined,
        q: searchQuery || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        hasBlockers,
        hasNextSteps,
        hasCodePlan,
        hasFailedAttempt,
      });
      const payload = await fetchJson<{ conversations: ConversationRecord[] }>(`/api/conversations/intelligence${query}`);
      const nextConversations = Array.isArray(payload.conversations) ? payload.conversations : [];
      setConversations(nextConversations);
      const nextSelected = preferCurrentSelection && nextConversations.some((entry) => entry.id === selectedConversationId)
        ? selectedConversationId
        : "";
      setSelectedConversationId(nextSelected);
      if (!nextConversations.length) {
        setDetail(null);
        setSelectedSegmentId("");
        setRawMessages([]);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load structured memories.");
      setConversations([]);
      setSelectedConversationId("");
      setDetail(null);
      setSelectedSegmentId("");
      setRawMessages([]);
    } finally {
      setLoading(false);
    }
  }, [
    agentToolFilter,
    categoryFilter,
    dateFrom,
    dateTo,
    hasBlockers,
    hasCodePlan,
    hasFailedAttempt,
    hasNextSteps,
    priorityFilter,
    projectFilter,
    provider,
    searchQuery,
    selectedConversationId,
    statusFilter,
  ]);

  const loadTimeline = useCallback(async (project?: string) => {
    const query = buildQuery({ project });
    const payload = await fetchJson<{ timeline: TimelineEntry[] }>(`/api/conversations/timeline${query}`);
    setTimeline(Array.isArray(payload.timeline) ? payload.timeline : []);
  }, []);

  const loadConversationDetail = useCallback(async (conversation: ConversationRecord | null) => {
    if (!conversation) {
      setDetail(null);
      setSelectedSegmentId("");
      setRawMessages([]);
      return;
    }
    setLoadingDetail(true);
    setError("");
    try {
      const summary = await fetchJson<ConversationDetail>(`/api/conversations/summary${buildQuery({ conversationId: conversation.id })}`);
      setDetail(summary);
      const nextSegments = Array.isArray(summary.segments) ? summary.segments : [];
      setSelectedSegmentId((current) => nextSegments.some((segment) => segment.id === current) ? current : (nextSegments[0]?.id || ""));
      const providerSource = conversation.source || "claude";
      const messages = await fetchJson<{ messages: RawMessage[] }>(`/api/conversations/messages${buildQuery({ provider: providerSource, file: conversation.file })}`);
      setRawMessages(Array.isArray(messages.messages) ? messages.messages : []);
      await loadTimeline(conversation.project);
    } catch (err: any) {
      setError(err?.message || "Unable to load conversation detail.");
      setDetail(null);
      setRawMessages([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [loadTimeline]);

  const loadSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const query = buildQuery({
        q: searchQuery,
        provider: provider === "all" ? undefined : provider,
        project: projectFilter === "all" ? undefined : projectFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      const payload = await fetchJson<{ results: Array<{ conversation: ConversationRecord; relevance: number }> }>(`/api/conversations/search${query}`);
      setSearchResults(Array.isArray(payload.results) ? payload.results : []);
    } catch {
      setSearchResults([]);
    }
  }, [projectFilter, provider, searchQuery, statusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const selected = conversations.find((entry) => entry.id === selectedConversationId) || null;
    void loadConversationDetail(selected);
  }, [conversations, loadConversationDetail, selectedConversationId]);

  useEffect(() => {
    if (view === "search") void loadSearch();
  }, [loadSearch, view]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadConversations();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [loadConversations]);

  const refreshSelected = useCallback(async () => {
    const selected = conversations.find((entry) => entry.id === selectedConversationId) || null;
    await loadConversationDetail(selected);
    await loadConversations();
  }, [conversations, loadConversationDetail, loadConversations, selectedConversationId]);

  const updateSegmentStatus = useCallback(async (status: string) => {
    if (!selectedSegment) return;
    await fetchJson(`/api/conversations/segments/${encodeURIComponent(selectedSegment.id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refreshSelected();
  }, [refreshSelected, selectedSegment]);

  const addTask = useCallback(async () => {
    if (!selectedSegment) return;
    const task = window.prompt("Add a TASK action for this segment:", selectedSegment.nextSteps[0] || selectedSegment.title);
    if (!task || !task.trim()) return;
    await fetchJson(`/api/conversations/segments/${encodeURIComponent(selectedSegment.id)}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: task.trim(), owner: "TASK" }),
    });
    await refreshSelected();
  }, [refreshSelected, selectedSegment]);

  const linkProject = useCallback(async () => {
    if (!selectedSegment) return;
    const project = window.prompt("Link this segment to a project id:", selectedSegment.relatedProject || selectedConversation?.project || "");
    if (!project || !project.trim()) return;
    await fetchJson(`/api/conversations/segments/${encodeURIComponent(selectedSegment.id)}/project`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: project.trim() }),
    });
    await refreshSelected();
  }, [refreshSelected, selectedConversation?.project, selectedSegment]);

  const regenerateSummary = useCallback(async () => {
    if (!selectedConversation) return;
    await fetchJson("/api/conversations/regenerate-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedConversation.id }),
    });
    await refreshSelected();
  }, [refreshSelected, selectedConversation]);

  const reprocessConversation = useCallback(async () => {
    if (!selectedConversation) return;
    await fetchJson("/api/conversations/reprocess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: selectedConversation.file }),
    });
    await refreshSelected();
  }, [refreshSelected, selectedConversation]);

  const openConversation = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    setView("structured");
  }, []);

  const closeConversation = useCallback(() => {
    setSelectedConversationId("");
    setSelectedSegmentId("");
    setDetail(null);
    setRawMessages([]);
  }, []);

  const visibleSegments = useMemo(() => {
    return segments.filter((segment) => {
      if (categoryFilter !== "all" && segment.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && segment.priority !== priorityFilter) return false;
      if (statusFilter !== "all" && segment.currentStatus !== statusFilter) return false;
      if (hasBlockers && segment.blockers.length === 0) return false;
      if (hasNextSteps && segment.nextSteps.length === 0) return false;
      if (hasFailedAttempt && segment.failedAttempts.length === 0) return false;
      if (hasCodePlan && segment.commandsOrCodeMentioned.length === 0 && !segment.assistantPlan.trim()) return false;
      if (!searchQuery.trim()) return true;
      const haystack = [
        segment.title,
        segment.userRequest,
        segment.problemOrGoal,
        segment.assistantResponseSummary,
        segment.assistantPlan,
        ...segment.blockers,
        ...segment.nextSteps,
      ].join("\n").toLowerCase();
      return haystack.includes(searchQuery.toLowerCase());
    });
  }, [categoryFilter, hasBlockers, hasCodePlan, hasFailedAttempt, hasNextSteps, priorityFilter, searchQuery, segments, statusFilter]);

  const conversationProblems = useMemo(() => uniqueNonEmpty([
    ...(selectedConversation?.problemsIdentified || []),
    ...segments.flatMap((segment) => [segment.problemOrGoal, ...segment.blockers, ...segment.failedAttempts]),
  ], 12), [segments, selectedConversation]);

  const conversationObjectives = useMemo(() => uniqueNonEmpty([
    ...(selectedConversation?.buildTasks || []),
    ...(selectedConversation?.codeTasks || []),
    ...(selectedConversation?.uiTasks || []),
    ...(selectedConversation?.backendTasks || []),
    ...(selectedConversation?.automationTasks || []),
    ...(selectedConversation?.followUpActions || []),
    ...segments.map((segment) => segment.title),
  ], 12), [segments, selectedConversation]);

  const conversationRoles = useMemo(() => uniqueNonEmpty([
    "TASK · requester / operator",
    selectedConversation ? `${selectedConversation.source.toUpperCase()} · assistant / builder` : "",
    rawMessages.some((message) => message.role === "tool") ? "Tooling · execution context" : "",
  ], 6), [rawMessages, selectedConversation]);

  const conversationKeywords = useMemo(() => uniqueNonEmpty([
    ...(selectedConversation?.repoReferences || []),
    ...(selectedConversation?.toolReferences || []),
    ...segments.flatMap((segment) => [...segment.filesOrReposMentioned, ...segment.commandsOrCodeMentioned]),
  ], 14), [segments, selectedConversation]);

  const workspaceColumns = viewportWidth >= 1720
    ? "minmax(0, 0.95fr) minmax(0, 1.35fr) minmax(280px, 0.88fr)"
    : viewportWidth >= 1380
      ? "minmax(0, 1fr) minmax(0, 1.18fr)"
      : "minmax(0, 1fr)";

  const detailColumns = viewportWidth >= 1500
    ? "minmax(250px, 0.8fr) minmax(0, 1.2fr)"
    : "minmax(0, 1fr)";

  const overviewHeading = overviewOrder === "project"
    ? "Grouped by project, conversation detail on click"
    : overviewOrder === "oldest"
      ? "Oldest conversations first, regardless of project"
      : overviewOrder === "most_segments"
        ? "Highest-detail conversations first"
        : "Most recent conversations first, regardless of project";

  const overviewMetaLabel = overviewOrder === "project"
    ? "Project Memory Map"
    : overviewOrder === "oldest"
      ? "Conversation Timeline"
      : overviewOrder === "most_segments"
        ? "Conversation Depth"
        : "Latest Conversations";

  const overviewMetaValue = loading
    ? "Refreshing…"
    : overviewOrder === "project"
      ? `${projectGroups.length} active project shelves`
      : `${orderedOverviewConversations.length} conversations in view`;

  const renderConversationCard = (conversation: ConversationRecord, usedAngles: Set<string>) => {
    const sourceColors = sourceTone(conversation.source);
    const angle = deriveConversationAngle(conversation, usedAngles);
    return (
      <button
        key={conversation.id}
        type="button"
        onClick={() => openConversation(conversation.id)}
        style={{
          textAlign: "left",
          padding: 14,
          borderRadius: 16,
          border: `1px solid ${sourceColors.border}`,
          background: conversation.source === "codex"
            ? "linear-gradient(180deg, rgba(14,20,34,0.98), rgba(10,12,20,0.98))"
            : "linear-gradient(180deg, rgba(24,18,22,0.98), rgba(12,10,14,0.98))",
          boxShadow: `0 10px 24px ${sourceColors.glow}`,
          cursor: "pointer",
          display: "grid",
          gap: 10,
          minWidth: 0,
          alignContent: "start",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{
            fontSize: 14,
            fontWeight: 900,
            lineHeight: 1.28,
            color: "#f8fafc",
            minWidth: 0,
            overflowWrap: "anywhere",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {compactCardText(conversation.title, 54)}
          </div>
          <span style={{
            alignSelf: "flex-start",
            fontSize: 9,
            padding: "5px 7px",
            borderRadius: 999,
            background: sourceColors.bg,
            color: sourceColors.fg,
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            flexShrink: 0,
            border: `1px solid ${sourceColors.border}`,
            maxWidth: 72,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {conversation.source}
          </span>
        </div>

        <div style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: conversation.source === "codex" ? "#dbeafe" : "#f3d6d6",
          minHeight: 54,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          overflowWrap: "anywhere",
        }}>
          {angle}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.58)" }}>{formatCalendarDate(conversation.createdAt || conversation.updatedAt)}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.42)" }}>{conversation.segmentCount} segments</span>
        </div>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: 1760, margin: "0 auto", paddingBottom: 40, minWidth: 0 }}>
      <section style={{
        borderRadius: 26,
        border: "1px solid rgba(224,53,53,0.22)",
        background: "radial-gradient(circle at top right, rgba(224,53,53,0.14), transparent 34%), linear-gradient(180deg, rgba(17,17,21,0.98), rgba(10,10,14,0.98))",
        padding: 28,
        boxShadow: "0 30px 80px rgba(0,0,0,0.34)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#ff8d8d", marginBottom: 8 }}>
              Memories Intelligence
            </div>
            <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: "#f8fafc", marginBottom: 10 }}>
              Structured conversation memory for Claude and Codex
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.72)", maxWidth: 760 }}>
              Every synced conversation stays available in raw form, but now it also lands as operational memory with extracted segments, blockers, build plans, decisions, next actions, project links, and timeline status.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["all", "claude", "codex"] as ProviderFilter[]).map((entry) => (
              <button key={entry} type="button" style={tonePill(provider === entry)} onClick={() => setProvider(entry)}>
                {entry === "all" ? "All Sources" : entry}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 22 }}>
          <div style={metricCard("Conversations", conversations.length, "slate")}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Conversations</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{conversations.length}</div>
          </div>
          <div style={metricCard("Segments", stats.totalSegments, "red")}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Extracted Segments</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{stats.totalSegments}</div>
          </div>
          <div style={metricCard("Blocked", stats.blocked, "amber")}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Blocked Threads</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{stats.blocked}</div>
          </div>
          <div style={metricCard("Next", stats.next, "green")}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Has Next Actions</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{stats.next}</div>
          </div>
        </div>
      </section>

      <section style={railCardStyle()}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          <input className="field field-sm" placeholder="Search conversations, summaries, raw text…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          <select className="field field-sm" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">All Projects</option>
            {availableProjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select className="field field-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_OPTIONS.map((entry) => <option key={entry} value={entry}>{entry === "all" ? "All Statuses" : entry}</option>)}
          </select>
          <select className="field field-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All Categories</option>
            {availableCategories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          <select className="field field-sm" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
            {PRIORITY_OPTIONS.map((entry) => <option key={entry} value={entry}>{entry === "all" ? "All Priorities" : entry}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginTop: 14, alignItems: "start" }}>
          <input className="field field-sm" placeholder="Agent / tool filter" value={agentToolFilter} onChange={(event) => setAgentToolFilter(event.target.value)} />
          <input className="field field-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input className="field field-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", paddingTop: 6 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.65)" }}><input type="checkbox" checked={hasBlockers} onChange={(event) => setHasBlockers(event.target.checked)} /> Has blockers</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.65)" }}><input type="checkbox" checked={hasNextSteps} onChange={(event) => setHasNextSteps(event.target.checked)} /> Has next steps</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.65)" }}><input type="checkbox" checked={hasCodePlan} onChange={(event) => setHasCodePlan(event.target.checked)} /> Has code plan</label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.65)" }}><input type="checkbox" checked={hasFailedAttempt} onChange={(event) => setHasFailedAttempt(event.target.checked)} /> Failed attempt</label>
          </div>
        </div>
      </section>

      {isConversationOpen ? (
        <section style={{ ...railCardStyle(), padding: 18, display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={tonePill(false)} onClick={closeConversation}>Back To Overview</button>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
              Conversation date: {selectedConversation ? formatCalendarDate(selectedConversation.createdAt || selectedConversation.updatedAt) : "Unknown"}
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.68)", maxWidth: 760 }}>
            Full conversation appears on the left. Structured summary, problem, solution, notes, blockers, files, and next actions appear on the right.
          </div>
        </section>
      ) : (
        <section style={{ ...railCardStyle(), padding: 18, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8d8d", marginBottom: 6 }}>Overview Mode</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc" }}>{overviewHeading}</div>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginLeft: "auto" }}>
            <div style={{ minWidth: 230 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.44)", marginBottom: 6 }}>View Conversations By</div>
              <select className="field field-sm" value={overviewOrder} onChange={(event) => setOverviewOrder(event.target.value as OverviewOrder)}>
                {OVERVIEW_ORDER_OPTIONS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.68)", maxWidth: 760 }}>
              Each card stays cropped to topic, source, date, main difference, and next move. Use the dropdown to switch between chronological review and project-grouped shelves before opening the full structured memory.
            </div>
          </div>
        </section>
      )}

      {error && (
        <div style={{ ...railCardStyle(true), color: "#fecaca", fontSize: 13 }}>
          {error}
        </div>
      )}

      {!isConversationOpen ? (
        <section style={{ display: "grid", gap: 22 }}>
          <div style={{ ...railCardStyle(), display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)" }}>{overviewMetaLabel}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>{overviewMetaValue}</div>
              </div>
              <Btn onClick={() => void loadConversations(false)} size="sm">Refresh</Btn>
            </div>
            {overviewOrder === "project" ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {projectGroups.map((group) => (
                  <span key={group.id} style={{ fontSize: 11, padding: "7px 11px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.035)", color: "rgba(255,255,255,0.72)", fontWeight: 700 }}>
                    {group.label} · {group.conversations.length}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.62)" }}>
                {overviewOrder === "recent" && "Showing the latest conversation first across Claude and Codex, regardless of project."}
                {overviewOrder === "oldest" && "Showing the earliest conversation first so you can walk the archive from the beginning."}
                {overviewOrder === "most_segments" && "Showing the most operationally dense conversations first based on extracted segments."}
              </div>
            )}
          </div>

          {overviewOrder === "project" ? (
            projectGroups.map((group) => (
              <div key={group.id} style={{ ...railCardStyle(), display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8d8d", marginBottom: 6 }}>Project</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#f8fafc" }}>{group.label}</div>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{group.conversations.length} conversations</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Latest {formatCalendarDate(group.latestAt)}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
                  {(() => {
                    const usedAngles = new Set<string>();
                    return group.conversations.map((conversation) => renderConversationCard(conversation, usedAngles));
                  })()}
                </div>
              </div>
            ))
          ) : (
            <div style={{ ...railCardStyle(), display: "grid", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8d8d", marginBottom: 6 }}>{overviewMetaLabel}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#f8fafc" }}>
                    {overviewOrder === "oldest" ? "Starting from the first conversations" : overviewOrder === "most_segments" ? "Deepest structured conversations first" : "Starting from the latest conversations"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{orderedOverviewConversations.length} conversations</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    {orderedOverviewConversations[0] ? formatCalendarDate(orderedOverviewConversations[0].createdAt || orderedOverviewConversations[0].updatedAt) : "No date"}
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
                {(() => {
                  const usedAngles = new Set<string>();
                  return orderedOverviewConversations.map((conversation) => renderConversationCard(conversation, usedAngles));
                })()}
              </div>
            </div>
          )}

          {!conversations.length && !loading && (
            <div style={{ padding: 18, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.48)", fontSize: 13 }}>
              No structured memories matched this filter set.
            </div>
          )}
        </section>
      ) : (
      <section style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
        <div style={railCardStyle(true)}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ minWidth: 0, maxWidth: 920 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8d8d", marginBottom: 8 }}>Conversation Briefing</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", lineHeight: 1.15, overflowWrap: "anywhere" }}>
                {selectedConversation?.title || "Select a conversation"}
              </div>
              <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.72, color: "rgba(255,255,255,0.76)" }}>
                {selectedConversation?.executiveSummary || "Structured executive summary will appear here."}
              </div>
            </div>
            {selectedConversation && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, padding: "5px 9px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.76)" }}>{selectedConversation.projectLabel}</span>
                <StatusBadge value={selectedConversation.status} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.48)" }}>{formatCalendarDate(selectedConversation.createdAt || selectedConversation.updatedAt)}</span>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div style={railCardStyle()}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Problems</div>
              {bulletRows(conversationProblems.slice(0, 6), "#fca5a5", "No problems extracted yet.")}
            </div>

            <div style={railCardStyle()}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Objectives</div>
              {bulletRows(conversationObjectives.slice(0, 6), "#93c5fd", "No objectives extracted yet.")}
            </div>

            <div style={railCardStyle()}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Roles</div>
              {bulletRows(conversationRoles, "#c4b5fd")}
            </div>

            <div style={railCardStyle()}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Keywords / References</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {conversationKeywords.slice(0, 10).map((item, index) => (
                  <span key={`keyword-${index}`} style={{ fontSize: 10, padding: "5px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.76)" }}>
                    {compactCardText(item, 42)}
                  </span>
                ))}
                {!conversationKeywords.length && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)" }}>No searchable references extracted yet.</div>}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: workspaceColumns, gap: 20, alignItems: "start", minWidth: 0 }}>
        <div style={{ ...railCardStyle(), minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)" }}>Full Conversation</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>{selectedConversation ? "Transcript from start to finish" : "Select a conversation"}</div>
            </div>
            <Btn onClick={() => void refreshSelected()} size="sm" disabled={!selectedConversation}>Refresh</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rawMessages.map((message, index) => (
              <div key={`${message.role}-${index}`} style={{
                border: `1px solid ${message.role === "user" ? "rgba(224,53,53,0.18)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 16,
                padding: 16,
                background: message.role === "user" ? "rgba(224,53,53,0.07)" : "rgba(255,255,255,0.025)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: message.role === "user" ? "#ffb0b0" : "rgba(255,255,255,0.5)" }}>
                    {message.role}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{message.ts ? formatCalendarDate(message.ts) : ""}</div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.75, color: "#f3f4f6", whiteSpace: "pre-wrap" }}>{message.text}</div>
              </div>
            ))}
            {!rawMessages.length && !loadingDetail && (
              <div style={{ padding: 18, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.48)", fontSize: 13 }}>
                No raw messages loaded for this conversation yet.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div style={railCardStyle(true)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ff8d8d", marginBottom: 8 }}>Conversation Workspace</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#f8fafc", lineHeight: 1.15, overflowWrap: "anywhere" }}>
                  {selectedConversation?.title || "Select a conversation"}
                </div>
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.72)" }}>
                  {selectedConversation?.executiveSummary || "Structured executive summary will appear here."}
                </div>
              </div>
              {selectedConversation && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, padding: "5px 9px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.76)" }}>{selectedConversation.projectLabel}</span>
                  <StatusBadge value={selectedConversation.status} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.48)" }}>{formatCalendarDate(selectedConversation.createdAt || selectedConversation.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: detailColumns, gap: 18, minWidth: 0 }}>
            <div style={{ ...railCardStyle(), minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>Detailed Notes</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#f8fafc" }}>{visibleSegments.length} structured memory blocks</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {visibleSegments.map((segment, index) => (
                  <button
                    key={segment.id}
                    type="button"
                    onClick={() => setSelectedSegmentId(segment.id)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      borderRadius: 14,
                      border: selectedSegment?.id === segment.id ? "1px solid rgba(224,53,53,0.32)" : "1px solid rgba(255,255,255,0.07)",
                      background: selectedSegment?.id === segment.id ? "rgba(224,53,53,0.10)" : "rgba(255,255,255,0.02)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 800, letterSpacing: "0.12em" }}>NOTE {index + 1}</div>
                      <StatusBadge value={segment.currentStatus} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", lineHeight: 1.35 }}>{segment.title}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                      <span style={{ fontSize: 10, padding: "4px 7px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}>{segment.category}</span>
                      <span style={{ fontSize: 10, padding: "4px 7px", borderRadius: 999, background: "rgba(224,53,53,0.12)", color: "#ffb0b0" }}>{segment.priority}</span>
                    </div>
                    <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, display: "grid", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.36)", marginBottom: 6 }}>Summary</div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.78)" }}>
                          • {segment.assistantResponseSummary || segment.problemOrGoal}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.36)", marginBottom: 6 }}>Objective</div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.62)" }}>
                          • {segment.userRequest || segment.problemOrGoal}
                        </div>
                      </div>
                      {!!segment.blockers.length && (
                        <div>
                          <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fca5a5", marginBottom: 6 }}>Problems</div>
                          <div style={{ display: "grid", gap: 4 }}>
                            {segment.blockers.slice(0, 3).map((blocker, blockerIndex) => (
                              <div key={`${segment.id}-blocker-${blockerIndex}`} style={{ fontSize: 11, lineHeight: 1.55, color: "#fca5a5" }}>
                                • {blocker}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                {!visibleSegments.length && (
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>No extracted segments match the current filters.</div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              {view === "structured" && selectedConversation && (
                <>
                  <div style={railCardStyle()}>
                    <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Executive Summary</div>
                    <div style={{ fontSize: 15, lineHeight: 1.75, color: "#f3f4f6" }}>{selectedConversation.executiveSummary}</div>
                  </div>
                  {listBlock("Problems Identified", selectedConversation.problemsIdentified)}
                  {listBlock("Plans Proposed", selectedConversation.plansProposed)}
                  {listBlock("Follow-up Actions", selectedConversation.followUpActions)}
                </>
              )}

              {view === "segments" && selectedSegment && (
                <>
                  <div style={railCardStyle(true)}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#f8fafc", minWidth: 0, overflowWrap: "anywhere" }}>{selectedSegment.title}</div>
                      <StatusBadge value={selectedSegment.currentStatus} />
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#ff8d8d", marginBottom: 6 }}>User Request</div>
                        <div style={{ fontSize: 14, lineHeight: 1.7, color: "#f3f4f6" }}>{selectedSegment.userRequest}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#ff8d8d", marginBottom: 6 }}>Assistant Response Summary</div>
                        <div style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.82)" }}>{selectedSegment.assistantResponseSummary || "No summary captured yet."}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#ff8d8d", marginBottom: 6 }}>Assistant Plan</div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.7, color: "#f3f4f6" }}>{selectedSegment.assistantPlan || "No plan captured yet."}</pre>
                      </div>
                    </div>
                  </div>
                  {listBlock("Completed Actions", selectedSegment.completedActions)}
                  {listBlock("Failed Attempts", selectedSegment.failedAttempts)}
                </>
              )}

              {view === "problems" && selectedSegment && (
                <>
                  {listBlock("Blockers", selectedSegment.blockers)}
                  {listBlock("Failed Attempts", selectedSegment.failedAttempts)}
                  {listBlock("Main Problem", [selectedSegment.problemOrGoal])}
                </>
              )}

              {view === "plans" && selectedConversation && (
                <>
                  {listBlock("Build Tasks", selectedConversation.plansProposed)}
                  {listBlock("UI Tasks", selectedConversation.repoReferences.filter((entry) => /ui|page|component|tsx|css/i.test(entry)))}
                  {listBlock("Backend Tasks", selectedConversation.repoReferences.filter((entry) => /api|service|src|server|route/i.test(entry)))}
                </>
              )}

              {view === "decisions" && (
                <div style={railCardStyle()}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Memory Decisions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {decisions.map((decision) => (
                      <div key={decision.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", marginBottom: 6 }}>{decision.decision}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.66)" }}>{decision.reason}</div>
                        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.48)" }}>{decision.impact}</div>
                      </div>
                    ))}
                    {!decisions.length && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>No decisions extracted yet.</div>}
                  </div>
                </div>
              )}

              {view === "next" && (
                <div style={railCardStyle()}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Next Actions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {tasks.map((task) => (
                      <div key={task.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc" }}>{task.task}</div>
                          <StatusBadge value={task.status} />
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{task.owner} · {task.priority}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>{formatRelative(task.updatedAt)}</div>
                      </div>
                    ))}
                    {!tasks.length && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>No follow-up tasks have been materialized yet.</div>}
                  </div>
                </div>
              )}

              {view === "timeline" && (
                <div style={railCardStyle()}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Project-linked Timeline</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {timeline.map((entry) => (
                      <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)" }}>{entry.at ? formatRelative(entry.at) : "Unknown"}</div>
                        <div style={{ borderLeft: "2px solid rgba(224,53,53,0.24)", paddingLeft: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#f8fafc" }}>{entry.title}</div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.68)" }}>{entry.detail}</div>
                        </div>
                      </div>
                    ))}
                    {!timeline.length && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>No timeline entries for this project yet.</div>}
                  </div>
                </div>
              )}

              {view === "raw" && (
                <div style={railCardStyle()}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Raw Conversation</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {rawMessages.map((message, index) => (
                      <div key={`${message.role}-${index}`} style={{
                        border: `1px solid ${message.role === "user" ? "rgba(224,53,53,0.16)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 14,
                        padding: 14,
                        background: message.role === "user" ? "rgba(224,53,53,0.06)" : "rgba(255,255,255,0.02)",
                      }}>
                        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: message.role === "user" ? "#ffb0b0" : "rgba(255,255,255,0.5)", marginBottom: 8 }}>
                          {message.role}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.7, color: "#f3f4f6", whiteSpace: "pre-wrap" }}>{message.text}</div>
                      </div>
                    ))}
                    {!rawMessages.length && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>No raw messages loaded yet.</div>}
                  </div>
                </div>
              )}

              {view === "search" && (
                <div style={railCardStyle()}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Search Results</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {searchResults.map((entry) => (
                      <button
                        key={entry.conversation.id}
                        type="button"
                        onClick={() => {
                          openConversation(entry.conversation.id);
                        }}
                        style={{ textAlign: "left", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)", cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc" }}>{entry.conversation.title}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Relevance {entry.relevance}</div>
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.68)" }}>{entry.conversation.executiveSummary}</div>
                      </button>
                    ))}
                    {!searchResults.length && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Search inside summaries and raw conversation text by entering a query above.</div>}
                  </div>
                </div>
              )}

              {!selectedConversation && !loadingDetail && (
                <div style={{ ...railCardStyle(), color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
                  Select a conversation to open structured memory, segments, blockers, plans, and raw transcript side by side.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ ...railCardStyle(), display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>Summary And Notes</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#f8fafc", overflowWrap: "anywhere" }}>Problem, solution, notes, blockers, files, and actions</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <button type="button" style={actionButtonStyle("primary")} onClick={() => void regenerateSummary()} disabled={!selectedConversation}>Regenerate Summary</button>
            <button type="button" style={actionButtonStyle()} onClick={() => void reprocessConversation()} disabled={!selectedConversation}>Reprocess Segments</button>
            <button type="button" style={actionButtonStyle()} onClick={() => void updateSegmentStatus("completed")} disabled={!selectedSegment}>Mark Segment Complete</button>
            <button type="button" style={actionButtonStyle()} onClick={() => void updateSegmentStatus("blocked")} disabled={!selectedSegment}>Mark Blocked</button>
            <button type="button" style={actionButtonStyle()} onClick={() => void addTask()} disabled={!selectedSegment}>Add to Tasks</button>
            <button type="button" style={actionButtonStyle()} onClick={() => void linkProject()} disabled={!selectedSegment}>Link to Project</button>
          </div>

          {selectedSegment && (
            <>
              <div style={railCardStyle()}>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>Selected Segment</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#f8fafc", marginBottom: 8 }}>{selectedSegment.title}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <StatusBadge value={selectedSegment.currentStatus} />
                  <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }}>{selectedSegment.category}</span>
                  <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 999, background: "rgba(224,53,53,0.12)", color: "#ffb0b0" }}>{selectedSegment.priority}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.74)" }}>{selectedSegment.problemOrGoal}</div>
              </div>

              {listBlock("Plan", selectedSegment.assistantPlan ? selectedSegment.assistantPlan.split("\n").filter(Boolean) : [])}
              {listBlock("Blockers", selectedSegment.blockers)}
              {listBlock("Files / Repos", selectedSegment.filesOrReposMentioned)}
              {listBlock("Commands / Code", selectedSegment.commandsOrCodeMentioned)}
              {listBlock("Next Actions", selectedSegment.nextSteps)}
            </>
          )}
        </div>
        </div>
      </section>
      )}
    </div>
  );
}
