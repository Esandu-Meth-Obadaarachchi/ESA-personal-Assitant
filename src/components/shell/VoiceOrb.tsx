"use client";

import { Loader2, Mic, MicOff, Volume2, X } from "lucide-react";
import { useVoice, type VoicePhase } from "@/lib/voice/VoiceContext";
import { cn } from "@/lib/utils";

/** Floating voice control, mounted once in AppFrame so "Hey Lune" works on every
 *  screen. Collapsed it is a single mic button; while a command is in flight it
 *  grows into a status bubble showing what was heard and what came back. */
export function VoiceOrb() {
  const { supported, enabled, phase, transcript, reply, error, toggle, arm, cancel } = useVoice();

  if (!supported) return null;

  const active = phase === "armed" || phase === "thinking" || phase === "speaking";

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {(active || error) && (
        <div className="pointer-events-auto max-w-[min(22rem,calc(100vw-2rem))] animate-scale-in rounded-xl border border-border bg-surface/95 p-3 shadow-pop backdrop-blur">
          <div className="flex items-start gap-2">
            <PhaseIcon phase={phase} />
            <div className="min-w-0 flex-1">
              <div className="text-2xs font-medium uppercase tracking-wide text-text-faint">
                {error ? "Voice" : phaseLabel(phase)}
              </div>
              <p className="mt-0.5 break-words text-[13px] leading-relaxed text-text">
                {error ?? (phase === "speaking" ? reply : transcript || "Listening…")}
              </p>
            </div>
            {!error && (
              <button
                onClick={cancel}
                aria-label="Stop"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-faint transition-colors hover:bg-surface-2 hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <button
        onClick={enabled ? arm : toggle}
        onContextMenu={(e) => {
          // Right-click / long-press turns listening off without a settings trip.
          e.preventDefault();
          toggle();
        }}
        title={
          enabled
            ? 'Listening for "Hey Lune" — click to speak now, right-click to turn off'
            : "Turn on voice"
        }
        aria-label={enabled ? "Voice on" : "Voice off"}
        className={cn(
          "pointer-events-auto grid h-11 w-11 place-items-center rounded-full border transition-all duration-200 ease-smooth active:translate-y-px",
          enabled
            ? "border-accent/40 bg-accent text-accent-fg shadow-glow hover:bg-accent-hover"
            : "border-border bg-surface text-text-muted shadow-card hover:border-border-strong hover:text-text"
        )}
      >
        {phase === "thinking" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : phase === "speaking" ? (
          <Volume2 className="h-5 w-5" />
        ) : enabled ? (
          <Mic className={cn("h-5 w-5", phase === "armed" && "animate-pulse-dot")} />
        ) : (
          <MicOff className="h-5 w-5" />
        )}
      </button>

      {enabled && !active && !error && (
        <span className="pointer-events-none select-none text-2xs text-text-faint">
          say &ldquo;Hey Lune&rdquo;
        </span>
      )}
    </div>
  );
}

function phaseLabel(phase: VoicePhase): string {
  if (phase === "armed") return "Listening";
  if (phase === "thinking") return "Thinking";
  if (phase === "speaking") return "Lune";
  return "Voice";
}

function PhaseIcon({ phase }: { phase: VoicePhase }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0";
  if (phase === "thinking") return <Loader2 className={cn(cls, "animate-spin text-accent")} />;
  if (phase === "speaking") return <Volume2 className={cn(cls, "text-accent")} />;
  return <Mic className={cn(cls, "animate-pulse-dot text-accent")} />;
}
