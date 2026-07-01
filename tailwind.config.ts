import type { Config } from "tailwindcss";

/**
 * Design language (from second-brain-design-brief.md + the Claude Design mock):
 *   near-black slate base, one confident gold accent, monospace for IDs/timestamps.
 *   Notion-meets-Linear. Dark mode is the default; light mode is a first-class fallback.
 * All colours are driven by CSS variables in globals.css so the two themes share one
 * component layer. Never hardcode a hex in a component — reach for a token here.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
        "text-faint": "rgb(var(--text-faint) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        "accent-soft": "rgb(var(--accent-soft) / <alpha-value>)",
        // Semantic status colours (task states, due-date chips, priority)
        todo: "rgb(var(--todo) / <alpha-value>)",
        progress: "rgb(var(--progress) / <alpha-value>)",
        blocked: "rgb(var(--blocked) / <alpha-value>)",
        done: "rgb(var(--done) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.875rem" }],
      },
      borderRadius: {
        // "rounded-but-tight" per the brief
        sm: "5px",
        DEFAULT: "7px",
        md: "8px",
        lg: "11px",
        xl: "14px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.30)",
        pop: "0 8px 30px -6px rgb(0 0 0 / 0.55), 0 2px 8px -2px rgb(0 0 0 / 0.4)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.35), 0 6px 24px -6px rgb(var(--accent) / 0.25)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(8px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
        "slide-in": "slide-in 0.2s ease-out",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
