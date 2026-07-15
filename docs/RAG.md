# RAG + the agent

## Why Claude + Voyage

Claude has no embedding model, so retrieval and generation are split:

- **Embeddings: Voyage `voyage-3.5`** (1024-dim) — Anthropic's recommended embedding partner. Used for both document chunks (`input_type: document`) and queries (`input_type: query`).
- **Generation + agent: Claude, model set by the `CLAUDE_MODEL` env var (default `claude-haiku-4-5`)** — the tool-calling brain. Swap to `claude-opus-4-8` or `claude-sonnet-5` for higher answer quality at higher cost. The agentic-retrieval helper steps (rewrite / grade / groundedness) always run on Haiku (`CLAUDE_FAST_MODEL`) regardless.

The Pinecone index must be **dimension 1024, cosine** to match Voyage. Retrieval is upgraded to an agentic loop (rewrite -> rerank -> grade-and-retry -> grounded self-check) — see `docs/AGENTIC_RAG.md`.

## Pipeline

```
Ingest (/api/ingest)
  file/text -> parse (pdf-parse | mammoth | utf-8) -> chunkText (~1000 chars, 200 overlap)
            -> Voyage embedDocuments -> Pinecone upsert into project.ragNamespace

Retrieve (search_knowledge tool / /api/related)
  query -> Voyage embedQuery -> Pinecone query in namespace(s) -> top-k chunks
```

Each project owns a Pinecone **namespace** (`project.ragNamespace`), so knowledge is isolated per project. Cross-project search merges results from every namespace **the user can access** by score (`queryNamespaces`). `loadWorkspace` filters projects by per-project scope, so a scoped member can never retrieve another project's knowledge through the agent.

## The agent loop (`src/lib/ai/agent.ts`)

A manual Claude tool-use loop, bounded by `MAX_TOOL_ROUNDS` (4) round-trips and `MAX_ANSWER_TOKENS` (1024) of output, sent only the last 5 conversation turns to keep cost down:

1. `messages.create` with the persona system prompt + tool schemas.
2. If `stop_reason !== "tool_use"`, collect the text answer, run the grounded self-check, and return.
3. Otherwise execute each `tool_use` block, push `tool_result`s, loop.

Thinking is left off for snappy replies; the persona (`persona.ts`) instructs Claude to reply with final answers only, so reasoning does not leak into the visible message. Reasoning is instead surfaced as collapsible **steps** (the list of tool calls).

## Tools (`src/lib/ai/tools.ts`)

| Tool | Does | Side effects |
|---|---|---|
| `search_knowledge` | Voyage + Pinecone retrieval | emits a `sources` card |
| `list_tasks` | filter workspace tasks (status/overdue/due-today) | emits a `task_list` card |
| `create_task` | write a task via admin | emits a `created_task` card |
| `update_task` | fuzzy-match by title, patch via admin | emits an `updated_task` card |
| `summarize_project` | tasks + top knowledge for the model to summarise | emits sources |

Executors accumulate `sources`, `cards` and `steps` on the `ToolContext`; the route returns them and the UI renders structured cards, not just prose.

## Adding a tool

1. Add a schema object to `TOOLS` and a `case` in `executeTool` (`tools.ts`).
2. If it produces UI, push an `AgentCard` and add a renderer in `components/agent/cards.tsx`.
3. Update the persona prompt if the tool changes what the agent can do. It is auto-wired into the loop — no change to `agent.ts` needed.

Always check the `claude-api` skill for the current SDK shape and model id before editing this layer.
