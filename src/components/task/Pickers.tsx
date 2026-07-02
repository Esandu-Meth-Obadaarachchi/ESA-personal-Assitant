"use client";

import { useState } from "react";
import { CalendarClock, Plus, Repeat, X } from "lucide-react";
import { PRIORITIES } from "@/lib/constants";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { toISODate, todayISO } from "@/lib/date";
import type { Recurrence, RecurrenceFreq, TaskPriority, TaskStatus } from "@/lib/types";
import { Avatar, AvatarEmpty } from "@/components/ui/Avatar";
import { Dropdown, MenuItem } from "@/components/ui/Dropdown";
import { DueDateChip } from "@/components/ui/DueDateChip";
import { PriorityIndicator } from "@/components/ui/PriorityIndicator";
import { TagChip } from "@/components/ui/TagChip";
import { cn } from "@/lib/utils";

export function PrioritySelect({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
}) {
  return (
    <Dropdown
      width={160}
      trigger={() => (
        <span className="grid h-6 w-6 place-items-center rounded-md hover:bg-surface-2" title="Priority">
          <PriorityIndicator priority={value} />
        </span>
      )}
    >
      {(close) =>
        PRIORITIES.map((p) => (
          <MenuItem
            key={p.id}
            active={p.id === value}
            icon={<PriorityIndicator priority={p.id} />}
            onClick={() => {
              onChange(p.id);
              close();
            }}
          >
            {p.label}
          </MenuItem>
        ))
      }
    </Dropdown>
  );
}

export function AssigneePicker({
  value,
  onChange,
  size = 22,
}: {
  value?: { id?: string | null; name?: string | null; avatar?: string | null };
  onChange: (a: { id: string; name: string; avatar?: string | null } | null) => void;
  size?: number;
}) {
  const { currentWorkspace } = useWorkspace();
  const members = currentWorkspace?.members ?? [];
  return (
    <Dropdown
      width={220}
      align="right"
      trigger={() => (
        <span className="grid place-items-center rounded-full hover:opacity-80" title={value?.name ?? "Assign"}>
          {value?.id ? (
            <Avatar name={value.name} src={value.avatar} size={size} />
          ) : (
            <AvatarEmpty size={size} />
          )}
        </span>
      )}
    >
      {(close) => (
        <div>
          <div className="px-2 pb-1 pt-1 text-2xs font-medium uppercase tracking-wide text-text-faint">
            Assign to
          </div>
          {members.map((m) => (
            <MenuItem
              key={m.uid}
              active={m.uid === value?.id}
              icon={<Avatar name={m.name} src={m.photoURL} size={18} />}
              onClick={() => {
                onChange({ id: m.uid, name: m.name, avatar: m.photoURL });
                close();
              }}
            >
              {m.name}
            </MenuItem>
          ))}
          {value?.id && (
            <>
              <div className="my-1 h-px bg-border" />
              <MenuItem
                onClick={() => {
                  onChange(null);
                  close();
                }}
              >
                Unassign
              </MenuItem>
            </>
          )}
        </div>
      )}
    </Dropdown>
  );
}

export function DuePicker({
  value,
  status,
  onChange,
  placeholder = true,
}: {
  value?: string | null;
  status?: TaskStatus;
  onChange: (iso: string | null) => void;
  placeholder?: boolean;
}) {
  const quick = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return toISODate(d);
  };
  return (
    <Dropdown
      width={216}
      align="right"
      trigger={() =>
        value ? (
          <DueDateChip date={value} status={status} />
        ) : placeholder ? (
          <span className="grid h-6 w-6 place-items-center rounded-md text-text-faint hover:bg-surface-2 hover:text-text" title="Set due date">
            <CalendarClock className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span />
        )
      }
    >
      {(close) => (
        <div className="p-1">
          <div className="grid grid-cols-2 gap-1">
            {[
              ["Today", 0],
              ["Tomorrow", 1],
              ["In 3 days", 3],
              ["Next week", 7],
            ].map(([label, d]) => (
              <button
                key={label as string}
                onClick={() => {
                  onChange(quick(d as number));
                  close();
                }}
                className="rounded-md px-2 py-1.5 text-left text-[13px] text-text hover:bg-surface-2"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="my-1.5 h-px bg-border" />
          <input
            type="date"
            defaultValue={value ?? todayISO()}
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent/60"
            onChange={(e) => {
              onChange(e.target.value || null);
              close();
            }}
          />
          {value && (
            <button
              onClick={() => {
                onChange(null);
                close();
              }}
              className="mt-1.5 w-full rounded-md px-2 py-1.5 text-left text-[13px] text-danger hover:bg-danger/10"
            >
              Clear due date
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}

const RECUR_LABEL: Record<RecurrenceFreq, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

export function RecurrencePicker({
  value,
  onChange,
}: {
  value?: Recurrence | null;
  onChange: (r: Recurrence | null) => void;
}) {
  const options: (Recurrence | null)[] = [
    null,
    { freq: "daily", interval: 1 },
    { freq: "weekly", interval: 1 },
    { freq: "monthly", interval: 1 },
  ];
  return (
    <Dropdown
      width={176}
      trigger={() => (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-2xs",
            value ? "text-accent" : "text-text-faint hover:text-text-muted"
          )}
        >
          <Repeat className="h-3.5 w-3.5" />
          {value ? RECUR_LABEL[value.freq] : "Does not repeat"}
        </span>
      )}
    >
      {(close) =>
        options.map((o) => (
          <MenuItem
            key={o?.freq ?? "none"}
            active={(o?.freq ?? null) === (value?.freq ?? null)}
            onClick={() => {
              onChange(o);
              close();
            }}
          >
            {o ? RECUR_LABEL[o.freq] : "Does not repeat"}
          </MenuItem>
        ))
      }
    </Dropdown>
  );
}

export function TagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim().toLowerCase();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="group inline-flex items-center gap-0.5">
          <TagChip tag={t} />
          <button
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="text-text-faint hover:text-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center rounded border border-dashed border-border px-1">
        <Plus className="h-3 w-3 text-text-faint" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Backspace" && !input && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={add}
          placeholder="tag"
          className={cn("w-14 bg-transparent px-1 py-0.5 text-2xs text-text outline-none placeholder:text-text-faint")}
        />
      </span>
    </div>
  );
}
