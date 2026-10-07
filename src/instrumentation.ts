/**
 * Periodic housekeeping in the Node.js server process: deletes expired try-on
 * previews, expired admin sessions and stale rate-limit counters.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __housekeeping?: NodeJS.Timeout };
  if (g.__housekeeping) return;
  const run = async () => {
    try {
      const { purgeExpiredTryOns } = await import("./server/services/tryon");
      const { pruneExpiredSessions } = await import("./server/auth/session");
      const { pruneRateLimits } = await import("./server/security/rate-limit");
      const n = await purgeExpiredTryOns();
      await pruneExpiredSessions();
      await pruneRateLimits();
      if (n) console.log(`[housekeeping] deleted ${n} expired try-on preview(s)`);
    } catch (e) {
      console.error("[housekeeping]", (e as Error).message);
    }
  };
  g.__housekeeping = setInterval(run, 5 * 60_000);
  g.__housekeeping.unref?.();
  setTimeout(run, 10_000).unref?.();
}
