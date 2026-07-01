import { adminDb } from "@/lib/firebase/admin";
import type { Project, Workspace } from "@/lib/types";

/** Load a workspace + its projects, enforcing membership (admin bypasses rules). */
export async function loadWorkspace(uid: string, workspaceId: string) {
  const wsDoc = await adminDb().collection("workspaces").doc(workspaceId).get();
  if (!wsDoc.exists) throw new Response("Workspace not found", { status: 404 });
  const ws = { id: wsDoc.id, ...(wsDoc.data() as Omit<Workspace, "id">) };
  if (!ws.memberIds.includes(uid)) throw new Response("Forbidden", { status: 403 });

  const projSnap = await adminDb().collection("projects").where("workspaceId", "==", workspaceId).get();
  const projects = projSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }));
  return { ws, projects };
}

/** Load a single project, enforcing membership. */
export async function loadProject(uid: string, projectId: string) {
  const doc = await adminDb().collection("projects").doc(projectId).get();
  if (!doc.exists) throw new Response("Project not found", { status: 404 });
  const project = { id: doc.id, ...(doc.data() as Omit<Project, "id">) } as Project & { memberIds?: string[] };
  if (project.memberIds && !project.memberIds.includes(uid)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return project;
}
