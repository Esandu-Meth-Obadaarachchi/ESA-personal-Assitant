import { cn } from "@/lib/utils";

/** The Second Brain mark — a filled gold disc carrying the ◭ glyph from the mock. */
export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-[8px] bg-accent font-mono font-bold text-accent-fg shadow-glow",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.62, lineHeight: 1 }}
      aria-hidden
    >
      ◭
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo />
      <span className="text-[15px] font-semibold tracking-tight text-text">
        ESA AI
      </span>
    </div>
  );
}
