import Anthropic from "@anthropic-ai/sdk";

/** The agent + RAG generation model. Opus 4.8 — Anthropic's most capable Opus tier. */
export const CLAUDE_MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}
