/**
 * Core domain model. Mirrors second-brain-app-spec.md §3.
 *
 *   Workspace (per business) -> Project (shares a RAG namespace)
 *     -> Task -> Subtask (recursive via parentId)
 *
 * Knowledge (RAG docs) and Execution (tasks) share the same project, so a task
 * can pull context from its project's knowledge base.
 */

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "med" | "high" | "urgent";
export type MemberRole = "owner" | "admin" | "member" | "client-viewer";

export interface WorkspaceMember {
  uid: string;
  name: string;
  email: string;
  photoURL?: string | null;
  role: MemberRole;
}

export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  /** uids with any access — used for Firestore `array-contains` isolation queries. */
  memberIds: string[];
  members: WorkspaceMember[];
  createdAt: number;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  /** Pinecone namespace holding this project's knowledge docs. */
  ragNamespace: string;
  color: string;
  archived?: boolean;
  /** The per-workspace catch-all for tasks not tied to a real project. */
  isInbox?: boolean;
  createdAt: number;
}

export interface LinkedDoc {
  id: string;
  title: string;
  source: string;
  score?: number;
}

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export interface Recurrence {
  freq: RecurrenceFreq;
  /** every N units (1 = every day/week/month). */
  interval: number;
}

export interface TimeEntry {
  id: string;
  /** epoch ms when the timer started. */
  start: number;
  /** epoch ms when it stopped; null while running. */
  end: number | null;
  /** cached duration in seconds once stopped (also used for manual entries). */
  seconds: number;
  note?: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string;
  /** null => top-level task; otherwise the parent task's id (recursive subtasks). */
  parentId: string | null;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeAvatar?: string | null;
  /** ISO date string (yyyy-mm-dd) or null. */
  dueDate?: string | null;
  /** Optional time of day (HH:MM, 24h). null => all-day. */
  dueTime?: string | null;
  startDate?: string | null;
  tags: string[];
  /** Task ids this task depends on. */
  dependencies: string[];
  linkedDocs: LinkedDoc[];
  /** Fractional-ish integer used to order siblings within a status column / level. */
  order: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  collapsed?: boolean;
  /** Repeat rule; when done, the next occurrence is spawned. */
  recurrence?: Recurrence | null;
  /** Time tracking log. */
  timeEntries?: TimeEntry[];
  /** Linked Google Calendar event id (when calendar sync is on). */
  googleEventId?: string | null;
}

/** Task augmented with its resolved children — built client-side from a flat list. */
export interface TaskNode extends Task {
  children: TaskNode[];
  depth: number;
}

/** Retrieval + chat wire types (RAG). */
export interface RetrievedChunk {
  id: string;
  score: number;
  text: string;
  source: string;
  project?: string;
}

export type AgentCardKind = "created_task" | "updated_task" | "task_list" | "sources" | "digest";

export interface AgentCard {
  kind: AgentCardKind;
  // deliberately loose — each card renderer narrows this
  data: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: string[];
  sources?: RetrievedChunk[];
  cards?: AgentCard[];
  createdAt: number;
  pending?: boolean;
}

export interface StandupDigest {
  overdue: Task[];
  dueToday: Task[];
  blocked: Task[];
  suggested: Task[];
  generatedAt: number;
}
