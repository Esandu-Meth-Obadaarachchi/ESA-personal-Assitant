# Changelog

Notable changes, newest first. Product name: **Lune AI**.

## 2026-07-15 — Team, statuses, cheaper agent

Shipped to `main` and deployed to https://luneai.site.

### Added
- **AI task assignment + Team tab.** Per-project member roles/skills (`project.team`) set on a new **Team** tab. Admins turn a brief (PDF/DOCX/text) into an assigned task list via `/api/assign` — the AI splits the work and assigns by role, skills and current workload, shown as a preview to approve before anything is written. See `docs/COLLABORATION.md`.
- **Members board.** New **Members** tab: a Kanban with one column per teammate + Unassigned, live counts, and drag-to-reassign.
- **Custom task statuses.** Per-project status columns on top of the four built-ins. Add/delete on the Board with a colour; deleting one moves its tasks back to To Do. Shown in the Board, List and status picker.
- **Agent chat history.** Conversations save to Firestore (`chats` + `chatMessages`), with a sidebar to reopen and delete them. Only the last 5 turns are sent to the model.
- **Configurable model.** Generation model is now the `CLAUDE_MODEL` env var (default `claude-haiku-4-5`); set it to Opus/Sonnet for higher quality.

### Changed
- **Cheaper agent.** Output capped at `MAX_ANSWER_TOKENS` 1024, tool rounds at `MAX_TOOL_ROUNDS` 4; retrieval trimmed to `KEEP` 4 chunks / 500-char passages / `MAX_ATTEMPTS` 2; chat input capped at `MAX_CHAT_INPUT_CHARS` 2000 (composer + server).
- **Composer grows** with the prompt up to a cap, then scrolls.
- **First-run seed** is now a single **Test it out** sandbox workspace with two demo projects (was Office / Freelance / LeadX).

### Fixed
- **RAG per-project scope.** `loadWorkspace` now filters the agent's projects by per-project membership, not just workspace membership — a scoped member can no longer read another project's knowledge or tasks through the chatbot.
- **Chat history loaded blank.** `loadChatMessages`/`deleteChat` queried `chatMessages` by `chatId` only, which the rules reject ("rules are not filters"). They now query by `memberIds array-contains uid` and narrow to the chat in JS.

### Ops
- Firestore `chats`/`chatMessages` rules must be live for chat history — `firebase deploy --only firestore:rules`.
