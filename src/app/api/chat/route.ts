import { NextResponse } from "next/server";
import { requireUser } from "@/lib/firebase/admin";
import { loadUserScope } from "@/lib/ai/server";
import { runAgent, type AgentTurn } from "@/lib/ai/agent";
import { withUsage } from "@/lib/ai/usage";
import type { ToolContext } from "@/lib/ai/tools";
import { MAX_CHAT_INPUT_CHARS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser(req);
  } catch (r) {
    return r instanceof Response ? r : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, workspaceId, projectId, history, voice } = (await req.json()) as {
      message?: string;
      workspaceId?: string;
      projectId?: string;
      history?: AgentTurn[];
      voice?: boolean;
    };
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // The agent's scope is everything the user can access, across ALL their
    // workspaces. `workspaceId`/`projectId` are just the current view, used to
    // default new tasks and to name the current workspace in the prompt.
    const { workspaces, projects } = await loadUserScope(user.uid);

    const ctx: ToolContext = {
      uid: user.uid,
      userName: user.name ?? "You",
      currentWorkspaceId: workspaceId,
      currentProjectId: projectId,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        ragNamespace: p.ragNamespace,
        workspaceId: p.workspaceId,
        memberIds: p.memberIds ?? [],
      })),
      workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
      sources: [],
      cards: [],
      steps: [],
    };

    // Project list grouped by workspace, so the agent knows what spans where.
    const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? "Workspace";
    const grouped = new Map<string, string[]>();
    for (const p of projects) {
      const key = wsName(p.workspaceId);
      grouped.set(key, [...(grouped.get(key) ?? []), p.name]);
    }
    const projectList = [...grouped.entries()]
      .map(([ws, names]) => `${ws}:\n${names.map((n) => `  - ${n}`).join("\n")}`)
      .join("\n");

    // Attribute every Claude call in this request (agent loop + retrieval helpers)
    // to the signed-in user, so the admin dashboard can total their spend. Voice
    // commands run through the same path, so they are counted too.
    const result = await withUsage(
      { uid: user.uid, email: user.email, name: user.name },
      () =>
        runAgent(message.slice(0, MAX_CHAT_INPUT_CHARS), history ?? [], ctx, {
          workspaceName: workspaces.find((w) => w.id === workspaceId)?.name ?? "your workspaces",
          projectName: projects.find((p) => p.id === projectId)?.name,
          projectList,
          voice: !!voice,
        })
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("chat error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed" },
      { status: 500 }
    );
  }
}
