/**
 * Admin allow-list. Only these emails may reach `/api/admin/*` and see the
 * `/admin` dashboard. Kept deliberately narrow — that surface exposes every
 * user's account and Claude spend.
 *
 * This module is pure and client-safe (no server imports) so the dashboard page
 * can share the check. The server-side token guard lives in `lib/adminGuard.ts`.
 */

export const ADMIN_EMAILS = ["eobadaarachchi@gmail.com"];

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
