"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free popover menu. Anchors a floating panel to a trigger,
 * closes on outside-click and Escape. Good enough for status/priority/assignee
 * pickers and row overflow menus without pulling in a headless-ui dependency.
 */
export function Dropdown({
  trigger,
  children,
  align = "left",
  width = 200,
  className,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          className={cn(
            "glass absolute top-[calc(100%+6px)] z-50 origin-top animate-scale-in overflow-hidden rounded-lg p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0",
            className
          )}
          style={{ width, minWidth: width }}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  active,
  danger,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        danger ? "text-danger hover:bg-danger/10" : "text-text hover:bg-surface-2",
        active && "bg-surface-2"
      )}
    >
      {icon && <span className="grid h-4 w-4 place-items-center text-text-muted">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {active && <span className="text-accent">✓</span>}
    </button>
  );
}
