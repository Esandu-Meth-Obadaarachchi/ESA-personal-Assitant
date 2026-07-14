import type { TaskPriority, TaskStatus } from "./types";

export interface StatusMeta {
  id: TaskStatus;
  label: string;
  /** Tailwind text colour token */
  color: string;
  /** Tailwind bg token for column headers / dots */
  dot: string;
}

export const STATUSES: StatusMeta[] = [
  { id: "todo", label: "To Do", color: "text-todo", dot: "bg-todo" },
  { id: "in_progress", label: "In Progress", color: "text-progress", dot: "bg-progress" },
  { id: "blocked", label: "Blocked", color: "text-blocked", dot: "bg-blocked" },
  { id: "done", label: "Done", color: "text-done", dot: "bg-done" },
];

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export function statusMeta(id: TaskStatus): StatusMeta {
  return STATUSES.find((s) => s.id === id) ?? STATUSES[0];
}

export interface PriorityMeta {
  id: TaskPriority;
  label: string;
  /** number of filled bars (1-4) for the indicator */
  level: number;
  color: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { id: "low", label: "Low", level: 1, color: "text-text-faint" },
  { id: "med", label: "Medium", level: 2, color: "text-info" },
  { id: "high", label: "High", level: 3, color: "text-warn" },
  { id: "urgent", label: "Urgent", level: 4, color: "text-danger" },
];

export const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "med", "low"];

export function priorityMeta(id: TaskPriority): PriorityMeta {
  return PRIORITIES.find((p) => p.id === id) ?? PRIORITIES[0];
}

/** Palette projects and workspaces rotate through. */
export const PROJECT_COLORS = [
  "#f5c518",
  "#60a5fa",
  "#4ade80",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#f87171",
];

export const WORKSPACE_EMOJIS = ["🏢", "💼", "🚀", "🌿", "🎓", "🏨", "⚡", "🧠"];

/** Max characters for a single agent chat message. Caps input tokens and cost;
 *  enforced on the composer and again server-side in /api/chat. */
export const MAX_CHAT_INPUT_CHARS = 2000;
