"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, CalendarDays, MessageSquareText, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Boxes, title: "One home for every business", body: "Office, freelance, and your own ventures — isolated workspaces, zero data bleed." },
  { icon: MessageSquareText, title: "An agent that knows your work", body: "Ask about any project. Create tasks by chatting. Powered by Claude + your knowledge base." },
  { icon: CalendarDays, title: "Tree, board, calendar", body: "The same tasks, four ways. Nested subtasks, drag-to-reschedule, keyboard-fast." },
];

export default function LoginPage() {
  const { user, loading, configured, signIn } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-bg px-6">
      {/* Ambient gold glow + fine grid, the calm-and-dense backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          background:
            "radial-gradient(60rem 40rem at 72% -10%, rgb(245 197 24 / 0.10), transparent 60%), radial-gradient(50rem 40rem at 8% 110%, rgb(96 165 250 / 0.07), transparent 55%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.025) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 40%, black, transparent 78%)",
        }}
      />

      <div className="relative grid w-full max-w-5xl gap-12 md:grid-cols-[1.05fr_0.95fr] md:items-center">
        {/* Left: pitch */}
        <div className="animate-fade-in">
          <div className="mb-8 flex items-center gap-3">
            <Logo size={34} />
            <span className="text-lg font-semibold tracking-tight">Second Brain</span>
          </div>
          <h1 className="max-w-md text-[2.6rem] font-semibold leading-[1.05] tracking-tight">
            Your work, thinking
            <span className="text-accent"> alongside you.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-text-muted">
            A project manager and knowledge base fused into one, with a Claude
            agent that reasons across every task and document you own.
          </p>
          <div className="mt-9 grid max-w-md gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-accent">
                  <f.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="text-sm font-medium text-text">{f.title}</div>
                  <div className="text-[13px] leading-snug text-text-muted">{f.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: sign-in card */}
        <div className="card animate-fade-in p-7 shadow-pop lit">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-accent">
            <Sparkles className="h-3.5 w-3.5" /> Sign in to continue
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1.5 text-[13px] text-text-muted">
            Use your Google account. We create a private workspace for you on
            first sign-in.
          </p>

          <button
            onClick={handleSignIn}
            disabled={busy || !configured}
            className={cn(
              "mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-lg bg-white font-medium text-[#1f2430] transition-all hover:brightness-95 disabled:opacity-50",
              "shadow-card active:translate-y-px"
            )}
          >
            <GoogleGlyph />
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>

          {error && (
            <p className="mt-3 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          {!configured && (
            <div className="mt-5 rounded-lg border border-warn/25 bg-warn/[0.07] p-3 text-xs text-text-muted">
              <div className="mb-1 font-medium text-warn">Firebase not configured</div>
              Copy <code className="mono text-text">.env.example</code> to{" "}
              <code className="mono text-text">.env.local</code> and add your
              Firebase web config, then restart the dev server.
            </div>
          )}

          <p className="mt-6 text-center text-2xs leading-relaxed text-text-faint">
            By continuing you agree that your projects and documents are stored
            in your own Firebase + Pinecone instances.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
