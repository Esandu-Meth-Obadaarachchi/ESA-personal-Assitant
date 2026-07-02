# Second Brain — Claude Code Working Guide

Read this first in any session. It is the map of the codebase and the rules for changing it.

## What this is

An AI-native project + knowledge manager. Notion-meets-Linear feel: dense, dark, keyboard-friendly. Three pillars on one backend:

1. **Execution** — Workspace -> Project -> Task -> Subtask (recursive). Four views: Tree, Kanban, List, Calendar.
2. **Knowledge** — per-project RAG. Upload docs, they are chunked, embedded (Voyage) and stored in Pinecone.
3. **Agent** — a Claude tool-calling agent ("the brain") that reads and writes tasks and searches knowledge. Plus a daily standup.

Full product intent is in `second-brain-app-spec.md` and `second-brain-design-brief.md` at the repo root (source material — not code).

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14.2 (App Router) + TypeScript | `src/` dir, `@/*` path alias |
| Styling | Tailwind CSS 3.4, CSS-variable tokens | dark default, light fallback |
| Auth | Firebase Auth (Google) | client SDK; server verifies ID tokens |
| Database | Cloud Firestore | real-time `onSnapshot`, per-workspace isolation |
| Agent + generation | Anthropic Claude (`claude-opus-4-8`) | tool-use loop, server-only |
| Embeddings | Voyage AI (`voyage-3.5`, 1024-dim) | Claude has no embedding model |
| Vector store | Pinecone | one index, namespace per project |
| Drag + drop | @dnd-kit | Kanban + Calendar |

Model + RAG rationale: `docs/RAG.md`. Data model: `docs/DATA_MODEL.md`. Visual system: `docs/DESIGN_SYSTEM.md`. Architecture: `docs/ARCHITECTURE.md`. Setup: `docs/SETUP.md`. Roadmap + phase status: `docs/ROADMAP.md`.

## Live instance (provisioned)

A working Firebase backend is already provisioned and wired via `.env.local` (untracked):

- **Firebase project:** `second-brain-fbf414` (owner `eobadaarachchi@gmail.com`), pinned in `.firebaserc`.
- **Auth:** Google sign-in enabled. Signed-in users are seeded with Office / Freelance / LeadX workspaces on first login.
- **Firestore:** created in `asia-south1`, security rules deployed. Live data confirmed (workspaces/projects/tasks tied to the owner uid).
- **Admin SDK:** service-account key (`firebase-adminsdk-fbsvc@…`) generated and set in `.env.local`, verified working — so the API routes' auth (`requireUser`) and agent task writes are ready.
- **Still blank (add when doing the agent):** `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `PINECONE_API_KEY`. Until these exist, the task manager is fully functional; `/api/chat`, `/api/ingest`, `/api/related` return a clear error.

Setup for a fresh instance from scratch: `docs/SETUP.md`.

## Directory map

```
src/
  app/
    layout.tsx                 Root: AuthProvider + ThemeProvider, theme-flash guard
    (auth)/login/page.tsx      Google sign-in
    (app)/layout.tsx           Auth guard -> WorkspaceProvider -> AppFrame
    (app)/page.tsx             Project View (Tree/Board/List/Calendar + task drawer)
    (app)/agent/page.tsx       Standup + chat surface
    (app)/knowledge/page.tsx   Document / note ingestion
    api/chat/route.ts          Claude agent (POST)
    api/ingest/route.ts        parse -> chunk -> embed -> Pinecone upsert (POST)
    api/related/route.ts       Smart linking: related knowledge for a task (POST)
  components/
    ui/        Design-system primitives (Button, Avatar, Dropdown, Modal, chips...)
    shell/     Sidebar, WorkspaceSwitcher, AppFrame
    task/      TaskRow, TaskCard, TaskDrawer, Pickers
    views/     TreeView, KanbanBoard, ListView, CalendarView
    project/   ProjectHeader (tabs + stats)
    agent/     StandupCard, AgentMessage, cards
  lib/
    firebase/  client.ts (browser), admin.ts (server, requireUser)
    auth/      AuthContext
    theme/     ThemeContext
    data/      firestore.ts, WorkspaceContext, useTaskActions, tree.ts, standup.ts
    ai/        voyage.ts, pinecone.ts, anthropic.ts, chunker.ts, parse.ts,
               persona.ts, tools.ts, agent.ts, server.ts
    types.ts, constants.ts, date.ts, utils.ts, api.ts
