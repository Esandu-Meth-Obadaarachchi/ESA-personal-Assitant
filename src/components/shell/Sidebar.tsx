"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  Hash,
  LogOut,
  Moon,
  Plus,
  Sparkles,
  Sun,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { createProject } from "@/lib/data/firestore";
import { useTheme } from "@/lib/theme/ThemeContext";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dropdown, MenuItem } from "@/components/ui/Dropdown";
import { Field, Modal, inputClass } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function Sidebar() {
  const { user, signOutUser } = useAuth();
  const { theme, toggle } = useTheme();
  const { projects, currentProject, currentWorkspace, selectProject } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

  const [newProj, setNewProj] = useState(false);
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const createProj = async () => {
    if (!currentWorkspace || !pName.trim()) return;
    setBusy(true);
    try {
      const id = await createProject(currentWorkspace, pName.trim(), { description: pDesc.trim() });
      selectProject(id);
      setNewProj(false);
      setPName("");
      setPDesc("");
      router.push("/");
    } finally {
      setBusy(false);
    }
  };

  const openProject = (id: string) => {
    selectProject(id);
    router.push("/");
  };

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-border bg-surface/40">
      <div className="p-3">
        <WorkspaceSwitcher />
      </div>

      <div className="px-3">
        <Link
          href="/agent"
          className={cn(
            "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-[13px] font-medium transition-all",
            pathname === "/agent"
              ? "border-accent/40 bg-accent/10 text-accent shadow-glow"
              : "border-border bg-surface-2 text-text hover:border-accent/30 hover:text-accent"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Ask the brain
          <kbd className="mono ml-auto rounded border border-border bg-surface px-1.5 py-0.5 text-2xs text-text-faint">
            ⌘K
          </kbd>
        </Link>
      </div>

      {/* Projects */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-2xs font-semibold uppercase tracking-wider text-text-faint">
            Projects
          </span>
          <button
            onClick={() => setNewProj(true)}
            className="grid h-5 w-5 place-items-center rounded text-text-faint hover:bg-surface-2 hover:text-text"
            title="New project"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {projects.map((p) => {
            const active = p.id === currentProject?.id && pathname === "/";
            return (
              <button
                key={p.id}
                onClick={() => openProject(p.id)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                  active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: p.color }}
                />
                <span className="flex-1 truncate">{p.name}</span>
              </button>
            );
          })}
          {projects.length === 0 && (
            <button
              onClick={() => setNewProj(true)}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2 py-2 text-[13px] text-text-faint hover:border-border-strong hover:text-text-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Create your first project
            </button>
          )}
        </nav>
      </div>

      {/* Secondary nav */}
      <div className="space-y-0.5 px-3 pb-2">
        <NavLink href="/knowledge" active={pathname === "/knowledge"} icon={<BookOpen className="h-4 w-4" />}>
          Knowledge base
        </NavLink>
      </div>

      {/* User footer */}
      <div className="border-t border-border p-2">
        <Dropdown
          width={216}
          align="left"
          trigger={() => (
            <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2">
              <Avatar name={user?.displayName} src={user?.photoURL} size={28} />
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13px] font-medium text-text">
                  {user?.displayName ?? "You"}
                </div>
                <div className="truncate text-2xs text-text-faint">{user?.email}</div>
              </div>
            </div>
          )}
        >
          {(close) => (
            <div>
              <MenuItem
                icon={theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                onClick={() => {
                  toggle();
                  close();
                }}
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </MenuItem>
              <div className="my-1 h-px bg-border" />
              <MenuItem danger icon={<LogOut className="h-4 w-4" />} onClick={() => signOutUser()}>
                Sign out
              </MenuItem>
            </div>
          )}
        </Dropdown>
      </div>

      <Modal open={newProj} onClose={() => setNewProj(false)} title="New project">
        <Field label="Name">
          <input
            className={inputClass}
            placeholder="e.g. Ceylon Green Crest"
            autoFocus
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProj()}
          />
        </Field>
        <Field label="Description (optional)">
          <input
            className={inputClass}
            placeholder="What is this project about?"
            value={pDesc}
            onChange={(e) => setPDesc(e.target.value)}
          />
        </Field>
        <p className="mb-3 flex items-center gap-1.5 text-2xs text-text-faint">
          <Hash className="h-3 w-3" /> A private knowledge namespace is created for
          this project automatically.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setNewProj(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={createProj} disabled={!pName.trim() || busy}>
            {busy ? "Creating…" : "Create project"}
          </Button>
        </div>
      </Modal>
    </aside>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
