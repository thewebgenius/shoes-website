import "server-only";
import { after } from "next/server";

/**
 * Runs work after the response has been sent (Next.js `after`, which `next start`
 * drains on graceful shutdown). Outside a request, e.g. in scripts, it runs
 * right away. Interrupted jobs are marked failed by the services' stale-job checks.
 */
export function runInBackground(fn: () => Promise<unknown>) {
  const task = () => fn().catch((e) => console.error("[background job]", (e as Error).message));
  try {
    after(task);
  } catch {
    void task();
  }
}
