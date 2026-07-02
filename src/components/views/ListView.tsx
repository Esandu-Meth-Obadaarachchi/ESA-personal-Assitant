"use client";

import { useMemo } from "react";
import { PRIORITY_ORDER, STATUS_ORDER, statusMeta } from "@/lib/constants";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { useTaskActions } from "@/lib/data/useTaskActions";
import type { Task, TaskStatus } from "@/lib/types";
import { StatusControl } from "@/components/ui/StatusControl";
import { DueDateChip } from "@/components/ui/DueDateChip";
import { TagChip } from "@/components/ui/TagChip";
import { AssigneePicker, DuePicker, PrioritySelect } from "@/components/task/Pickers";
import { QuickAdd } from "@/components/task/TaskRow";
import { cn } from "@/lib/utils";

export function ListView({ onOpenTask }: { onOpenTask: (t: Task) => void }) {
  const { tasks } = useWorkspace();
  const actions = useTaskActions();

  const groups = useMemo(() => {
    const g: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], blocked: [], done: [] };
    tasks.forEach((t) => g[t.status].push(t));
    (Object.keys(g) as TaskStatus[]).forEach((s) =>
      g[s].sort((a, b) => {
        const p = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
        if (p !== 0) return p;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      })
    );
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
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-2.5 px-3 transition-colors hover:bg-surface-2",
                    i > 0 && "border-t border-border/60"
                  )}
                >
                  <StatusControl status={t.status} onChange={(s) => actions.setStatus(t.id, s)} />
                  <button
                    onClick={() => onOpenTask(t)}
                    className={cn(
                      "flex-1 truncate py-2.5 text-left text-[13.5px]",
                      t.status === "done" ? "text-text-faint line-through" : "text-text"
                    )}
                  >
                    {t.title}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {t.tags.slice(0, 2).map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                    <DuePicker
                      value={t.dueDate}
                      time={t.dueTime}
                      status={t.status}
                      onChange={(d) => actions.setDue(t.id, d)}
                      onTimeChange={(tm) => actions.setDueTime(t.id, tm)}
                    />
                    <PrioritySelect value={t.priority} onChange={(p) => actions.setPriority(t.id, p)} />
                    <AssigneePicker
                      value={{ id: t.assigneeId, name: t.assigneeName, avatar: t.assigneeAvatar }}
                      onChange={(a) => actions.setAssignee(t.id, a)}
                      size={20}
                    />
                  </div>
                </div>
              ))}
              {status === "todo" && (
                <div className={cn("px-2", rows.length > 0 && "border-t border-border/60")}>
                  <QuickAdd placeholder="Add task" onAdd={(title) => actions.add(title, { status: "todo" })} />
                </div>
              )}
              {rows.length === 0 && status !== "todo" && (
                <div className="px-3 py-2.5 text-2xs text-text-faint">Nothing here</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
