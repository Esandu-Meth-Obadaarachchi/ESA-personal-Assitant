"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { useTaskActions } from "@/lib/data/useTaskActions";
import { statusMeta } from "@/lib/constants";
import { toISODate } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { CalendarSync } from "@/components/project/CalendarSync";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({ onOpenTask }: { onOpenTask: (t: Task) => void }) {
  const { tasks } = useWorkspace();
  const actions = useTaskActions();
  const [month, setMonth] = useState(() => new Date());
  const [activeId, setActiveId] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (!t.dueDate) return;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    });
    return map;
  }, [tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const active = activeId ? tasks.find((t) => t.id === activeId) : null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const iso = e.over?.id ? String(e.over.id) : null;
    if (iso && active && active.dueDate !== iso) actions.setDue(active.id, iso);
  };

  return (
    <div className="flex h-full flex-col px-4 py-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{format(month, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" variant="subtle" onClick={() => setMonth(new Date())}>
          Today
        </Button>
        <div className="ml-auto">
          <CalendarSync />
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border pb-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 text-2xs font-medium uppercase tracking-wide text-text-faint">
            {d}
          </div>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
      >
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7">
          {days.map((day) => (
            <DayCell
              key={day.toISOString()}
              day={day}
              month={month}
              tasks={byDay.get(toISODate(day)) ?? []}
              onOpenTask={onOpenTask}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? <Chip task={active} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DayCell({
  day,
  month,
  tasks,
  onOpenTask,
}: {
  day: Date;
  month: Date;
  tasks: Task[];
  onOpenTask: (t: Task) => void;
}) {
  const iso = toISODate(day);
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const outside = !isSameMonth(day, month);
  const today = isToday(day);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[92px] flex-col gap-1 border-b border-r border-border/60 p-1.5 transition-colors",
        outside && "bg-surface/30",
        isOver && "bg-accent/[0.06] ring-1 ring-inset ring-accent/30"
      )}
    >
      <div
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full text-2xs",
          today ? "bg-accent font-semibold text-accent-fg" : outside ? "text-text-faint" : "text-text-muted"
        )}
      >
        {format(day, "d")}
      </div>
      <div className="space-y-1 overflow-hidden">
        {tasks.slice(0, 3).map((t) => (
          <Chip key={t.id} task={t} onOpen={() => onOpenTask(t)} />
        ))}
        {tasks.length > 3 && (
          <div className="px-1 text-2xs text-text-faint">+{tasks.length - 3} more</div>
        )}
      </div>
    </div>
  );
}

function Chip({ task, onOpen, overlay }: { task: Task; onOpen?: () => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const meta = statusMeta(task.status);
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={onOpen}
      className={cn(
        "flex cursor-pointer items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-2xs text-text",
        overlay ? "shadow-pop" : "hover:border-border-strong",
        isDragging && "opacity-40",
        task.status === "done" && "text-text-faint line-through"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
      <span className="truncate">{task.title}</span>
    </div>
  );
}
