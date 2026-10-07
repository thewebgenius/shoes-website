import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db/client";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export const LIMITS = {
  login: { limit: 5, windowSeconds: 15 * 60 },
  loginIp: { limit: 30, windowSeconds: 15 * 60 },
  review: { limit: 3, windowSeconds: 60 * 60 },
  reviewVote: { limit: 30, windowSeconds: 60 * 60 },
  tryon: { limit: 10, windowSeconds: 60 * 60 },
  visualSearch: { limit: 30, windowSeconds: 60 * 60 },
  analytics: { limit: 300, windowSeconds: 60 * 60 },
  adminUpload: { limit: 120, windowSeconds: 60 * 60 },
} as const;

/**
 * Fixed-window counter stored in Postgres so limits hold across app instances
 * and restarts. One atomic upsert per check.
 */
export async function rateLimit(key: string, opts: { limit: number; windowSeconds: number }): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number; window_start: string }>(sql`
    insert into rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${opts.windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${opts.windowSeconds})
                   then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = rows.rows[0];
  const count = Number(row.count);
  const windowEnds = new Date(row.window_start).getTime() + opts.windowSeconds * 1000;
  return {
    ok: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnds - Date.now()) / 1000)),
  };
}

export async function resetRateLimit(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}

export async function pruneRateLimits() {
  await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
}
