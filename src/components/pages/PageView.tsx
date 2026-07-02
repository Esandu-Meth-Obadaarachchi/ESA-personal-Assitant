"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, FileText, Plus, Trash2 } from "lucide-react";
import type { PartialBlock } from "@blocknote/core";
import { useAuth } from "@/lib/auth/AuthContext";
import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { createPage, deletePageTree, updatePage, watchPage } from "@/lib/data/firestore";
import { useTheme } from "@/lib/theme/ThemeContext";
import type { Page } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { relativeTime } from "@/lib/date";

const BlockEditor = dynamic(() => import("./BlockEditor"), {
  ssr: false,
  loading: () => (
    <div className="grid h-40 place-items-center">
      <Logo size={26} className="animate-pulse-dot" />
    </div>
  ),
});

const EMOJI = ["📄", "📝", "📌", "💡", "📚", "🎯", "⚙️", "🚀", "🧠", "📊", "🗂️", "✅"];

export function PageView({ id }: { id: string }) {
  const { user } = useAuth();
  const { currentWorkspace, projects, pages } = useWorkspace();
  const { theme } = useTheme();
  const router = useRouter();

  const [page, setPage] = useState<Page | null | undefined>(undefined); // undefined = loading
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [initial, setInitial] = useState<{ blocks: PartialBlock[] | undefined } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const loadedRef = useRef(false);
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the page once, then keep watching for meta (title from other devices).
  useEffect(() => {
    loadedRef.current = false;
    setPage(undefined);
    setInitial(null);
    const unsub = watchPage(id, (p) => {
      setPage(p);
      if (!loadedRef.current) {
        loadedRef.current = true;
        setTitle(p?.title ?? "");
        setIcon(p?.icon ?? "");
        let blocks: PartialBlock[] | undefined;
        if (p?.content) {
          try {
            const parsed = JSON.parse(p.content);
            if (Array.isArray(parsed) && parsed.length) blocks = parsed as PartialBlock[];
          } catch {
            /* corrupt content -> start empty */
          }
        }
        setInitial({ blocks });
      }
    });
    return () => {
      unsub();
      if (contentTimer.current) clearTimeout(contentTimer.current);
      if (titleTimer.current) clearTimeout(titleTimer.current);
    };
  }, [id]);

  const saveContent = (json: string) => {
    if (contentTimer.current) clearTimeout(contentTimer.current);
    contentTimer.current = setTimeout(() => {
      updatePage(id, { content: json }).then(() => setSavedAt(Date.now()));
    }, 700);
  };

  const onTitle = (v: string) => {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => updatePage(id, { title: v.trim() || "Untitled" }), 500);
  };

  const setPageIcon = (e: string) => {
    setIcon(e);
    updatePage(id, { icon: e });
  };

  const addSubpage = async () => {
    if (!currentWorkspace || !page) return;
    const newId = await createPage(currentWorkspace, {
      projectId: page.projectId,
      parentId: page.id,
      memberIds: page.memberIds,
    });
    router.push(`/pages/${newId}`);
  };

  const removePage = async () => {
    if (!user) return;
    await deletePageTree(user.uid, id);
    router.push("/pages");
  };

  if (page === null) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <FileText className="h-6 w-6 text-text-faint" />
          <div className="text-sm text-text-muted">This page does not exist or you lost access.</div>
          <Button variant="outline" size="sm" onClick={() => router.push("/pages")}>
            Back to pages
          </Button>
        </div>
      </div>
    );
  }

  if (page === undefined || initial === null) {
    return (
      <div className="grid h-full place-items-center">
        <Logo size={30} className="animate-pulse-dot" />
      </div>
    );
  }

  const project = page.projectId ? projects.find((p) => p.id === page.projectId) : null;
  const parent = page.parentId ? pages.find((p) => p.id === page.parentId) : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* breadcrumb / actions */}
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button
          onClick={() => router.back()}
          className="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
          title="Back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-2xs text-text-faint">
          <button onClick={() => router.push("/pages")} className="hover:text-text">
            Pages
          </button>
          {project && <span className="opacity-50">/</span>}
          {project && <span className="truncate">{project.name}</span>}
          {parent && <span className="opacity-50">/</span>}
          {parent && (
            <button onClick={() => router.push(`/pages/${parent.id}`)} className="truncate hover:text-text">
              {parent.icon || "📄"} {parent.title}
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {savedAt && <span className="text-2xs text-text-faint">saved {relativeTime(savedAt)}</span>}
          <Button variant="outline" size="sm" onClick={addSubpage}>
            <Plus className="h-3.5 w-3.5" /> Subpage
          </Button>
          <button
            onClick={removePage}
            className="grid h-7 w-7 place-items-center rounded-md text-text-faint hover:bg-danger/10 hover:text-danger"
            title="Delete page"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          {/* icon + title */}
          <div className="mb-4 flex items-start gap-3">
            <div className="group relative">
              <button className="grid h-11 w-11 place-items-center rounded-lg text-3xl hover:bg-surface-2">
                {icon || "📄"}
              </button>
              <div className="absolute left-0 top-12 z-10 hidden w-[184px] grid-cols-6 gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-pop group-hover:grid">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    onClick={() => setPageIcon(e)}
                    className="grid h-7 w-7 place-items-center rounded text-lg hover:bg-surface-2"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              rows={1}
              placeholder="Untitled"
              className="mt-0.5 flex-1 resize-none bg-transparent text-[30px] font-bold leading-tight tracking-tight text-text outline-none placeholder:text-text-faint/50"
            />
          </div>

          {/* the editor — remounts per page via key so initial content applies once */}
          <BlockEditor
            key={id}
            initialContent={initial.blocks}
            onChange={saveContent}
            theme={theme === "light" ? "light" : "dark"}
          />
        </div>
      </div>
    </div>
  );
}
