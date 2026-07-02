import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase/client";
import { PROJECT_COLORS } from "@/lib/constants";
import type { Project, Task, Workspace, WorkspaceMember } from "@/lib/types";
import { slugifyNamespace } from "./tree";

/**
 * Firestore access layer. Three top-level collections keep security rules and
 * `array-contains` isolation queries simple:
 *   workspaces / projects / tasks
 * Every doc carries `memberIds` so rules can gate reads/writes by membership
 * without a cross-document get() on the hot path.
 */

function requireDb() {
  if (!db) throw new Error("Firestore is not configured.");
  return db;
}

/* ------------------------------ watchers ------------------------------ */

export function watchWorkspaces(uid: string, cb: (ws: Workspace[]) => void): Unsubscribe {
  const q = query(collection(requireDb(), "workspaces"), where("memberIds", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Workspace, "id">) }));
    rows.sort((a, b) => a.createdAt - b.createdAt);
    cb(rows);
  });
}

// NOTE: Firestore "rules are not filters" — a list query must itself be
// constrained to what the rules allow. Our rules gate on `memberIds`, so every
// listener filters by `memberIds array-contains uid` (matching the workspaces
// query) and narrows by workspace/project client-side. Filtering by
// workspaceId/projectId alone returns 403 PERMISSION_DENIED.
export function watchProjects(
  uid: string,
  workspaceId: string,
  cb: (p: Project[]) => void
): Unsubscribe {
  const q = query(collection(requireDb(), "projects"), where("memberIds", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }))
        .filter((p) => p.workspaceId === workspaceId);
      rows.sort((a, b) => a.createdAt - b.createdAt);
      cb(rows);
    },
    (err) => console.error("watchProjects error", err)
  );
}

export function watchTasks(uid: string, projectId: string, cb: (t: Task[]) => void): Unsubscribe {
  const q = query(collection(requireDb(), "tasks"), where("memberIds", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) }))
        .filter((t) => t.projectId === projectId);
      cb(rows);
    },
    (err) => console.error("watchTasks error", err)
  );
}

/** Every project the user can see across all workspaces — powers the all-workspaces board. */
export function watchAllProjects(uid: string, cb: (p: Project[]) => void): Unsubscribe {
  const q = query(collection(requireDb(), "projects"), where("memberIds", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }))),
    (err) => console.error("watchAllProjects error", err)
  );
}

/** Every task the user can see — powers the cross-project daily standup. */
export function watchAllTasks(uid: string, cb: (t: Task[]) => void): Unsubscribe {
  const q = query(collection(requireDb(), "tasks"), where("memberIds", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) })));
  });
}

/* ------------------------------ workspaces ------------------------------ */

export async function createWorkspace(user: User, name: string, emoji: string): Promise<string> {
  const member: WorkspaceMember = {
    uid: user.uid,
    name: user.displayName ?? "You",
    email: user.email ?? "",
    photoURL: user.photoURL,
    role: "owner",
  };
  const ref = await addDoc(collection(requireDb(), "workspaces"), {
    name,
    emoji,
    ownerId: user.uid,
    memberIds: [user.uid],
    members: [member],
    createdAt: Date.now(),
  } satisfies Omit<Workspace, "id">);
  return ref.id;
}

/* ------------------------------ projects ------------------------------ */

export async function createProject(
  workspace: Workspace,
  name: string,
  opts: { description?: string; colorIndex?: number; isInbox?: boolean } = {}
): Promise<string> {
  const color = opts.isInbox
    ? "#6b7280"
    : PROJECT_COLORS[(opts.colorIndex ?? Math.floor(Math.random() * PROJECT_COLORS.length)) % PROJECT_COLORS.length];
  const ref = await addDoc(collection(requireDb(), "projects"), {
    workspaceId: workspace.id,
    name,
    description: opts.description ?? "",
    ragNamespace: slugifyNamespace(`${workspace.name}-${name}`),
    color,
    archived: false,
    isInbox: opts.isInbox ?? false,
    createdAt: Date.now(),
    // denormalised for rules
    memberIds: workspace.memberIds,
  } as Omit<Project, "id"> & { memberIds: string[] });
  return ref.id;
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await updateDoc(doc(requireDb(), "projects", id), patch);
}

