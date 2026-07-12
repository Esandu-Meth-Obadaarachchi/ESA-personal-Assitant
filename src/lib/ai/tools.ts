import type Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase/admin";
import { embedQuery } from "./voyage";
import { queryNamespace, queryNamespaces } from "./pinecone";
import type { AgentCard, RetrievedChunk, Task, TaskPriority, TaskStatus } from "@/lib/types";

export interface ProjectRef {
  id: string;
  name: string;
  ragNamespace: string;
}

export interface ToolContext {
  uid: string;
  userName: string;
  workspaceId: string;
  memberIds: string[];
  currentProjectId?: string;
  projects: ProjectRef[];
  // artifacts accumulated during a run, surfaced back to the UI
  sources: RetrievedChunk[];
  cards: AgentCard[];
  steps: string[];
}

/** Tool schemas advertised to Claude. */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_knowledge",
    description:
      "Search the user's uploaded documents (the knowledge base) for relevant passages. Use for any question about past decisions, specs, notes or facts that would live in a document.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        project: { type: "string", description: "Optional project name to scope the search to" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks. Use to answer 'what's overdue', 'what's due today', 'what's on my plate', project status, etc.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Optional project name to scope to" },
        status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
        filter: { type: "string", enum: ["overdue", "due_today", "all"], description: "Time filter" },
      },
    },
  },
  {
    name: "create_task",
    description: "Create a new task or subtask. Resolve relative dates to yyyy-mm-dd before calling.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        project: { type: "string", description: "Project name; defaults to the current project" },
        status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
        priority: { type: "string", enum: ["low", "med", "high", "urgent"] },
        due_date: { type: "string", description: "yyyy-mm-dd" },
        parent_title: { type: "string", description: "If this is a subtask, the parent task's title" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update an existing task by its title. Set any of status, priority, due date or title.",
    input_schema: {
      type: "object",
      properties: {
        task_title: { type: "string", description: "Title (or close match) of the task to update" },
        set_status: { type: "string", enum: ["todo", "in_progress", "blocked", "done"] },
        set_priority: { type: "string", enum: ["low", "med", "high", "urgent"] },
        set_due_date: { type: "string", description: "yyyy-mm-dd, or empty string to clear" },
        set_title: { type: "string" },
      },
      required: ["task_title"],
    },
  },
  {
    name: "summarize_project",
    description: "Get a project's tasks and top knowledge snippets so you can summarise its status.",
    input_schema: {
      type: "object",
      properties: { project: { type: "string" } },
    },
  },
];

/* --------------------------------- helpers --------------------------------- */

function resolveProject(ctx: ToolContext, name?: string): ProjectRef | undefined {
  if (!name) return ctx.projects.find((p) => p.id === ctx.currentProjectId) ?? ctx.projects[0];
  const n = name.toLowerCase();
  return (
    ctx.projects.find((p) => p.name.toLowerCase() === n) ??
    ctx.projects.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()))
  );
}

type TaskDoc = Task & { memberIds?: string[] };

async function fetchWorkspaceTasks(ctx: ToolContext): Promise<TaskDoc[]> {
  const snap = await adminDb().collection("tasks").where("workspaceId", "==", ctx.workspaceId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<TaskDoc, "id">) }))
    .filter((t) => t.memberIds?.includes(ctx.uid) ?? true);
}

function isOverdue(t: Task): boolean {
  return !!t.dueDate && t.status !== "done" && t.dueDate < new Date().toISOString().slice(0, 10);
}
function isDueToday(t: Task): boolean {
  return t.dueDate === new Date().toISOString().slice(0, 10) && t.status !== "done";
}
function compact(t: Task, projName?: string) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: t.dueDate ?? null,
    project: projName ?? null,
  };
}

