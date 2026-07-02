"use client";

import { useMemo } from "react";
import { addDays, addMonths, addWeeks } from "date-fns";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { createTask, deleteTaskTree, updateTask } from "./firestore";
import { collectSubtreeIds } from "./tree";
import { toISODate } from "@/lib/date";
import type { Recurrence, Task, TaskPriority, TaskStatus, TimeEntry } from "@/lib/types";

function advance(iso: string, r: Recurrence): string {
  const d = new Date(iso);
  const next =
    r.freq === "daily" ? addDays(d, r.interval) : r.freq === "weekly" ? addWeeks(d, r.interval) : addMonths(d, r.interval);
  return toISODate(next);
}

/**
 * Task mutations pre-bound to the current project/workspace/user. Views call
 * these; nobody else touches Firestore for tasks directly. New tasks are placed
 * at the end of their sibling group by order.
 */
export function useTaskActions() {
  const { user } = useAuth();
  const { currentWorkspace, currentProject, tasks } = useWorkspace();

  return useMemo(() => {
    const ready = Boolean(user && currentWorkspace && currentProject);
    const memberIds = currentWorkspace?.memberIds ?? [];

    const nextOrder = (parentId: string | null) => {
      const siblings = tasks.filter((t) => t.parentId === parentId);
      return siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : Date.now();
    };

    const add = async (
      title: string,
      opts: { parentId?: string | null; status?: TaskStatus; priority?: TaskPriority; dueDate?: string | null } = {}
    ) => {
      if (!ready || !title.trim()) return;
      return createTask({
        workspaceId: currentWorkspace!.id,
        projectId: currentProject!.id,
        parentId: opts.parentId ?? null,
        title: title.trim(),
        memberIds,
        createdBy: user!.uid,
        status: opts.status,
        priority: opts.priority,
        dueDate: opts.dueDate ?? null,
        order: nextOrder(opts.parentId ?? null),
        assignee: user ? { id: user.uid, name: user.displayName ?? "You", avatar: user.photoURL } : null,
      });
    };

    // When a recurring task is completed, spawn its next occurrence.
    const spawnIfRecurring = async (task: Task) => {
      if (!task.recurrence || !task.dueDate) return;
      const id = await add(task.title, {
        parentId: task.parentId,
        priority: task.priority,
        dueDate: advance(task.dueDate, task.recurrence),
      });
      if (id) await updateTask(id, { recurrence: task.recurrence, tags: task.tags });
    };

    const applyStatus = async (id: string, status: TaskStatus) => {
      const prev = tasks.find((t) => t.id === id);
      await updateTask(id, { status });
      if (status === "done" && prev && prev.status !== "done") await spawnIfRecurring(prev);
    };

    const withEntries = (id: string, fn: (entries: TimeEntry[]) => TimeEntry[]) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      return updateTask(id, { timeEntries: fn(t.timeEntries ?? []) });
    };

    return {
      ready,
      add,
      addSubtask: (parentId: string, title: string) => add(title, { parentId }),
      rename: (id: string, title: string) => updateTask(id, { title }),
      setNotes: (id: string, notes: string) => updateTask(id, { notes }),
      setStatus: applyStatus,
      setPriority: (id: string, priority: TaskPriority) => updateTask(id, { priority }),
      setDue: (id: string, dueDate: string | null) => updateTask(id, { dueDate }),
      setTags: (id: string, tags: string[]) => updateTask(id, { tags }),
      setAssignee: (id: string, a: { id: string; name: string; avatar?: string | null } | null) =>
        updateTask(id, {
          assigneeId: a?.id ?? null,
          assigneeName: a?.name ?? null,
          assigneeAvatar: a?.avatar ?? null,
        }),
      toggleDone: (t: Task) => applyStatus(t.id, t.status === "done" ? "todo" : "done"),
      remove: (id: string) => deleteTaskTree(collectSubtreeIds(tasks, id)),
      patch: (id: string, patch: Partial<Task>) => updateTask(id, patch),

      // recurrence
      setRecurrence: (id: string, recurrence: Recurrence | null) => updateTask(id, { recurrence }),

      // time tracking
      startTimer: (id: string) =>
        withEntries(id, (e) =>
          e.some((x) => x.end === null)
            ? e
            : [...e, { id: crypto.randomUUID(), start: Date.now(), end: null, seconds: 0 }]
        ),
      stopTimer: (id: string) =>
        withEntries(id, (e) =>
          e.map((x) => (x.end === null ? { ...x, end: Date.now(), seconds: Math.round((Date.now() - x.start) / 1000) } : x))
        ),
      addTimeEntry: (id: string, seconds: number, note = "") =>
        withEntries(id, (e) => [...e, { id: crypto.randomUUID(), start: Date.now(), end: Date.now(), seconds, note }]),
      deleteTimeEntry: (id: string, entryId: string) =>
        withEntries(id, (e) => e.filter((x) => x.id !== entryId)),
    };
  }, [user, currentWorkspace, currentProject, tasks]);
}

export type TaskActions = ReturnType<typeof useTaskActions>;
