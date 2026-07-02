# Roadmap + status

From `second-brain-app-spec.md` §5. This build delivers a solid runnable foundation (Phase 1 + auth + the Claude agent/RAG core). Later phases are scaffolded to slot into the server boundary.

**Backend is live.** Firebase project `second-brain-fbf414` is provisioned: Google auth enabled, Firestore in `asia-south1` with rules deployed, Admin SDK key set. The task manager runs end to end today. The agent/RAG needs `ANTHROPIC_API_KEY` + `VOYAGE_API_KEY` + `PINECONE_API_KEY` (still blank). See `docs/SETUP.md`.

| Phase | Scope | Status |
|---|---|---|
| 1 | Data model, React app, task CRUD, four views, doc export | **Done** (doc export pending) |
| — | Firebase Google auth + per-business workspaces | **Done** |
| — | Knowledge (Voyage + Pinecone) + agent action tools (Phase 3 pulled forward) | **Done** |
| — | Daily AI standup + smart linking | **Done** |
| 2 | Google Calendar two-way sync | **Done** — OAuth (offline), push task->event, watch-channel + webhook reverse sync, "Sync now". Needs a Google OAuth client + (for live reverse) a public webhook URL. See `docs/CALENDAR.md` |
| 4 | WhatsApp Cloud API bot | Not started — reuses `runAgent` behind a webhook route |
| 5 | Time tracking, recurring tasks, templates, roles | **Time tracking + recurring tasks done**; roles modelled (`WorkspaceMember.role`); templates not started |
| — | Single-page doc export (Phase 1) | **Done** — printable project + task-tree, PDF via print |
| 6 | Stripe billing + client-viewer portal | Not started |

## What is intentionally stubbed / not built

- **Project templates**: not built.
- **WhatsApp / Stripe**: need external accounts + approvals; not wired.
- **RAG / agent** (search, chat, smart-linking, meeting-notes->tasks): built but needs `ANTHROPIC_API_KEY` + `VOYAGE_API_KEY` + `PINECONE_API_KEY`.
- **Calendar live reverse-sync** works only with a public `CALENDAR_WEBHOOK_URL` (tunnel/deploy); push + manual "Sync now" work on localhost. Publishing the OAuth app beyond test users triggers Google's weeks-long sensitive-scope review.

## Building the next phases

- **Calendar sync** — `/api/calendar/*` routes: OAuth 2.0, push task due-date changes to Google, receive watch-channel callbacks, reconcile. Store the Google refresh token per user (server-only).
- **WhatsApp** — `/api/whatsapp/webhook`: verify Meta signature -> resolve user -> `runAgent(message, [], ctx)` -> reply. The agent layer is already interface-agnostic.
- **Time tracking** — add `time_entries[]` to `Task`, a timer control, and a billable-hours export.
- **Templates + recurring** — a `TaskTemplate` collection that spawns a task tree; a scheduled job (or cron route) for recurring tasks.
- **Billing** — Stripe checkout route + `subscription` on the workspace; gate workspace/storage/agent limits.

Pre-launch long-lead items (start early): Google OAuth verification, WhatsApp Business approval, a privacy policy for processing customer documents through RAG + Google + WhatsApp.
