import { requireUser, type AuthedUser } from "@/lib/firebase/admin";
import { isAdminEmail } from "@/lib/admin";

/**
 * Server-only admin gate. Verifies the caller's Firebase ID token and that their
 * email is on the allow-list. Throws a Response (401/403) otherwise. Keep this
 * out of client bundles — it imports firebase-admin.
 */
export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const user = await requireUser(req);
  if (!isAdminEmail(user.email)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}
