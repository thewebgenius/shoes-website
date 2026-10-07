import Link from "next/link";
import { requireUser } from "@/server/auth/dal";
import { listReviewsForModeration, reviewCounts } from "@/server/services/reviews";
import { moderateReviewAction } from "@/app/admin/actions";
import { Stars } from "@/components/product-bits";
import { STATUS_LABEL } from "@/components/admin/status-badge";

const STATUSES = ["pending", "approved", "rejected", "spam"] as const;

export default async function ReviewsAdmin({ searchParams }: PageProps<"/admin/reviews">) {
  await requireUser("reviews:moderate");
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(String(sp.status)) ? (sp.status as (typeof STATUSES)[number]) : "pending";
  const [rows, counts] = await Promise.all([listReviewsForModeration(status), reviewCounts()]);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-3xl font-semibold">Reviews</h1>
      <p className="mt-1 text-sm text-muted">New reviews stay hidden until approved. Flags come from automatic spam and abuse checks.</p>
      <nav className="mt-5 flex gap-1 overflow-x-auto" aria-label="Filter reviews">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/reviews?status=${s}`} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${status === s ? "bg-ink text-paper" : "bg-white text-ink-2 ring-1 ring-line"}`}>
            {STATUS_LABEL[s]} ({counts[s] ?? 0})
          </Link>
        ))}
      </nav>
      <ul className="mt-5 space-y-3">
        {rows.length === 0 && <li className="card p-10 text-center text-sm text-muted">Nothing here.</li>}
        {rows.map((r) => (
          <li key={r.id} className="card p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Stars value={r.rating} />
              <span className="font-medium">{r.displayName}</span>
              <span className="text-muted">on</span>
              <Link href={`/products/${r.productSlug}`} className="underline" target="_blank">
                {r.productName}
              </Link>
              <span className="text-xs text-muted">{r.createdAt.toLocaleString("en-GB")}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-2">{r.body}</p>
            {r.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.flags.map((f) => (
                  <span key={f} className="chip border-warning/30 bg-warning/10 text-warning">
                    {f.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {(["approved", "rejected", "spam", "delete"] as const)
                .filter((d) => d !== r.status)
                .map((d) => (
                  <form key={d} action={moderateReviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value={d} />
                    <button className={`${d === "approved" ? "btn-primary" : d === "delete" ? "btn-danger" : "btn-ghost"} btn-sm`}>
                      {d === "approved" ? "Approve" : d === "rejected" ? "Reject" : d === "spam" ? "Mark spam" : "Delete"}
                    </button>
                  </form>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
