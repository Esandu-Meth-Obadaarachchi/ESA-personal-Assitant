import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, CLAUDE_MODEL } from "./anthropic";
import { buildAgentSystem } from "./persona";
import { checkGrounded } from "./retrieval";
import { TOOLS, executeTool, type ToolContext } from "./tools";
import type { AgentCard, RetrievedChunk } from "@/lib/types";

// Cost caps. Output tokens are the expensive side (Opus), and each tool round
// re-sends the growing context, so both are bounded.
const MAX_ANSWER_TOKENS = 1024; // ceiling on generated output per reply
const MAX_TOOL_ROUNDS = 4; // ceiling on tool-loop iterations

export interface AgentTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  answer: string;
  steps: string[];
  sources: RetrievedChunk[];
  cards: AgentCard[];
}

function summarizeArgs(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
}

/** Claude tool-use loop. Thinking is off for snappy replies; the persona prompt
 *  keeps reasoning out of the visible answer. Up to 6 tool round-trips. */
export async function runAgent(
  message: string,
  history: AgentTurn[],
  ctx: ToolContext,
  meta: { workspaceName: string; projectName?: string }
): Promise<AgentResult> {
  const system = buildAgentSystem({
    userName: ctx.userName,
    workspaceName: meta.workspaceName,
    projectName: meta.projectName,
    today: new Date().toISOString().slice(0, 10),
    projectList: ctx.projects.map((p) => `- ${p.name}`).join("\n"),
  });

  // Send only the last 5 turns as context. Keeps the model prompt small and
  // the token cost down; the full conversation is persisted in Firestore.
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-5).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  const client = anthropic();

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const resp = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_ANSWER_TOKENS,
      system,
      tools: TOOLS,
      messages,
    });

    if (resp.stop_reason !== "tool_use") {
      let answer = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      const sources = dedupe(ctx.sources);
      // Grounded self-check: when the answer drew on retrieved documents, verify
      // every claim is supported. A miss appends a subtle caveat instead of
      // presenting an unverified answer as fact. See docs/AGENTIC_RAG.md.
      if (sources.length > 0 && answer) {
        try {
          const grounded = await checkGrounded(answer, sources);
          ctx.steps.push(
            grounded
              ? `groundedness check: passed (${sources.length} source(s))`
              : "groundedness check: some claims unverified"
          );
          if (!grounded) {
            answer += "\n\n_Note: parts of this answer may not be fully backed by your documents._";
          }
        } catch {
          /* non-fatal — never block a reply on the self-check */
        }
      }
      return { answer, steps: ctx.steps, sources, cards: ctx.cards };
    }

    messages.push({ role: "assistant", content: resp.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const input = (block.input ?? {}) as Record<string, unknown>;
      ctx.steps.push(`${block.name}(${summarizeArgs(input)})`);
      let result: string;
      try {
        result = await executeTool(block.name, input, ctx);
      } catch (e) {
        result = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    answer: "I ran out of steps before finishing that — try narrowing the request.",
    steps: ctx.steps,
    sources: dedupe(ctx.sources),
    cards: ctx.cards,
  };
}

function dedupe(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}
