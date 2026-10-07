import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { db } from "../db/client";
import { sessions, users, type User } from "../db/schema";
import { env } from "../env";
import { randomToken, sha256 } from "../security/crypto";

const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000; // 12 h hard limit
const IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2 h of inactivity

export function sessionCookieName() {
  // __Host- prefix forces Secure, Path=/ and no Domain when served over HTTPS.
  return env().HTTPS ? "__Host-sh_admin" : "sh_admin";
}

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export async function createSession(userId: string, meta: { ipHash?: string; userAgent?: string | null }) {
  const token = randomToken(32);
  const now = Date.now();
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt: new Date(now + ABSOLUTE_TTL_MS),
    lastSeenAt: new Date(now),
    ipHash: meta.ipHash,
    userAgent: meta.userAgent?.slice(0, 200) ?? null,
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env().HTTPS,
    sameSite: "strict",
    path: "/",
    maxAge: ABSOLUTE_TTL_MS / 1000,
  });
}

/** Resolves the session cookie to an active user, enforcing idle and absolute expiry. */
export async function readSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const now = new Date();
  const rows = await db
    .select({ s: sessions, u: { id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);
  const row = rows[0];
  if (!row || !row.u.isActive) return null;
  if (now.getTime() - row.s.lastSeenAt.getTime() > IDLE_TTL_MS) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Touch at most once a minute to avoid a write per request.
  if (now.getTime() - row.s.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id));
  }
  return { id: row.u.id, email: row.u.email, name: row.u.name, role: row.u.role };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  // Session checks compare against the current time, so they always run per request.
  await connection();
  return readSessionToken(jar.get(sessionCookieName())?.value);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(sessionCookieName());
}

export async function destroyAllSessionsFor(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function pruneExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