firestore.rules / firestore.indexes.json / firebase.json
```

## Non-negotiable rules

1. **Secrets stay server-side.** `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `PINECONE_API_KEY` and the Firebase Admin key are only ever read inside `src/app/api/**` or `src/lib/ai/**` / `src/lib/firebase/admin.ts`. Never import those into a client component. Only `NEXT_PUBLIC_*` Firebase values reach the browser.
2. **All task/project/workspace mutations go through the data layer.** Client code calls `useTaskActions()` or the functions in `src/lib/data/firestore.ts` — never `updateDoc` inline in a component. The agent (server) writes through `firebase-admin` in `src/lib/ai/tools.ts`.
3. **Per-workspace isolation is enforced by `memberIds`.** Every workspace/project/task doc carries `memberIds`. `firestore.rules` gates every read/write on `request.auth.uid in memberIds`. When you add a doc type, add `memberIds` and a rule.
4. **Colours come from tokens.** Use the Tailwind semantic tokens (`bg`, `surface`, `accent`, `text-muted`, `danger`...). Do not hardcode hex in components. New colours go in `globals.css` + `tailwind.config.ts`.
5. **Keep the tree/list/board/calendar consistent.** They render the same `Task` data; a field added to one view's editing surface should be honoured everywhere it is shown.
6. **Never push straight to `main` on a real deployment.** Feature branch + PR. (Local dev on `main` is fine.)

## How the agent works (important)

`POST /api/chat` -> `requireUser` verifies the Firebase ID token -> `loadWorkspace` fetches the workspace + its projects (membership enforced) -> `runAgent` runs a Claude tool-use loop (`src/lib/ai/agent.ts`) with the tools in `src/lib/ai/tools.ts`:

- `search_knowledge` — Voyage-embed the query, Pinecone query in project namespace(s)
- `list_tasks`, `create_task`, `update_task` — read/write Firestore via admin
- `summarize_project` — tasks + top knowledge chunks

Tool executors accumulate `sources`, `cards` and `steps` on the `ToolContext`; these are returned to the UI and rendered by `components/agent/cards.tsx`. Thinking is left off for latency; the persona prompt (`src/lib/ai/persona.ts`) keeps reasoning out of the visible answer.

When you change the API/agent surface, read the `claude-api` skill for current model IDs and SDK shapes — do not guess.

## Working conventions

- Commit per subtask with a conventional-commit subject (`feat(scope): …`). Keep commits coherent and buildable.
- Run `npm run typecheck` before committing; `npm run build` before opening a PR.
- Match the surrounding style: comment density, naming, token usage. New components are `"use client"` only when they use hooks/state.
- Prefer editing an existing primitive over inventing a parallel one. Reuse `Dropdown`, `Modal`, `Button`, the pickers.

## Commands

```bash
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run build      # production build (run before PRs)
npm run lint       # next lint
```

## Where to start for common tasks

| Task | Start in |
|---|---|
| A new task field | `lib/types.ts` -> `firestore.ts` + `useTaskActions` -> the four views + `TaskDrawer` |
| A new agent tool | `lib/ai/tools.ts` (schema + executor) -> it is auto-wired into the loop |
| A new view | `components/views/` -> add a tab in `project/ProjectHeader.tsx` + `app/(app)/page.tsx` |
| Change the look | `src/app/globals.css` tokens + `tailwind.config.ts`, then `docs/DESIGN_SYSTEM.md` |
| A new doc type / collection | `lib/types.ts`, `firestore.ts`, and add a rule in `firestore.rules` |

Also see `.claude/skills/` for the design-system, component-builder and firestore-patterns skills, and `.claude/agents/` for specialised subagents.
