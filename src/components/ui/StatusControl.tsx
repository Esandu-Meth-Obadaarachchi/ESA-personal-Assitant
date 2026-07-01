"use client";

import { Check } from "lucide-react";
import { STATUSES, statusMeta } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";
import { Dropdown, MenuItem } from "./Dropdown";

/** The circular status checkbox from the tree/list rows. Click cycles to done;
 *  the caret area opens a full status picker. */
export function StatusControl({
  status,
  onChange,
  size = 16,
}: {
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
  size?: number;
}) {
  const meta = statusMeta(status);
  const done = status === "done";

  return (
    <Dropdown
      width={168}
      trigger={() => (
        <span
          className={cn(
            "grid place-items-center rounded-full border-[1.5px] transition-all",
            done ? "border-done bg-done text-bg" : `${meta.color} border-current`,
            status === "in_progress" && "border-progress",
            status === "blocked" && "border-blocked",
            status === "todo" && "border-todo/60"
          )}
          style={{ width: size, height: size }}
          title={meta.label}
        >
          {done && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
          {status === "in_progress" && (
            <span className="h-1.5 w-1.5 rounded-full bg-progress" />
          )}
          {status === "blocked" && (
            <span className="h-[7px] w-[2px] rounded-full bg-blocked" />
          )}
        </span>
      )}
    >
      {(close) =>
        STATUSES.map((s) => (
          <MenuItem
            key={s.id}
            active={s.id === status}
            icon={<span className={cn("h-2 w-2 rounded-full", s.dot)} />}
            onClick={() => {
              onChange(s.id);
              close();
            }}
          >
            {s.label}
          </MenuItem>
        ))
      }
    </Dropdown>
  );
}
