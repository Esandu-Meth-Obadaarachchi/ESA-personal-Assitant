<div align="center">

# ◭ Second Brain

**An AI-native project + knowledge manager. Notion-meets-Linear, powered by Claude.**

Projects · tasks · a knowledge base, and a Claude agent that reasons across all of it.

</div>

---

## What it does

- **Execution** — Workspaces (per business) → Projects → Tasks → recursive Subtasks. Four synced views: **Tree**, **Kanban** (drag between columns), **List**, **Calendar** (drag to reschedule).
- **Knowledge** — upload PDFs, DOCX, notes or code. They are chunked, embedded with **Voyage** and stored per-project in **Pinecone**.
- **The brain** — a **Claude (`claude-opus-4-8`)** agent that answers questions from your documents, and creates/updates tasks by chatting. Plus a **daily standup** (overdue / due today / blocked / suggested).
- **Smart linking** — every task surfaces related documents from its project's knowledge base.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Firebase Auth (Google) + Firestore · Anthropic Claude · Voyage embeddings · Pinecone · @dnd-kit.

Dark-first design system, one gold accent, per-workspace data isolation.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in Firebase, Voyage, Pinecone, Anthropic
npm run dev                  # http://localhost:3000
```

Full step-by-step (Firebase project, service account, Pinecone index dimensions, rules deploy) is in **[docs/SETUP.md](docs/SETUP.md)**. On first sign-in the app seeds sample workspaces so nothing is empty.

## Docs

| | |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Working guide for Claude Code (start here to change code) |
| [docs/SETUP.md](docs/SETUP.md) | Get it running |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers + request flows |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Firestore collections + isolation |
| [docs/RAG.md](docs/RAG.md) | Embeddings, Pinecone, the agent + tools |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens + component library |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phase status + what's next |

## Scripts

```bash
npm run dev        # dev server
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run lint       # next lint
```

## Security

Model + embedding + vector keys are server-only (API routes). Firestore rules isolate every workspace by `memberIds`. See `firestore.rules`. Never commit `.env.local`.
