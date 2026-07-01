# Data model

Three top-level Firestore collections. Flat (not deeply nested) so security rules and `array-contains` isolation queries stay simple. Every doc carries `memberIds` for isolation.

## Collections

### `workspaces/{id}`
```
name: string
emoji: string
ownerId: string
memberIds: string[]         # uids with access (isolation key)
members: WorkspaceMember[]  # { uid, name, email, photoURL, role }
createdAt: number
```

### `projects/{id}`
```
workspaceId: string
name: string
description: string
ragNamespace: string        # Pinecone namespace for this project's knowledge
color: string               # hex from PROJECT_COLORS
archived: boolean
createdAt: number
memberIds: string[]         # denormalised from the workspace for rules
```

### `tasks/{id}`
```
workspaceId, projectId: string
parentId: string | null     # null = top-level; else recursive subtask
title, notes: string
status: "todo" | "in_progress" | "blocked" | "done"
priority: "low" | "med" | "high" | "urgent"
assigneeId, assigneeName, assigneeAvatar
dueDate, startDate: string | null   # yyyy-mm-dd
tags: string[]
dependencies: string[]      # task ids
linkedDocs: LinkedDoc[]
order: number               # sibling ordering within a level / column
createdAt, updatedAt: number
createdBy: string
memberIds: string[]         # isolation
```

The task tree is stored flat and assembled client-side (`lib/data/tree.ts` -> `buildTree`). Subtasks nest arbitrarily deep via `parentId`.

## Isolation

`firestore.rules` gates every operation on `request.auth.uid in resource.data.memberIds`. Businesses are fully separated — switching workspaces never leaks data. The server (agent) uses `firebase-admin`, which bypasses rules, so `src/lib/ai/server.ts` re-checks membership in code before any read/write.

## Queries + indexes

Every query is single-field equality or `array-contains` and is sorted client-side, so **no composite indexes are needed** (`firestore.indexes.json` is empty by design):

- `workspaces where memberIds array-contains uid`
- `projects where workspaceId == x`
- `tasks where projectId == x`
- `tasks where workspaceId == x` (agent + standup)
- `tasks where memberIds array-contains uid` (cross-project standup)

## Real-time

The client uses `onSnapshot` watchers (`lib/data/firestore.ts`) surfaced through `WorkspaceContext`. Every mutation reflects instantly across open tabs and views.
