# RAG + the agent

## Why Claude + Voyage

Claude has no embedding model, so retrieval and generation are split:

- **Embeddings: Voyage `voyage-3.5`** (1024-dim) — Anthropic's recommended embedding partner. Used for both document chunks (`input_type: document`) and queries (`input_type: query`).
- **Generation + agent: Claude `claude-opus-4-8`** — the tool-calling brain.

The Pinecone index must be **dimension 1024, cosine** to match Voyage.

## Pipeline

```
Ingest (/api/ingest)
  file/text -> parse (pdf-parse | mammoth | utf-8) -> chunkText (~1000 chars, 200 overlap)
            -> Voyage embedDocuments -> Pinecone upsert into project.ragNamespace

Retrieve (search_knowledge tool / /api/related)
  query -> Voyage embedQuery -> Pinecone query in namespace(s) -> top-k chunks
```

Each project owns a Pinecone **namespace** (`project.ragNamespace`), so knowledge is isolated per project. Cross-project search merges results from every namespace in the workspace by score (`queryNamespaces`).

## The agent loop (`src/lib/ai/agent.ts`)

A manual Claude tool-use loop (up to 6 round-trips):

1. `messages.create` with the persona system prompt + tool schemas.
2. If `stop_reason !== "tool_use"`, collect the text answer and return.
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
