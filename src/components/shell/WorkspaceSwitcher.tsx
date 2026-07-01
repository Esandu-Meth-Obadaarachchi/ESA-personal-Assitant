"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { createWorkspace } from "@/lib/data/firestore";
import { WORKSPACE_EMOJIS } from "@/lib/constants";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal, Field, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(WORKSPACE_EMOJIS[0]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user || !name.trim()) return;
    setBusy(true);
    try {
      const id = await createWorkspace(user, name.trim(), emoji);
      selectWorkspace(id);
      setCreating(false);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dropdown
        width={244}
        className="!left-0"
        trigger={() => (
          <div className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-border-strong hover:bg-surface-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface text-base">
              {currentWorkspace?.emoji ?? "🧠"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-text">
                {currentWorkspace?.name ?? "Workspace"}
              </div>
              <div className="text-2xs text-text-faint">
                {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}
              </div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          </div>
        )}
      >
        {(close) => (
          <div>
            <div className="px-2 pb-1 pt-1 text-2xs font-medium uppercase tracking-wide text-text-faint">
              Workspaces
            </div>
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  selectWorkspace(w.id);
                  close();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2",
                  w.id === currentWorkspace?.id && "bg-surface-2"
                )}
              >
                <span className="grid h-6 w-6 place-items-center rounded-md bg-surface text-sm">
                  {w.emoji}
                </span>
                <span className="flex-1 truncate text-text">{w.name}</span>
                {w.id === currentWorkspace?.id && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <button
              onClick={() => {
                setCreating(true);
                close();
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md border border-dashed border-border-strong">
                <Plus className="h-3.5 w-3.5" />
              </span>
              New workspace
            </button>
          </div>
        )}
      </Dropdown>

      <Modal open={creating} onClose={() => setCreating(false)} title="New workspace">
        <Field label="Emoji">
          <div className="flex flex-wrap gap-1.5">
            {WORKSPACE_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-md border text-lg transition-colors",
                  emoji === e ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2"
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Name">
          <input
            className={inputClass}
            placeholder="e.g. Hotel ODON"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? "Creating…" : "Create workspace"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
