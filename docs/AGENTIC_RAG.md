# Agentic RAG

This is the retrieval upgrade layered on top of the RAG described in `RAG.md`. The old flow was a single embed-and-fetch. The new flow is a small agentic loop that rewrites the query, reranks with a cross-encoder, grades its own results and retries when they are weak, then checks the final answer against its sources. It keeps the existing per-project Pinecone namespaces and Voyage embeddings, so no re-ingestion is needed.

## The pipeline

```
question
  -> rewrite      (Haiku turns it into a search-optimised query)
  -> retrieve     (Voyage embed + Pinecone across the user's allowed project namespaces, wide net of 20)
  -> rerank       (Voyage rerank-2.5 cross-encoder, keep the best 4)
  -> grade        (Haiku: do these chunks answer the question? good | weak)
        weak and attempts < 2 -> rewrite from a new angle and retry
  -> generate     (the agent writes the answer in agent.ts, on CLAUDE_MODEL)
  -> self-check    (Haiku: is every claim supported by the sources?)
```

The "allowed project namespaces" are every project the requesting user belongs to, **across all their workspaces**. `loadUserScope` (`src/lib/ai/server.ts`) loads them by `memberIds`, so search spans workspaces while a scoped member still cannot retrieve another project's knowledge.

### Why each step

- Rewrite. A user question is not a good search query. Haiku turns it into keywords and key entities. On a retry it is told the previous query was weak, so it comes at the topic from a different angle.
- Retrieve (bi-encoder). Voyage embeddings plus Pinecone cast a wide net fast. This is recall: get the right chunk somewhere in the top 20.
- Rerank (cross-encoder). `rerank-2.5` reads each (query, chunk) pair together and scores true relevance, so the best chunks rise to the top 5. This is precision, and it is the single biggest accuracy lever after chunking.
- Grade and retry. Haiku judges whether the chunks actually answer the question. A weak verdict reformulates the query and searches again, up to two attempts, then stops honestly instead of forcing a bad answer.
- Grounded self-check. After the agent writes its answer, Haiku verifies every claim traces to a retrieved source. An unsupported answer gets a subtle caveat rather than being presented as fact.

## Where it lives

| File | Role |
|------|------|
| `src/lib/ai/retrieval.ts` | The loop: `rewriteQuery`, `retrieveAndRerank`, `gradeChunks`, `agenticRetrieve`, `checkGrounded`. |
| `src/lib/ai/voyage.ts` | `rerank()` calling Voyage `rerank-2.5`, alongside the existing embeddings. |
| `src/lib/ai/anthropic.ts` | `complete()` one-shot helper on Haiku, plus the LangSmith wrap on the client. |
| `src/lib/ai/tools.ts` | `search_knowledge` and `summarize_project` now use the loop. |
| `src/lib/ai/agent.ts` | Runs the grounded self-check before returning the answer. |
| `src/app/api/related/route.ts` | Smart linking now retrieves and reranks. |

## Models and cost

- Voyage `voyage-3.5` for embeddings and `rerank-2.5` for reranking (same vendor, same account).
- Claude Haiku 4.5 (`CLAUDE_FAST_MODEL`) for the cheap steps: rewrite, grade, and the groundedness check. Short calls, always Haiku regardless of the generation model.
- The agent's generation model is `CLAUDE_MODEL` (default `claude-haiku-4-5`; set it to `claude-opus-4-8`/`claude-sonnet-5` for higher quality). Generation is also cost-capped in `agent.ts`: `MAX_ANSWER_TOKENS` 1024, `MAX_TOOL_ROUNDS` 4, and only the last 5 turns are sent.

So a single knowledge question adds a handful of small Haiku calls plus one Voyage rerank call on top of the existing embed and Pinecone query.

## LangSmith tracing

The Anthropic client is wrapped with LangSmith. It is a no-op unless enabled, so it is always safe. To turn it on, set in `.env.local`:

```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<your key>
LANGSMITH_PROJECT=second-brain-rag
```

With it on, every model call in the agent and the retrieval loop shows up as a trace, so you are able to see the rewritten query, the grade, and the groundedness verdict for any request.

## Tuning knobs

In `src/lib/ai/retrieval.ts`:

- `CANDIDATES` (20) — the wide net from the bi-encoder. Raise for more recall at more rerank cost.
- `KEEP` (4) — chunks kept after reranking and fed to the model. Fewer keeps the prompt tight.
- `MAX_ATTEMPTS` (2) — the grade-and-retry ceiling. Bounds latency and cost.

## What was deliberately left out

LangChain and LangGraph. The agent already calls the Anthropic SDK directly and cleanly. Wrapping that in a framework would add weight without benefit here. The loop is small enough to read top to bottom in `retrieval.ts` and `agent.ts`. LangSmith gives the observability without the framework.

## No re-ingestion needed

The upgrade keeps the same Voyage embeddings (1024-dim) and the same per-project namespaces. Existing vectors in Pinecone stay valid. Only retrieval changed, not how documents are stored.
