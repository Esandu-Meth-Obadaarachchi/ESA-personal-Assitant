import type { Task, TaskNode } from "@/lib/types";

export function slugifyNamespace(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Build the Project -> Task -> Subtask forest from a flat task list. */
export function buildTree(tasks: Task[]): TaskNode[] {
  const byId = new Map<string, TaskNode>();
  tasks.forEach((t) => byId.set(t.id, { ...t, children: [], depth: 0 }));

  const roots: TaskNode[] = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const sortRec = (nodes: TaskNode[], depth: number) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    });
  };
  sortRec(roots, 0);
  return roots;
}

/** Depth-first flatten, skipping the children of collapsed nodes. */
export function flattenVisible(roots: TaskNode[]): TaskNode[] {
  const out: TaskNode[] = [];
  const walk = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (!n.collapsed && n.children.length) walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** id + every descendant id — used for cascade delete and move-guards. */
export function collectSubtreeIds(tasks: Task[], id: string): string[] {
  const childrenOf = new Map<string | null, Task[]>();
  tasks.forEach((t) => {
    const list = childrenOf.get(t.parentId) ?? [];
    list.push(t);
    childrenOf.set(t.parentId, list);
  });
  const ids: string[] = [];
  const walk = (cur: string) => {
    ids.push(cur);
    (childrenOf.get(cur) ?? []).forEach((c) => walk(c.id));
  };
  walk(id);
  return ids;
}

/** Direct-child progress for the "2/5" chip. */
export function childProgress(tasks: Task[], id: string): { done: number; total: number } {
  const children = tasks.filter((t) => t.parentId === id);
  return { done: children.filter((c) => c.status === "done").length, total: children.length };
}

/** Would moving `dragId` under `targetId` create a cycle? */
export function isDescendant(tasks: Task[], dragId: string, targetId: string): boolean {
  return collectSubtreeIds(tasks, dragId).includes(targetId);
}
