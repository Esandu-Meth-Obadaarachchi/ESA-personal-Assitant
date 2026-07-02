"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Inbox as InboxIcon } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { watchAllProjects, watchAllTasks } from "@/lib/data/firestore";
import { dueState } from "@/lib/date";
import type { Project, Task, Workspace } from "@/lib/types";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

/** All workspaces at once — one column per business, like a portfolio kanban. */
export default function AllWorkspacesPage() {
  const { user } = useAuth();
  const { workspaces, openWorkspaceProject, selectWorkspace } = useWorkspace();
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!user) return;
    const a = watchAllProjects(user.uid, setProjects);
    const b = watchAllTasks(user.uid, setTasks);
    return () => {
      a();
      b();
    };
  }, [user]);

  const projByWs = useMemo(() => {
    const m = new Map<string, Project[]>();
    projects.forEach((p) => {
      const list = m.get(p.workspaceId) ?? [];
      list.push(p);
      m.set(p.workspaceId, list);
    });
    // inbox first within each workspace
    m.forEach((list) => list.sort((a, b) => Number(!!b.isInbox) - Number(!!a.isInbox)));
    return m;
  }, [projects]);

  const tasksByProject = useMemo(() => {
    const m = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const list = m.get(t.projectId) ?? [];
      list.push(t);
      m.set(t.projectId, list);
    });
    return m;
  }, [tasks]);

  if (!user) {
    return (
      <div className="grid h-full place-items-center">
        <Logo size={32} className="animate-pulse-dot" />
      </div>
    );
  }

  const open = (ws: Workspace) => tasks.filter((t) => t.workspaceId === ws.id && t.status !== "done").length;
  const overdue = (ws: Workspace) =>
    tasks.filter(
      (t) => t.workspaceId === ws.id && t.status !== "done" && dueState(t.dueDate, t.status) === "overdue"
    ).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <h1 className="text-[17px] font-semibold tracking-tight">All workspaces</h1>
        <span className="text-xs text-text-muted">{workspaces.length} businesses</span>
        <div className="ml-auto flex items-center gap-1.5 text-2xs text-text-muted">
          <span>
            <b className="mono text-text">{tasks.filter((t) => t.status !== "done").length}</b> open
          </span>
          <span>
            <b className="mono text-text">{tasks.filter((t) => t.status === "done").length}</b> done
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {workspaces.map((ws) => {
          const wsProjects = projByWs.get(ws.id) ?? [];
          const od = overdue(ws);
          return (
            <div key={ws.id} className="flex w-[300px] shrink-0 flex-col">
              <button
                onClick={() => {
                  selectWorkspace(ws.id);
                  router.push("/overview");
                }}
                className="mb-2 flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-surface-2"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2 text-base">
                  {ws.emoji}
                </span>
                <span className="flex-1 truncate text-[13.5px] font-semibold text-text">{ws.name}</span>
                <span className="mono text-2xs text-text-faint">{open(ws)} open</span>
                {od > 0 && (
                  <span className="rounded border border-danger/25 bg-danger/10 px-1 text-2xs text-danger">
                    {od}
                  </span>
                )}
              </button>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-surface/30 p-2">
                {wsProjects.map((p) => (
                  <PortfolioCard
                    key={p.id}
                    project={p}
                    tasks={tasksByProject.get(p.id) ?? []}
                    onOpen={() => {
                      openWorkspaceProject(ws.id, p.id);
                      router.push("/");
                    }}
                  />
                ))}
                {wsProjects.length === 0 && (
                  <div className="grid place-items-center rounded-md border border-dashed border-border/60 py-6 text-2xs text-text-faint">
                    No projects
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {workspaces.length === 0 && (
          <div className="grid w-full place-items-center text-sm text-text-muted">No workspaces yet.</div>
        )}
      </div>
    </div>
  );
}

function PortfolioCard({ project, tasks, onOpen }: { project: Project; tasks: Task[]; onOpen: () => void }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const open = total - done;
  const overdue = tasks.filter((t) => t.status !== "done" && dueState(t.dueDate, t.status) === "overdue").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <button onClick={onOpen} className="card w-full p-2.5 text-left transition-colors hover:border-border-strong">
      <div className="flex items-center gap-2">
        {project.isInbox ? (
          <InboxIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: project.color }} />
        )}
        <span className="truncate text-[13px] font-medium text-text">{project.name}</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex items-center gap-2.5 text-2xs text-text-muted">
        <span>
          <b className="mono text-text">{open}</b> open
        </span>
        {overdue > 0 && (
          <span className="ml-auto flex items-center gap-1 text-danger">
            <CalendarClock className="h-3 w-3" /> {overdue}
          </span>
        )}
      </div>
    </button>
  );
}
