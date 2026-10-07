import "server-only";
import { db } from "../db/client";
import { auditLogs } from "../db/schema";
import { currentIpHash } from "./request";

export type AuditActor = { id: string; email: string } | null;

/** Records an admin action. Failures to audit are logged but never hide the action's own error. */
export async function audit(
  actor: AuditActor,
  action: string,
  target?: { type: string; id: string },
  details?: Record<string, unknown>,
  ipHash?: string,
) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action,
      targetType: target?.type,
      targetId: target?.id,
      details: details ?? null,
      ipHash: ipHash ?? (await currentIpHash().catch(() => null)),
    });
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}