/* -------------------------------- executor -------------------------------- */

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const projName = (id: string) => ctx.projects.find((p) => p.id === id)?.name;

  switch (name) {
    case "search_knowledge": {
      const query = String(input.query ?? "");
      const vector = await embedQuery(query);
      const target = input.project ? resolveProject(ctx, String(input.project)) : undefined;
      const chunks = target
        ? await queryNamespace(target.ragNamespace, vector, 5)
        : await queryNamespaces(ctx.projects.map((p) => p.ragNamespace), vector, 6);
      ctx.sources.push(...chunks);
      if (chunks.length) ctx.cards.push({ kind: "sources", data: chunks });
      if (!chunks.length) return "No matching documents found in the knowledge base.";
      return JSON.stringify(
        chunks.map((c) => ({ source: c.source, project: c.project, score: c.score.toFixed(2), text: c.text.slice(0, 700) }))
      );
    }

    case "list_tasks": {
      const all = await fetchWorkspaceTasks(ctx);
      const target = input.project ? resolveProject(ctx, String(input.project)) : undefined;
      let rows = target ? all.filter((t) => t.projectId === target.id) : all;
      if (input.status) rows = rows.filter((t) => t.status === input.status);
      if (input.filter === "overdue") rows = rows.filter(isOverdue);
      if (input.filter === "due_today") rows = rows.filter(isDueToday);
      rows = rows.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")).slice(0, 40);
      const data = rows.map((t) => compact(t, projName(t.projectId)));
      ctx.cards.push({ kind: "task_list", data });
      return JSON.stringify({ count: rows.length, tasks: data });
    }

    case "create_task": {
      const target = resolveProject(ctx, input.project ? String(input.project) : undefined);
      if (!target) return "No project available to create the task in.";
      let parentId: string | null = null;
      if (input.parent_title) {
        const all = await fetchWorkspaceTasks(ctx);
        const parent = all.find(
          (t) =>
            t.projectId === target.id &&
            t.title.toLowerCase().includes(String(input.parent_title).toLowerCase())
        );
        parentId = parent?.id ?? null;
      }
      const now = Date.now();
      const doc = {
        workspaceId: ctx.workspaceId,
        projectId: target.id,
        parentId,
        title: String(input.title),
        notes: "",
        status: (input.status as TaskStatus) ?? "todo",
        priority: (input.priority as TaskPriority) ?? "med",
        assignees: [{ id: ctx.uid, name: ctx.userName, avatar: null }],
        assigneeId: ctx.uid,
        assigneeName: ctx.userName,
        assigneeAvatar: null,
        dueDate: (input.due_date as string) || null,
        startDate: null,
        tags: [] as string[],
        dependencies: [] as string[],
        linkedDocs: [] as [],
        order: now,
        createdAt: now,
        updatedAt: now,
        createdBy: ctx.uid,
        memberIds: ctx.memberIds,
      };
      const ref = await adminDb().collection("tasks").add(doc);
      ctx.cards.push({ kind: "created_task", data: { id: ref.id, ...doc, project: target.name } });
      return `Created task "${doc.title}" in ${target.name}${doc.dueDate ? ` due ${doc.dueDate}` : ""}.`;
    }

    case "update_task": {
      const all = await fetchWorkspaceTasks(ctx);
      const q = String(input.task_title ?? "").toLowerCase();
      const match =
        all.find((t) => t.title.toLowerCase() === q) ??
        all.find((t) => t.title.toLowerCase().includes(q));
      if (!match) return `No task found matching "${input.task_title}".`;
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.set_status) patch.status = input.set_status;
      if (input.set_priority) patch.priority = input.set_priority;
      if (input.set_title) patch.title = input.set_title;
      if (input.set_due_date !== undefined) patch.dueDate = input.set_due_date || null;
      await adminDb().collection("tasks").doc(match.id).update(patch);
      ctx.cards.push({ kind: "updated_task", data: { id: match.id, title: match.title, ...patch, project: projName(match.projectId) } });
      return `Updated "${match.title}".`;
    }

    case "summarize_project": {
      const target = resolveProject(ctx, input.project ? String(input.project) : undefined);
      if (!target) return "Project not found.";
      const all = await fetchWorkspaceTasks(ctx);
      const tasks = all.filter((t) => t.projectId === target.id).map((t) => compact(t, target.name));
      let chunks: RetrievedChunk[] = [];
      try {
        chunks = await queryNamespace(target.ragNamespace, await embedQuery(`${target.name} overview status`), 4);
        ctx.sources.push(...chunks);
      } catch {
        /* knowledge base may be empty */
      }
      return JSON.stringify({
        project: target.name,
        tasks,
        knowledge: chunks.map((c) => ({ source: c.source, text: c.text.slice(0, 500) })),
      });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
