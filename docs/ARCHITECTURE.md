# Architecture

## Layers

```
Browser (client components)
  AuthContext ─ Firebase Auth (Google), current user + ID token
  ThemeContext ─ dark/light
  WorkspaceContext ─ workspaces/projects/tasks via onSnapshot, selection state, first-run seed
  useTaskActions ─ task mutations bound to current project/workspace/user
        │  (reads/writes Firestore directly, gated by rules)
        ▼
  Cloud Firestore  ◄───────────────┐
        ▲                          │ firebase-admin (bypasses rules,
        │ authedFetch (ID token)   │ membership re-checked in code)
        ▼                          │
Next.js API routes (server, Node runtime)
  /api/chat    requireUser -> loadWorkspace -> runAgent (Claude tool loop) ──┘
  /api/ingest  requireUser -> loadProject -> parse -> chunk -> Voyage -> Pinecone
  /api/related requireUser -> loadProject -> Voyage query -> Pinecone query
        │
        ▼
  Anthropic (Claude)   Voyage (embeddings)   Pinecone (vectors)
```

## Request flows

**Task edits** never touch an API route. The client writes to Firestore through `useTaskActions` / `lib/data/firestore.ts`; rules enforce access; `onSnapshot` pushes the change back to every view. This keeps the UI instant and offline-friendly.

**Agent chat**: the client posts `{ message, workspaceId, projectId, history }` with the Firebase ID token. The route verifies the token, loads the workspace + projects, and runs the Claude tool-use loop. Tool executors read/write tasks via admin and search Pinecone. The response carries `{ answer, steps, sources, cards }`, rendered by `components/agent/`.

**Ingestion**: multipart upload (or pasted text) -> parse (pdf-parse / mammoth / raw) -> recursive chunker -> Voyage document embeddings -> Pinecone upsert into the project's namespace.

## Route groups

- `(auth)` — unauthenticated (`/login`).
- `(app)` — auth-guarded; layout redirects to `/login` when signed out and wraps `WorkspaceProvider` + `AppFrame` (sidebar + content + seeding overlay).

## Why Next.js (not plain Vite React)

The Anthropic, Voyage and Pinecone keys must never reach the browser, and Firebase Admin token verification must run server-side. Co-located API routes give us that boundary in one deploy, while the app is still a React SPA behind the routes. This also inherits the existing V1 RAG stack (Next.js 14).

## Extending toward the roadmap

The server boundary is where Phases 2–6 slot in: Google Calendar sync and the WhatsApp webhook are new API routes reusing `runAgent`; Stripe billing is another route + a `subscription` field on the workspace. See `docs/ROADMAP.md`.
