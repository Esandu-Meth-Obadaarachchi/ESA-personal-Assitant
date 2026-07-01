"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { STATUS_ORDER, statusMeta } from "@/lib/constants";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { useTaskActions } from "@/lib/data/useTaskActions";
import { commitTaskMoves } from "@/lib/data/firestore";
import type { Task, TaskStatus } from "@/lib/types";
import { TaskCard } from "@/components/task/TaskCard";
import { QuickAdd } from "@/components/task/TaskRow";
import { cn } from "@/lib/utils";

type Columns = Record<TaskStatus, string[]>;

export function KanbanBoard({ onOpenTask }: { onOpenTask: (t: Task) => void }) {
  const { tasks } = useWorkspace();
  const actions = useTaskActions();
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Board shows top-level tasks grouped by status.
  const derived = useMemo<Columns>(() => {
    const cols: Columns = { todo: [], in_progress: [], blocked: [], done: [] };
    tasks
      .filter((t) => !t.parentId)
      .sort((a, b) => a.order - b.order)
      .forEach((t) => cols[t.status].push(t.id));
    return cols;
  }, [tasks]);

  const [cols, setCols] = useState<Columns>(derived);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync from Firestore whenever we're not mid-drag.
  useEffect(() => {
    if (!activeId) setCols(derived);
  }, [derived, activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const findCol = (id: string): TaskStatus | null => {
    if (id in cols) return id as TaskStatus;
    return (Object.keys(cols) as TaskStatus[]).find((s) => cols[s].includes(id)) ?? null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const activeCol = findCol(String(e.active.id));
    const overCol = findCol(String(e.over?.id ?? ""));
    if (!activeCol || !overCol || activeCol === overCol) return;
    setCols((prev) => {
      const next = { ...prev, [activeCol]: [...prev[activeCol]], [overCol]: [...prev[overCol]] };
      next[activeCol] = next[activeCol].filter((id) => id !== e.active.id);
      const overIdx = next[overCol].indexOf(String(e.over?.id));
      const insertAt = overIdx >= 0 ? overIdx : next[overCol].length;
      next[overCol].splice(insertAt, 0, String(e.active.id));
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeCol = findCol(String(e.active.id));
    const overCol = findCol(String(e.over?.id ?? ""));
    setActiveId(null);
    if (!activeCol || !overCol) return;

    // Reorder within destination column.
    setCols((prev) => {
      const next = { ...prev, [overCol]: [...prev[overCol]] };
      const from = next[overCol].indexOf(String(e.active.id));
      const to = next[overCol].indexOf(String(e.over?.id));
      if (from >= 0 && to >= 0 && from !== to) {
        next[overCol].splice(to, 0, next[overCol].splice(from, 1)[0]);
      }
      // Persist any card whose status/order changed.
      const moves: { id: string; order: number; status: TaskStatus }[] = [];
      (Object.keys(next) as TaskStatus[]).forEach((status) => {
        next[status].forEach((id, i) => {
          const t = byId.get(id);
          const order = i * 1000;
          if (t && (t.status !== status || t.order !== order)) moves.push({ id, order, status });
        });
      });
      if (moves.length) void commitTaskMoves(moves);
      return next;
    });
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full gap-3 overflow-x-auto px-4 py-4">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            ids={cols[status]}
            byId={byId}
            onOpenTask={onOpenTask}
            onAdd={(title) => actions.add(title, { status })}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="w-[272px]">
            <TaskCard task={active} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  ids,
  byId,
  onOpenTask,
  onAdd,
}: {
  status: TaskStatus;
  ids: string[];
  byId: Map<string, Task>;
  onOpenTask: (t: Task) => void;
  onAdd: (title: string) => void;
}) {
  const meta = statusMeta(status);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex w-[288px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <span className="text-[13px] font-medium text-text">{meta.label}</span>
        <span className="mono text-2xs text-text-faint">{ids.length}</span>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto grid h-5 w-5 place-items-center rounded text-text-faint hover:bg-surface-2 hover:text-text"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-[120px] flex-1 space-y-2 rounded-lg border border-transparent p-1.5 transition-colors",
          isOver && "border-accent/25 bg-accent/[0.04]"
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableCard key={id} task={t} onOpen={() => onOpenTask(t)} /> : null;
          })}
        </SortableContext>
        {adding && (
          <div className="card p-1">
            <QuickAdd
              autoFocus
              placeholder="New card"
              onAdd={(title) => {
                onAdd(title);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
        {ids.length === 0 && !adding && (
          <div className="grid place-items-center rounded-lg border border-dashed border-border/60 py-6 text-2xs text-text-faint">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

function SortableCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}