/**
 * Guarantee a workspace has exactly one Inbox, healing any duplicates.
 *
 * Duplicate inboxes appeared when two tabs/devices each saw "no inbox yet"
 * (before the create's snapshot arrived) and both created one. This reads the
 * live set from Firestore (not the possibly-stale in-memory snapshot), keeps the
 * oldest inbox as canonical, moves stray tasks onto it and deletes the extras.
 * An in-flight guard stops the same tab from racing itself.
 */
const inboxInFlight = new Map<string, Promise<string>>();

export async function ensureInbox(workspace: Workspace, uid: string): Promise<string> {
  const existing = inboxInFlight.get(workspace.id);
  if (existing) return existing;

  const run = (async () => {
    const database = requireDb();
    const snap = await getDocs(
      query(collection(database, "projects"), where("memberIds", "array-contains", uid))
    );
    const inboxes = snap.docs
      .filter((d) => d.data().workspaceId === workspace.id && d.data().isInbox)
      .sort((a, b) => (a.data().createdAt ?? 0) - (b.data().createdAt ?? 0));

    if (inboxes.length === 0) {
      return createProject(workspace, "Inbox", {
        isInbox: true,
        description: "Loose tasks not tied to a project",
      });
    }

    const canonical = inboxes[0];
    const dupes = inboxes.slice(1);
    if (dupes.length === 0) return canonical.id;

    // Merge: repoint every task on a duplicate inbox to the canonical one, then
    // delete the duplicate project docs.
    const dupeIds = new Set(dupes.map((d) => d.id));
    const taskSnap = await getDocs(
      query(collection(database, "tasks"), where("memberIds", "array-contains", uid))
    );
    const strays = taskSnap.docs.filter((d) => dupeIds.has(d.data().projectId));

    const batch = writeBatch(database);
    strays.forEach((t) => batch.update(t.ref, { projectId: canonical.id, updatedAt: Date.now() }));
    dupes.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return canonical.id;
  })();

  inboxInFlight.set(workspace.id, run);
  try {
    return await run;
  } finally {
    inboxInFlight.delete(workspace.id);
  }
}

/**
 * Delete a workspace and everything under it (projects + tasks). Queries by
 * `memberIds` (the only rule-satisfying list filter), narrows by workspace, then
 * batch-deletes in chunks of 400 to stay under the 500-op batch limit.
 */
