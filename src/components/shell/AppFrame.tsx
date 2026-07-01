"use client";

import { useWorkspace } from "@/lib/data/WorkspaceContext";
import { Logo } from "@/components/ui/Logo";
import { Sidebar } from "./Sidebar";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const { seeding } = useWorkspace();

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>

      {seeding && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-bg/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <Logo size={40} className="animate-pulse-dot" />
            <div className="text-center">
              <div className="text-sm font-medium text-text">Setting up your second brain</div>
              <div className="mt-1 text-xs text-text-muted">
                Creating your workspaces and a few starter projects…
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
