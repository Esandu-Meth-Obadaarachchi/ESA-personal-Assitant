"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, KanbanSquare, ListTree, Rows3, Sparkles } from "lucide-react";
import type { Project, Task } from "@/lib/types";
import { dueState } from "@/lib/date";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type ViewTab = "tree" | "board" | "list" | "calendar";

const TABS: { id: ViewTab; label: string; icon: typeof ListTree }[] = [
  { id: "tree", label: "Tree", icon: ListTree },
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "list", label: "List", icon: Rows3 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

export function ProjectHeader({
  project,
  tasks,
  tab,
  onTab,
}: {
  project: Project;
  tasks: Task[];
  tab: ViewTab;
  onTab: (t: ViewTab) => void;
}) {
  const router = useRouter();
  const open = tasks.filter((t) => t.status !== "done").length;
  const overdue = tasks.filter(
    (t) => t.status !== "done" && dueState(t.dueDate, t.status) === "overdue"
  ).length;
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <header className="flex flex-col gap-3 border-b border-border px-4 pb-2.5 pt-3.5">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: project.color }} />
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-text">
            {project.name}
          </h1>
        </div>

        <div className="ml-1 flex items-center gap-1.5">
          <Stat label="open" value={open} />
          {overdue > 0 && <Stat label="overdue" value={overdue} tone="danger" />}
          <Stat label="done" value={done} tone="ok" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/agent")}>
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Ask the brain
          </Button>
        </div>
      </div>

      {/* tab switcher */}
      <div className="flex items-center gap-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              tab === t.id
                ? "bg-surface-2 text-text"
                : "text-text-muted hover:bg-surface-2 hover:text-text"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "ok";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-2xs",
        tone === "danger" && "border-danger/25 bg-danger/10 text-danger",
        tone === "ok" && "text-text-muted",
        !tone && "text-text-muted"
      )}
    >
      <span className="mono font-semibold text-text">{value}</span>
      {label}
    </span>
  );
}
