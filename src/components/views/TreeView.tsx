"use client";

import { useMemo, useState } from "react";
import { ListTree } from "lucide-react";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { useTaskActions } from "@/lib/data/useTaskActions";
import { buildTree, flattenVisible } from "@/lib/data/tree";
import type { Task } from "@/lib/types";
import { QuickAdd, TaskRow } from "@/components/task/TaskRow";

export function TreeView({
  onOpenTask,
  selectedId,
}: {
  onOpenTask: (t: Task) => void;
  selectedId?: string;
}) {
  const { tasks } = useWorkspace();
  const actions = useTaskActions();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingUnder, setAddingUnder] = useState<string | null>(null);

  const roots = useMemo(() => {
    const tree = buildTree(tasks);
    const annotate = (nodes: ReturnType<typeof buildTree>) =>
      nodes.forEach((n) => {
        n.collapsed = collapsed.has(n.id);
        annotate(n.children);
      });
    annotate(tree);
    return tree;
  }, [tasks, collapsed]);

  const visible = useMemo(() => flattenVisible(roots), [roots]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expand = (id: string) =>
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <div className="space-y-px">
        {visible.map((node) => (
          <div key={node.id}>
            <TaskRow
              node={node}
              actions={actions}
              collapsed={collapsed.has(node.id)}
              selected={node.id === selectedId}
              onToggleCollapse={() => toggle(node.id)}
              onOpen={() => onOpenTask(node)}
              onAddSubtask={() => {
                expand(node.id);
                setAddingUnder(node.id);
              }}
            />
            {addingUnder === node.id && (
              <QuickAdd
                depth={node.depth + 1}
                autoFocus
                placeholder="Add subtask"
                onAdd={(title) => actions.addSubtask(node.id, title)}
                onCancel={() => setAddingUnder(null)}
              />
            )}
          </div>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-text-muted">
            <ListTree className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-medium text-text">No tasks yet</div>
            <div className="mt-0.5 text-xs text-text-muted">
              Add your first task below, or ask the brain to break down a goal.
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-1.5 border-t border-border/60 pt-1.5">
        <QuickAdd placeholder="Add task" onAdd={(title) => actions.add(title)} />
      </div>
    </div>
  );
}
