import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, type Permission } from "./rbac";
import { getSessionUser, readSessionToken, sessionCookieName, type SessionUser } from "./session";

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Not signed in" : "Not allowed");
  }
}

/** For Server Components and Server Actions: redirects to login when signed out. */
export async function requireUser(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (permission && !can(user.role, permission)) redirect("/admin?denied=1");
  return user;
}

/** For Route Handlers: throws AuthError (mapped to 401/403) instead of redirecting. */
export async function authorizeApi(permission: Permission): Promise<SessionUser> {
  const jar = await cookies();
  const user = await readSessionToken(jar.get(sessionCookieName())?.value);
  if (!user) throw new AuthError(401);
  if (!can(user.role, permission)) throw new AuthError(403);
  return user;
}

export async function optionalUser(): Promise<SessionUser | null> {
  return getSessionUser();
}
