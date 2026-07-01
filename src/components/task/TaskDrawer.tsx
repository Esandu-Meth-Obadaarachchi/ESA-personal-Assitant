"use client";

import { useEffect, useState } from "react";
import { FileText, Link2, Trash2, X } from "lucide-react";
import type { Task } from "@/lib/types";
import { statusMeta } from "@/lib/constants";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { useTaskActions } from "@/lib/data/useTaskActions";
import { relativeTime } from "@/lib/date";
import { shortId } from "@/lib/utils";
import { StatusControl } from "@/components/ui/StatusControl";
import { Button } from "@/components/ui/Button";
import { AssigneePicker, DuePicker, PrioritySelect, TagEditor } from "@/components/task/Pickers";
import { QuickAdd } from "@/components/task/TaskRow";

export function TaskDrawer({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { tasks } = useWorkspace();
  const actions = useTaskActions();
  const live = tasks.find((t) => t.id === task?.id) ?? task;
  const [title, setTitle] = useState(live?.title ?? "");
  const [notes, setNotes] = useState(live?.notes ?? "");

  useEffect(() => {
    setTitle(live?.title ?? "");
    setNotes(live?.notes ?? "");
  }, [live?.id]); // reset when a different task opens

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!live) return null;
  const subtasks = tasks.filter((t) => t.parentId === live.id).sort((a, b) => a.order - b.order);
  const parent = live.parentId ? tasks.find((t) => t.id === live.parentId) : null;
  const meta = statusMeta(live.status);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 animate-fade-in md:hidden" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-surface shadow-pop animate-slide-in">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className={meta.color}>●</span>
            {meta.label}
            <span className="mono text-text-faint">· t·{shortId(live.id)}</span>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {parent && (
            <button
              className="mb-2 truncate text-2xs text-text-faint hover:text-text-muted"
              title={parent.title}
            >
              ↳ subtask of {parent.title}
            </button>
          )}
          <div className="flex items-start gap-2.5">
            <div className="pt-1">
              <StatusControl status={live.status} onChange={(s) => actions.setStatus(live.id, s)} size={20} />
            </div>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== live.title && actions.rename(live.id, title.trim())}
              rows={1}
              className="flex-1 resize-none bg-transparent text-[17px] font-semibold leading-snug tracking-tight text-text outline-none"
            />
          </div>

          {/* properties */}
          <div className="mt-5 space-y-2.5">
            <Prop label="Priority">
              <PrioritySelect value={live.priority} onChange={(p) => actions.setPriority(live.id, p)} />
            </Prop>
            <Prop label="Assignee">
              <AssigneePicker
                value={{ id: live.assigneeId, name: live.assigneeName, avatar: live.assigneeAvatar }}
                onChange={(a) => actions.setAssignee(live.id, a)}
              />
            </Prop>
            <Prop label="Due date">
              <DuePicker
                value={live.dueDate}
                status={live.status}
                onChange={(d) => actions.setDue(live.id, d)}
              />
            </Prop>
            <Prop label="Tags">
              <TagEditor tags={live.tags} onChange={(t) => actions.setTags(live.id, t)} />
            </Prop>
          </div>

          {/* notes */}
          <div className="mt-5">
            <label className="mb-1.5 block text-2xs font-medium uppercase tracking-wide text-text-faint">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (live.notes ?? "") && actions.setNotes(live.id, notes)}
              placeholder="Add detail, links, acceptance criteria…"
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-surface-2 px-3 py-2 text-[13px] text-text outline-none placeholder:text-text-faint focus:border-accent/50"
            />
          </div>

          {/* subtasks */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-2xs font-medium uppercase tracking-wide text-text-faint">
                Subtasks {subtasks.length > 0 && `· ${subtasks.filter((s) => s.status === "done").length}/${subtasks.length}`}
              </span>
            </div>
            <div className="space-y-px">
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                  <StatusControl status={s.status} onChange={(st) => actions.setStatus(s.id, st)} size={14} />
                  <span
                    className={
                      s.status === "done" ? "text-[13px] text-text-faint line-through" : "text-[13px] text-text"
                    }
                  >
                    {s.title}
                  </span>
                </div>
              ))}
            </div>
            <QuickAdd placeholder="Add subtask" onAdd={(t) => actions.addSubtask(live.id, t)} />
          </div>

          {/* linked docs (smart linking) */}
          {live.linkedDocs.length > 0 && (
            <div className="mt-5">
              <span className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-text-faint">
                <Link2 className="h-3 w-3" /> Linked knowledge
              </span>
              <div className="space-y-1">
                {live.linkedDocs.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px]">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <span className="truncate text-text">{d.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <span className="mono text-2xs text-text-faint">
            updated {relativeTime(live.updatedAt)}
          </span>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              actions.remove(live.id);
              onClose();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </footer>
      </aside>
    </>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-text-muted">{label}</span>
      <div className="flex min-h-[24px] flex-1 items-center">{children}</div>
    </div>
  );
}
