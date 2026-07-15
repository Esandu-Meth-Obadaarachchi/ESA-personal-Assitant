"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";
import type { Chat } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  chats: Chat[];
  currentChatId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

/** Left rail on the Agent page: past conversations plus a new-chat button. */
export function ChatSidebar({ chats, currentChatId, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="flex w-[248px] shrink-0 flex-col border-r border-border">
      <div className="p-2">
        <button
          onClick={onNew}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[13px] text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {chats.length === 0 ? (
          <p className="px-2 py-3 text-2xs text-text-faint">No saved chats yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-8 text-left text-[13px] transition-colors",
                    c.id === currentChatId
                      ? "bg-surface-3 text-text"
                      : "text-text-muted hover:bg-surface-2 hover:text-text"
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-faint" />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  aria-label="Delete chat"
                  className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
