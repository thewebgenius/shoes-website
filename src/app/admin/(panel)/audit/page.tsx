import { desc } from "drizzle-orm";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export default async function AuditPage() {
  await requireUser("audit:read");
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(300);
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-3xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-muted">Every admin action and sign-in attempt, newest first. IP addresses are stored only as keyed hashes.</p>
      <div className="mt-5 overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-paper text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap">{r.createdAt.toLocaleString("en-GB")}</td>
                <td className="px-3 py-2">{r.actorEmail ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{r.action}</td>
                <td className="px-3 py-2 font-mono text-muted">{r.targetType ? `${r.targetType}:${r.targetId?.slice(0, 8)}` : ""}</td>
                <td className="max-w-md px-3 py-2 font-mono break-all text-muted">{r.details ? JSON.stringify(r.details).slice(0, 300) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