export async function deleteWorkspace(uid: string, workspaceId: string) {
  const database = requireDb();
  const [projSnap, taskSnap] = await Promise.all([
    getDocs(query(collection(database, "projects"), where("memberIds", "array-contains", uid))),
    getDocs(query(collection(database, "tasks"), where("memberIds", "array-contains", uid))),
  ]);

  const refs = [
    ...projSnap.docs.filter((d) => d.data().workspaceId === workspaceId).map((d) => d.ref),
    ...taskSnap.docs.filter((d) => d.data().workspaceId === workspaceId).map((d) => d.ref),
    doc(database, "workspaces", workspaceId),
  ];

  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(database);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function deleteProject(id: string, tasks: Task[]) {
  const batch = writeBatch(requireDb());
  tasks.filter((t) => t.projectId === id).forEach((t) => batch.delete(doc(requireDb(), "tasks", t.id)));
  batch.delete(doc(requireDb(), "projects", id));
  await batch.commit();
}

/** Delete a project + all its tasks, fetching the tasks itself (works for any project). */
export async function deleteProjectDeep(uid: string, projectId: string) {
  const database = requireDb();
  const taskSnap = await getDocs(
    query(collection(database, "tasks"), where("memberIds", "array-contains", uid))
  );
  const refs = [
    ...taskSnap.docs.filter((d) => d.data().projectId === projectId).map((d) => d.ref),
    doc(database, "projects", projectId),
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(database);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/* ------------------------------ tasks ------------------------------ */

export interface NewTaskInput {
  workspaceId: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  memberIds: string[];
  createdBy: string;
  status?: Task["status"];
  priority?: Task["priority"];
  dueDate?: string | null;
  dueTime?: string | null;
  order?: number;
  assignee?: { id: string; name: string; avatar?: string | null } | null;
}

export async function createTask(input: NewTaskInput): Promise<string> {
  const now = Date.now();
  const task: Omit<Task, "id"> & { memberIds: string[] } = {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    parentId: input.parentId ?? null,
    title: input.title,
    notes: "",
    status: input.status ?? "todo",
    priority: input.priority ?? "med",
    assigneeId: input.assignee?.id ?? null,
    assigneeName: input.assignee?.name ?? null,
    assigneeAvatar: input.assignee?.avatar ?? null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    startDate: null,
    tags: [],
    dependencies: [],
    linkedDocs: [],
    recurrence: null,
    timeEntries: [],
    googleEventId: null,
    order: input.order ?? now,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    memberIds: input.memberIds,
  };
  const ref = await addDoc(collection(requireDb(), "tasks"), task);
  return ref.id;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  await updateDoc(doc(requireDb(), "tasks", id), { ...patch, updatedAt: Date.now() });
}

/** Delete a task and all of its descendants in one batch. */
export async function deleteTaskTree(ids: string[]) {
  const batch = writeBatch(requireDb());
  ids.forEach((id) => batch.delete(doc(requireDb(), "tasks", id)));
  await batch.commit();
}

/** Persist a re-ordered / re-parented set of tasks after a drag. */
export async function commitTaskMoves(moves: { id: string; order: number; parentId?: string | null; status?: Task["status"] }[]) {
  const batch = writeBatch(requireDb());
  const now = Date.now();
  moves.forEach((m) => {
    const patch: Record<string, unknown> = { order: m.order, updatedAt: now };
    if (m.parentId !== undefined) patch.parentId = m.parentId;
    if (m.status !== undefined) patch.status = m.status;
    batch.update(doc(requireDb(), "tasks", m.id), patch);
  });
  await batch.commit();
}

/* ------------------------------ first-run seed ------------------------------ */

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed a brand-new user with three workspaces so the workspace switcher and the
 * standup have something real to show. Runs once (guarded by an empty-workspace
 * check upstream). Everything is written in a single batch.
 */
export async function seedNewUser(user: User): Promise<string> {
  const database = requireDb();
  const batch = writeBatch(database);
  const now = Date.now();
  const member: WorkspaceMember = {
    uid: user.uid,
    name: user.displayName ?? "You",
    email: user.email ?? "",
    photoURL: user.photoURL,
    role: "owner",
  };
  const base = { memberIds: [user.uid], members: [member], ownerId: user.uid };

  const ws = (name: string, emoji: string, createdAt: number) => {
    const ref = doc(collection(database, "workspaces"));
    batch.set(ref, { name, emoji, createdAt, ...base } satisfies Omit<Workspace, "id">);
    return ref;
  };
  const proj = (
    wsRef: { id: string },
    name: string,
    description: string,
    color: string,
    wsName: string,
    isInbox = false
  ) => {
    const ref = doc(collection(database, "projects"));
    batch.set(ref, {
      workspaceId: wsRef.id,
      name,
      description,
      ragNamespace: slugifyNamespace(`${wsName}-${name}`),
      color,
      archived: false,
      isInbox,
      createdAt: now,
      memberIds: [user.uid],
    });
    return ref;
  };
  let orderSeed = now;
  const task = (
    wsRef: { id: string },
    projRef: { id: string },
    title: string,
    opts: Partial<Task> & { parentRef?: { id: string } } = {}
  ) => {
    const ref = doc(collection(database, "tasks"));
    const { parentRef, ...rest } = opts;
    batch.set(ref, {
      workspaceId: wsRef.id,
      projectId: projRef.id,
      parentId: parentRef?.id ?? null,
      title,
      notes: "",
      status: "todo",
      priority: "med",
      assigneeId: user.uid,
      assigneeName: member.name,
      assigneeAvatar: member.photoURL,
      dueDate: null,
      startDate: null,
      tags: [],
      dependencies: [],
      linkedDocs: [],
      order: orderSeed++,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      memberIds: [user.uid],
      ...rest,
    });
    return ref;
  };

  // --- Office ---
  const office = ws("Office", "💼", now);
  const officeInbox = proj(office, "Inbox", "Loose tasks not tied to a project", "#6b7280", "Office", true);
  task(office, officeInbox, "Reply to the BMPC organisers", { priority: "med", dueDate: isoOffset(1) });
  const solar = proj(office, "SLT Solar Dashboard", "Unified monitoring for 19+ solar sites", "#f5c518", "Office");
  const report = task(office, solar, "Ship the monthly performance report", {
    status: "in_progress",
    priority: "high",
    dueDate: isoOffset(1),
    tags: ["report", "recurring"],
  });
  task(office, solar, "Pull kWh/kWp comparison per site", { parentRef: report, status: "done", priority: "med" });
  task(office, solar, "Draft executive summary", { parentRef: report, status: "in_progress", priority: "high", dueDate: isoOffset(0) });
  task(office, solar, "Get sign-off from operations", { parentRef: report, status: "todo", priority: "med", dueDate: isoOffset(2) });
  task(office, solar, "Fix Excel upload timeout on large files", { status: "blocked", priority: "urgent", dueDate: isoOffset(-1), tags: ["bug", "backend"] });
  task(office, solar, "Add site comparison chart (Recharts)", { status: "todo", priority: "med", dueDate: isoOffset(4), tags: ["frontend"] });
  const powerzenith = proj(office, "PowerZenith", "Real-time energy monitoring + anomaly detection", "#60a5fa", "Office");
  task(office, powerzenith, "Retrain anomaly model on Q2 data", { status: "todo", priority: "high", dueDate: isoOffset(6), tags: ["ml"] });
  task(office, powerzenith, "Wire InfluxDB alerts to dashboard", { status: "todo", priority: "med", dueDate: isoOffset(-2) });

  // --- Freelance ---
  const freelance = ws("Freelance", "🚀", now + 1);
  proj(freelance, "Inbox", "Loose tasks not tied to a project", "#6b7280", "Freelance", true);
  const gradify = proj(freelance, "Gradify", "Question bank, mock exams, AI marking", "#4ade80", "Freelance");
  const foundation = task(freelance, gradify, "Foundation phase build", { status: "in_progress", priority: "high", dueDate: isoOffset(3), tags: ["milestone"] });
  task(freelance, gradify, "Auth + roles (teacher/student)", { parentRef: foundation, status: "todo", priority: "high" });
  task(freelance, gradify, "Question bank schema", { parentRef: foundation, status: "todo", priority: "med" });
  task(freelance, gradify, "Define AI marking rubric prompt", { status: "todo", priority: "med", dueDate: isoOffset(5), tags: ["ai"] });

  // --- LeadX ---
  const leadx = ws("LeadX", "⚡", now + 2);
  proj(leadx, "Inbox", "Loose tasks not tied to a project", "#6b7280", "LeadX", true);
  const pipeline = proj(leadx, "Pipeline", "Lead generation and outreach", "#f472b6", "LeadX");
  task(leadx, pipeline, "Follow up on Predictiv AI conversation", { status: "todo", priority: "high", dueDate: isoOffset(0) });
  task(leadx, pipeline, "Prep Cresco agri-tech application", { status: "todo", priority: "med", dueDate: isoOffset(7) });

  await batch.commit();
  return office.id;
}
