import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only telemetry for the `/admin` dashboard. Owner (allow-listed email) only.
 *
 * Joins three sources: Firebase Auth (the user list), the `workspaces`/`projects`
 * collections (membership counts) and the `usage/{uid}` docs written by
 * `lib/ai/usage.ts` (Claude spend). Everything is admin-SDK read — the `usage`
 * collection is server-only in `firestore.rules`.
 */

interface UsageDoc {
  requests?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

interface UserRow {
  uid: string;
  email: string | null;
  name: string | null;
  photo: string | null;
  createdAt: number | null;
  lastSignIn: number | null;
  workspaces: number;
  projects: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
  } catch (r) {
    return r instanceof Response ? r : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 1. All auth users (paginated; one page covers this deployment's size).
    const authUsers: import("firebase-admin/auth").UserRecord[] = [];
    let pageToken: string | undefined;
    do {
      const page = await adminAuth().listUsers(1000, pageToken);
      authUsers.push(...page.users);
      pageToken = page.pageToken;
    } while (pageToken);

    // 2. Membership counts, derived from memberIds across all workspaces/projects.
    const [wsSnap, projSnap, usageSnap] = await Promise.all([
      adminDb().collection("workspaces").get(),
      adminDb().collection("projects").get(),
      adminDb().collection("usage").get(),
    ]);

    const wsCount = new Map<string, number>();
    for (const doc of wsSnap.docs) {
      const ids: string[] = doc.get("memberIds") ?? [];
      for (const uid of ids) wsCount.set(uid, (wsCount.get(uid) ?? 0) + 1);
    }

    const projCount = new Map<string, number>();
    for (const doc of projSnap.docs) {
      const ids: string[] = doc.get("memberIds") ?? [];
      for (const uid of ids) projCount.set(uid, (projCount.get(uid) ?? 0) + 1);
    }

    const usage = new Map<string, UsageDoc>();
    for (const doc of usageSnap.docs) usage.set(doc.id, doc.data() as UsageDoc);

    // 3. Join, one row per auth user. Include usage docs for users who may have
    //    since been deleted from Auth so no spend is silently dropped.
    const seen = new Set<string>();
    const users: UserRow[] = authUsers.map((u) => {
      seen.add(u.uid);
      const usg = usage.get(u.uid) ?? {};
      return {
        uid: u.uid,
        email: u.email ?? null,
        name: u.displayName ?? null,
        photo: u.photoURL ?? null,
        createdAt: u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : null,
        lastSignIn: u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : null,
        workspaces: wsCount.get(u.uid) ?? 0,
        projects: projCount.get(u.uid) ?? 0,
        requests: usg.requests ?? 0,
        inputTokens: usg.inputTokens ?? 0,
        outputTokens: usg.outputTokens ?? 0,
        costUsd: usg.costUsd ?? 0,
      };
    });

    for (const [uid, usg] of usage) {
      if (seen.has(uid)) continue;
      users.push({
        uid,
        email: null,
        name: "(deleted user)",
        photo: null,
        createdAt: null,
        lastSignIn: null,
        workspaces: wsCount.get(uid) ?? 0,
        projects: projCount.get(uid) ?? 0,
        requests: usg.requests ?? 0,
        inputTokens: usg.inputTokens ?? 0,
        outputTokens: usg.outputTokens ?? 0,
        costUsd: usg.costUsd ?? 0,
      });
    }

    users.sort((a, b) => b.costUsd - a.costUsd);

    const totals = users.reduce(
      (acc, u) => {
        acc.costUsd += u.costUsd;
        acc.requests += u.requests;
        acc.inputTokens += u.inputTokens;
        acc.outputTokens += u.outputTokens;
        return acc;
      },
      { costUsd: 0, requests: 0, inputTokens: 0, outputTokens: 0 }
    );

    return NextResponse.json({
      generatedAt: Date.now(),
      totals: {
        users: users.length,
        workspaces: wsSnap.size,
        projects: projSnap.size,
        ...totals,
      },
      users,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("admin stats error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load stats" },
      { status: 500 }
    );
  }
}
