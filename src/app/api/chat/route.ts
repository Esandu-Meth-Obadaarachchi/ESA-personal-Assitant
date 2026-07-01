import { NextResponse } from "next/server";
import { requireUser } from "@/lib/firebase/admin";
import { loadWorkspace } from "@/lib/ai/server";
import { runAgent, type AgentTurn } from "@/lib/ai/agent";
import type { ToolContext } from "@/lib/ai/tools";

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
    const { message, workspaceId, projectId, history } = (await req.json()) as {
      message?: string;
      workspaceId?: string;
      projectId?: string;
      history?: AgentTurn[];
    };
    if (!message || !workspaceId) {
      return NextResponse.json({ error: "message and workspaceId are required" }, { status: 400 });
    }

    const { ws, projects } = await loadWorkspace(user.uid, workspaceId);

    const ctx: ToolContext = {
      uid: user.uid,
      userName: user.name ?? "You",
      workspaceId,
      memberIds: ws.memberIds,
      currentProjectId: projectId,
      projects: projects.map((p) => ({ id: p.id, name: p.name, ragNamespace: p.ragNamespace })),
      sources: [],
      cards: [],
      steps: [],
    };

    const result = await runAgent(message, history ?? [], ctx, {
      workspaceName: ws.name,
      projectName: projects.find((p) => p.id === projectId)?.name,
    });

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
