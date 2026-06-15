/**
 * Role-based authorization utilities.
 *
 * The User model has a `role` field (Prisma enum: USER, ADMIN).
 * The role is propagated into the NextAuth session via JWT callbacks in auth.ts.
 *
 * These helpers work with both server-side sessions (from `auth()`) and
 * client-side sessions (from `useSession()`).
 */

import type { Session } from "next-auth";

type UserRole = "USER" | "ADMIN";

function getUserRole(session: Session | null): UserRole | undefined {
  const user = session?.user;
  if (!user) return undefined;
  return (user as { role?: UserRole }).role;
}

/**
 * Check whether the current session has the required role.
 *
 * Returns `true` when the session exists and the user's role matches.
 * Returns `false` for missing sessions, missing roles, or role mismatch.
 */
export function requireRole(
  session: Session | null,
  requiredRole: string
): boolean {
  const role = getUserRole(session);
  return role === requiredRole;
}

/**
 * Convenience check for admin access.
 */
export function requireAdmin(session: Session | null): boolean {
  return requireRole(session, "ADMIN");
}

/**
 * Boolean helper for UI conditional rendering.
 * Equivalent to `requireAdmin(session)` but reads more naturally in JSX.
 */
export function isAdmin(session: Session | null): boolean {
  return requireAdmin(session);
}
