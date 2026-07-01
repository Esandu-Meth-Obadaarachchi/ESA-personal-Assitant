# Roadmap + status

From `second-brain-app-spec.md` §5. This build delivers a solid runnable foundation (Phase 1 + auth + the Claude agent/RAG core). Later phases are scaffolded to slot into the server boundary.

| Phase | Scope | Status |
|---|---|---|
| 1 | Data model, React app, task CRUD, four views, doc export | **Done** (doc export pending) |
| — | Firebase Google auth + per-business workspaces | **Done** |
| — | Knowledge (Voyage + Pinecone) + agent action tools (Phase 3 pulled forward) | **Done** |
| — | Daily AI standup + smart linking | **Done** |
| 2 | Google Calendar two-way sync | Calendar view + drag-to-reschedule done; sync stubbed (indicator only) |
| 4 | WhatsApp Cloud API bot | Not started — reuses `runAgent` behind a webhook route |
| 5 | Roles, templates, time tracking, recurring tasks | Roles modelled (`WorkspaceMember.role`); rest not started |
| 6 | Stripe billing + client-viewer portal | Not started |

## What is intentionally stubbed

- **Google Calendar**: the Calendar view reschedules tasks in Firestore and shows a "Synced with Google" indicator, but there is no OAuth/watch-channel sync yet. Start Google OAuth verification early (sensitive scopes take weeks).
- **Doc export (Phase 1)**: single-page project + task-tree export to PDF/HTML is speced but not built.
- **WhatsApp / Stripe**: need external accounts + approvals; not wired.

## Building the next phases

- **Calendar sync** — `/api/calendar/*` routes: OAuth 2.0, push task due-date changes to Google, receive watch-channel callbacks, reconcile. Store the Google refresh token per user (server-only).
- **WhatsApp** — `/api/whatsapp/webhook`: verify Meta signature -> resolve user -> `runAgent(message, [], ctx)` -> reply. The agent layer is already interface-agnostic.
- **Time tracking** — add `time_entries[]` to `Task`, a timer control, and a billable-hours export.
- **Templates + recurring** — a `TaskTemplate` collection that spawns a task tree; a scheduled job (or cron route) for recurring tasks.
- **Billing** — Stripe checkout route + `subscription` on the workspace; gate workspace/storage/agent limits.

Pre-launch long-lead items (start early): Google OAuth verification, WhatsApp Business approval, a privacy policy for processing customer documents through RAG + Google + WhatsApp.
