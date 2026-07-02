"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight, NotebookPen } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { saveDayPlan, watchDayPlan } from "@/lib/data/firestore";
import { addDays, format } from "date-fns";
import { dueLabel, greeting, toISODate, todayISO } from "@/lib/date";
import type { Task, Workspace } from "@/lib/types";
import { DueDateChip } from "@/components/ui/DueDateChip";
import { PriorityDot } from "@/components/ui/PriorityIndicator";
import { Logo } from "@/components/ui/Logo";
import { PRIORITY_ORDER } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function TodayPage() {
  const { user } = useAuth();
  const { allTasks, workspaces, openWorkspaceProject } = useWorkspace();
  const router = useRouter();
  const today = todayISO();

  // Every open task due today, from every workspace and project.
  const dueToday = useMemo(
    () =>
      allTasks
        .filter((t) => t.status !== "done" && t.dueDate === today)
        .sort(byTimeThenPriority),
    [allTasks, today]
  );
  const overdue = useMemo(
    () =>
      allTasks
        .filter((t) => t.status !== "done" && !!t.dueDate && t.dueDate < today)
        .sort(byTimeThenPriority),
    [allTasks, today]
  );
  const doneToday = allTasks.filter((t) => t.status === "done" && t.dueDate === today).length;

  const wsById = useMemo(() => {
    const m = new Map<string, Workspace>();
    workspaces.forEach((w) => m.set(w.id, w));
    return m;
  }, [workspaces]);

  const openTask = (t: Task) => {
    openWorkspaceProject(t.workspaceId, t.projectId);
    router.push(`/?task=${t.id}`);
  };

  if (!user) {
    return (
      <div className="grid h-full place-items-center">
        <Logo size={32} className="animate-pulse-dot" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-accent">
          <CalendarCheck2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold tracking-tight">{greeting()}</h1>
          <div className="text-xs text-text-muted">{format(new Date(), "EEEE, d MMMM")}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Stat label="due today" value={dueToday.length} />
          {overdue.length > 0 && <Stat label="overdue" value={overdue.length} tone="danger" />}
          {doneToday > 0 && <Stat label="done" value={doneToday} />}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left: the day's tasks */}
        <section className="space-y-6">
          <TaskGroup
            title="Due today"
            tasks={dueToday}
            wsById={wsById}
            onOpen={openTask}
            empty="Nothing is due today. Enjoy the quiet, or pull something forward."
          />
          {overdue.length > 0 && (
            <TaskGroup title="Overdue" tasks={overdue} wsById={wsById} onOpen={openTask} tone="danger" />
          )}
        </section>

        {/* Right: the notebook */}
        <Notebook uid={user.uid} today={today} />
      </div>
    </div>
  );
}

function byTimeThenPriority(a: Task, b: Task): number {
  const at = a.dueTime ?? "99:99";
  const bt = b.dueTime ?? "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  // PRIORITY_ORDER runs urgent -> low, so a lower index means higher priority.
  return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
}

function TaskGroup({
  title,
  tasks,
  wsById,
  onOpen,
  empty,
  tone,
}: {
  title: string;
  tasks: Task[];
  wsById: Map<string, Workspace>;
  onOpen: (t: Task) => void;
  empty?: string;
  tone?: "danger";
}) {
  return (
    <div>
      <h2
        className={cn(
          "mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider",
          tone === "danger" ? "text-danger" : "text-text-faint"
        )}
      >
        {title}
        <span className="mono text-text-faint">{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        empty ? (
          <div className="card p-4 text-[13px] text-text-muted">{empty}</div>
        ) : null
      ) : (
        <div className="card divide-y divide-border/60 overflow-hidden">
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpen(t)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <PriorityDot priority={t.priority} />
              <span className="flex-1 truncate text-[13px] text-text">{t.title}</span>
              <span className="hidden shrink-0 items-center gap-1 text-2xs text-text-faint sm:flex">
                {wsById.get(t.workspaceId)?.emoji}
                {wsById.get(t.workspaceId)?.name}
              </span>
              <DueDateChip date={t.dueDate} time={t.dueTime} status={t.status} icon={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A per-day personal notebook that autosaves to Firestore. */
function Notebook({ uid, today }: { uid: string; today: string }) {
  const [date, setDate] = useState(today);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const editingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load + live-sync the note for the selected day.
  useEffect(() => {
    editingRef.current = false;
    setStatus("idle");
    const unsub = watchDayPlan(uid, date, (c) => {
      if (!editingRef.current) setContent(c);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [uid, date]);

  const onChange = (v: string) => {
    editingRef.current = true;
    setContent(v);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await saveDayPlan(uid, date, v);
      setStatus("saved");
    }, 600);
  };

  const shift = (days: number) => setDate((d) => toISODate(addDays(new Date(d), days)));
  const isToday = date === today;

  return (
    <section className="lg:sticky lg:top-6 lg:h-[calc(100vh-8.5rem)]">
      <div className="card flex h-full flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <NotebookPen className="h-4 w-4 text-accent" />
          <span className="text-[13px] font-medium text-text">Day planner</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => shift(-1)}
              className="grid h-6 w-6 place-items-center rounded text-text-faint hover:bg-surface-2 hover:text-text"
              title="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDate(today)}
              className={cn(
                "rounded px-2 py-0.5 text-2xs font-medium transition-colors",
                isToday ? "text-text-faint" : "text-accent hover:bg-surface-2"
              )}
            >
              {dueLabel(date) || format(new Date(date), "d MMM")}
            </button>
            <button
              onClick={() => shift(1)}
              className="grid h-6 w-6 place-items-center rounded text-text-faint hover:bg-surface-2 hover:text-text"
              title="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Plan your day…\n\n09:00  Deep work — solar dashboard\n11:00  Standup\n14:00  Gradify build\n\nNotes, ideas, anything."}
          className="min-h-[280px] flex-1 resize-none bg-transparent px-4 py-3.5 text-[13.5px] leading-relaxed text-text outline-none placeholder:text-text-faint/70"
          spellCheck={false}
        />
        <div className="flex items-center justify-end border-t border-border px-3.5 py-1.5 text-2xs text-text-faint">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Synced"}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-2xs text-text-muted",
        tone === "danger" && "border-danger/25 bg-danger/10 text-danger"
      )}
    >
      <span className="mono font-semibold text-text">{value}</span>
      {label}
    </span>
  );
}
