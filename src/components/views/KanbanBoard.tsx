"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
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

/**
 * Pointer-first collision. closestCorners can't reliably target an EMPTY column
 * (there are no nearby cards, so a card in an adjacent column always wins),
 * which is why drops into empty To Do / In Progress / Blocked / Done were lost.
 * pointerWithin detects the column container directly under the cursor; we fall
 * back to rect intersection, then closestCorners, for the has-cards case.
 */
const boardCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length) return pointer;
  const rect = rectIntersection(args);
  if (rect.length) return rect;
  return closestCorners(args);
};

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
  const dragging = useRef(false);

  // Re-sync from Firestore only when the underlying data actually changes, and
  // never mid-drag. Keying this on `activeId` used to clobber the optimistic
  // drop with stale `derived` before Firestore round-tripped, so cards snapped
  // back and drops looked rejected.
  useEffect(() => {
    if (!dragging.current) setCols(derived);
  }, [derived]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /** Column droppables are prefixed so they can never collide with a task id. */
  const colOf = (id: string, source: Columns = cols): TaskStatus | null => {
    if (id.startsWith("col:")) return id.slice(4) as TaskStatus;
    return STATUS_ORDER.find((s) => source[s].includes(id)) ?? null;
  };

  const onDragStart = (e: DragStartEvent) => {
    dragging.current = true;
    setActiveId(String(e.active.id));
  };

  const onDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const activeIdStr = String(e.active.id);
    setCols((prev) => {
      const from = colOf(activeIdStr, prev);
      const to = colOf(overId, prev);
      if (!from || !to || from === to) return prev;
      const next = { ...prev, [from]: [...prev[from]], [to]: [...prev[to]] };
      next[from] = next[from].filter((id) => id !== activeIdStr);
      const overIdx = next[to].indexOf(overId);
      next[to].splice(overIdx >= 0 ? overIdx : next[to].length, 0, activeIdStr);
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeIdStr = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    dragging.current = false;
    setActiveId(null);
    if (!overId) return;

    // Compute the final arrangement synchronously, then persist outside of any
    // state updater (updaters must stay pure).
    const to = colOf(overId);
    const from = colOf(activeIdStr);
    if (!from || !to) return;

    let final: Columns = cols;
    if (from === to) {
      const oldIdx = cols[to].indexOf(activeIdStr);
      const newIdx = overId.startsWith("col:") ? cols[to].length - 1 : cols[to].indexOf(overId);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        const arr = [...cols[to]];
        arr.splice(newIdx, 0, arr.splice(oldIdx, 1)[0]);
        final = { ...cols, [to]: arr };
      }
    }
    setCols(final);

    const moves: { id: string; order: number; status: TaskStatus }[] = [];
    STATUS_ORDER.forEach((status) => {
      final[status].forEach((id, i) => {
        const t = byId.get(id);
        const order = i * 1000;
        if (t && (t.status !== status || t.order !== order)) moves.push({ id, order, status });
      });
    });
    if (moves.length) {
      // On failure, fall back to the authoritative Firestore state.
      void commitTaskMoves(moves).catch(() => setCols(derived));
    }
  };

  const onDragCancel = () => {
    dragging.current = false;
    setActiveId(null);
    setCols(derived);
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
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
  // Prefixed id: never collides with a task id. The ref wraps the whole column
  // so empty space anywhere in it is a valid drop target.
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const [adding, setAdding] = useState(false);

  return (
    <div ref={setNodeRef} className="flex w-[288px] shrink-0 flex-col">
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
