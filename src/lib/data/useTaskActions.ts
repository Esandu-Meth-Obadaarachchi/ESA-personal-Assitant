"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWorkspace } from "./WorkspaceContext";
import { createTask, deleteTaskTree, updateTask } from "./firestore";
import { collectSubtreeIds } from "./tree";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

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

    return {
      ready,
      add,
      addSubtask: (parentId: string, title: string) => add(title, { parentId }),
      rename: (id: string, title: string) => updateTask(id, { title }),
      setNotes: (id: string, notes: string) => updateTask(id, { notes }),
      setStatus: (id: string, status: TaskStatus) => updateTask(id, { status }),
      setPriority: (id: string, priority: TaskPriority) => updateTask(id, { priority }),
      setDue: (id: string, dueDate: string | null) => updateTask(id, { dueDate }),
      setTags: (id: string, tags: string[]) => updateTask(id, { tags }),
      setAssignee: (id: string, a: { id: string; name: string; avatar?: string | null } | null) =>
        updateTask(id, {
          assigneeId: a?.id ?? null,
          assigneeName: a?.name ?? null,
          assigneeAvatar: a?.avatar ?? null,
        }),
      toggleDone: (t: Task) => updateTask(t.id, { status: t.status === "done" ? "todo" : "done" }),
      remove: (id: string) => deleteTaskTree(collectSubtreeIds(tasks, id)),
      patch: (id: string, patch: Partial<Task>) => updateTask(id, patch),
    };
  }, [user, currentWorkspace, currentProject, tasks]);
}

export type TaskActions = ReturnType<typeof useTaskActions>;
