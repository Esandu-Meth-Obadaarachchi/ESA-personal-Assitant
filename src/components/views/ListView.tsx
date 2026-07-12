"use client";

import { useMemo } from "react";
import { PRIORITY_ORDER, STATUS_ORDER, statusMeta } from "@/lib/constants";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { useTaskActions } from "@/lib/data/useTaskActions";
import type { Task, TaskStatus } from "@/lib/types";
import { StatusControl } from "@/components/ui/StatusControl";
import { TagChip } from "@/components/ui/TagChip";
import { AssigneePicker, DuePicker, PrioritySelect } from "@/components/task/Pickers";
import { QuickAdd } from "@/components/task/TaskRow";
import { cn } from "@/lib/utils";

type Actions = ReturnType<typeof useTaskActions>;

function sortTasks(a: Task, b: Task): number {
  const p = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  if (p !== 0) return p;
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
}

export function ListView({ onOpenTask }: { onOpenTask: (t: Task) => void }) {
  const { tasks } = useWorkspace();
  const actions = useTaskActions();

  // Subtasks are nested under their parent, never floated as their own status
  // row. So we group only top-level tasks by status; children render indented
  // beneath each parent regardless of their own status.
  const childrenByParent = useMemo(() => {
    const m = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (!t.parentId) return;
      const arr = m.get(t.parentId) ?? [];
      arr.push(t);
      m.set(t.parentId, arr);
    });
    m.forEach((arr) => arr.sort((a, b) => a.order - b.order));
    return m;
  }, [tasks]);

  const groups = useMemo(() => {
    const g: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], blocked: [], done: [] };
    tasks.filter((t) => !t.parentId).forEach((t) => g[t.status].push(t));
    (Object.keys(g) as TaskStatus[]).forEach((s) => g[s].sort(sortTasks));
    return g;
  }, [tasks]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      {STATUS_ORDER.map((status) => {
        const meta = statusMeta(status);
        const rows = groups[status];
        return (
          <section key={status} className="mb-5">
            <div className="mb-1 flex items-center gap-2 px-2">
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              <span className="text-[13px] font-semibold text-text">{meta.label}</span>
              <span className="mono text-2xs text-text-faint">{rows.length}</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              {rows.map((t, i) => (
                <Row
                  key={t.id}
                  task={t}
                  depth={0}
                  first={i === 0}
                  actions={actions}
                  onOpenTask={onOpenTask}
                  childrenByParent={childrenByParent}
                />
              ))}
              <div className={cn("px-2", rows.length > 0 && "border-t border-border/60")}>
                <QuickAdd
                  placeholder={`Add task to ${meta.label}`}
                  onAdd={(title) => actions.add(title, { status })}
                />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  task,
  depth,
  first,
  actions,
  onOpenTask,
  childrenByParent,
}: {
  task: Task;
  depth: number;
  first: boolean;
  actions: Actions;
  onOpenTask: (t: Task) => void;
  childrenByParent: Map<string, Task[]>;
}) {
  const kids = childrenByParent.get(task.id) ?? [];
  const isSub = depth > 0;
  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-2.5 pr-3 transition-colors hover:bg-surface-2",
          !first && "border-t border-border/60",
          isSub && "bg-surface/40"
        )}
        style={{ paddingLeft: 12 + depth * 22 }}
      >
        {isSub && <span className="text-text-faint">↳</span>}
        <StatusControl status={task.status} onChange={(s) => actions.setStatus(task.id, s)} />
        <button
          onClick={() => onOpenTask(task)}
          className={cn(
            "flex-1 truncate py-2.5 text-left",
            isSub ? "text-[13px]" : "text-[13.5px]",
            task.status === "done" ? "text-text-faint line-through" : "text-text"
          )}
        >
          {task.title}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {task.tags.slice(0, 2).map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
          <DuePicker
            value={task.dueDate}
            time={task.dueTime}
            endTime={task.dueEndTime}
            status={task.status}
            onChange={(d) => actions.setDue(task.id, d)}
            onTimeChange={(tm) => actions.setDueTime(task.id, tm)}
            onEndTimeChange={(tm) => actions.setDueEndTime(task.id, tm)}
          />
          <PrioritySelect value={task.priority} onChange={(p) => actions.setPriority(task.id, p)} />
          <AssigneePicker
            value={{ id: task.assigneeId, name: task.assigneeName, avatar: task.assigneeAvatar }}
            onChange={(a) => actions.setAssignee(task.id, a)}
            size={20}
          />
        </div>
      </div>
      {kids.map((k) => (
        <Row
          key={k.id}
          task={k}
          depth={depth + 1}
          first={false}
          actions={actions}
          onOpenTask={onOpenTask}
          childrenByParent={childrenByParent}
        />
      ))}
    </>
  );
}
