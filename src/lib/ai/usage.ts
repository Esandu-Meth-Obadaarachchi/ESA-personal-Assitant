import { AsyncLocalStorage } from "node:async_hooks";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Per-user Claude usage tracking. Server-only. Every Claude call inside a request
 * runs within a `withUsage(user, ...)` scope; `recordUsage` reads the active scope
 * and folds the response's token counts into `usage/{uid}` in Firestore. The admin
 * dashboard (`/admin`) reads those docs. Nothing here reaches the browser.
 *
 * There is no historical backfill — Anthropic never exposed per-user usage and the
 * app never stored it, so figures accumulate from the moment this ships.
 */

interface UsageActor {
  uid: string;
  email?: string;
  name?: string;
}

const store = new AsyncLocalStorage<UsageActor>();

/** Run `fn` in a scope that attributes any Claude usage to `actor`. */
export function withUsage<T>(actor: UsageActor, fn: () => Promise<T>): Promise<T> {
  return store.run(actor, fn);
}

/**
 * Anthropic's `usage` block. Fields are optional and nullable to match the SDK's
 * `Usage` type — cache fields are null unless prompt caching is on.
 */
export interface ClaudeUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Published per-1M-token rates (USD). Cache writes bill ~1.25x input, cache reads
 * ~0.1x input. Unknown models fall back to Haiku — the default generation model.
 * Keep in sync with the models the app can be pointed at via CLAUDE_MODEL.
 */
const RATES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
};

function costFor(model: string, u: ClaudeUsage): number {
  const rate = RATES[model] ?? RATES["claude-haiku-4-5"];
  const input = (u.input_tokens ?? 0) / 1_000_000;
  const output = (u.output_tokens ?? 0) / 1_000_000;
  const cacheRead = (u.cache_read_input_tokens ?? 0) / 1_000_000;
  const cacheWrite = (u.cache_creation_input_tokens ?? 0) / 1_000_000;
  return (
    input * rate.in +
    output * rate.out +
    cacheRead * rate.in * 0.1 +
    cacheWrite * rate.in * 1.25
  );
}

/**
 * Fold one Claude response's usage into the active user's running total. Fire-and-
 * forget: a tracking failure must never break the actual request, so it swallows
 * errors and returns immediately. No-ops when called outside a `withUsage` scope.
 */
export function recordUsage(model: string, usage: ClaudeUsage | undefined): void {
  const actor = store.getStore();
  if (!actor || !usage) return;

  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cost = costFor(model, usage);

  const inc = FieldValue.increment;
  void adminDb()
    .collection("usage")
    .doc(actor.uid)
    .set(
      {
        uid: actor.uid,
        email: actor.email ?? null,
        name: actor.name ?? null,
        requests: inc(1),
        inputTokens: inc(inTok),
        outputTokens: inc(outTok),
        cacheReadTokens: inc(cacheRead),
        cacheCreationTokens: inc(cacheWrite),
        costUsd: inc(cost),
        updatedAt: Date.now(),
        byModel: {
          [model]: {
            requests: inc(1),
            inputTokens: inc(inTok),
            outputTokens: inc(outTok),
            costUsd: inc(cost),
          },
        },
      },
      { merge: true }
    )
    .catch((err) => console.error("usage tracking failed", err));
}
