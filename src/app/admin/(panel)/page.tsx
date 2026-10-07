import Link from "next/link";
import { sql } from "drizzle-orm";
import { Box, Camera, Eye, MessageSquare, ScanSearch, Star } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db/client";
import { products } from "@/server/db/schema";
import { dashboardAnalytics } from "@/server/services/analytics";
import { reviewCounts } from "@/server/services/reviews";

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const user = await requireUser("analytics:read");
  const sp = await searchParams;
  const [stats, rc, statusRows] = await Promise.all([
    dashboardAnalytics(30),
    reviewCounts(),
    db.select({ status: products.status, n: sql<number>`count(*)::int` }).from(products).groupBy(products.status),
  ]);
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.n)]));

  return (
    <div className="mx-auto max-w-6xl">
      {sp.denied && <p className="mb-4 rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger">You don’t have permission to open that page.</p>}
      <h1 className="font-display text-3xl font-semibold">Welcome back, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-muted">Last {stats.days} days</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link href="/admin/products?status=pending_review" className="card p-5 hover:ring-1 hover:ring-ink/20">
          <p className="text-sm text-muted">Awaiting your approval</p>
          <p className="font-display mt-1 text-3xl font-semibold">{byStatus.pending_review ?? 0}</p>
        </Link>
        <Link href="/admin/reviews" className="card p-5 hover:ring-1 hover:ring-ink/20">
          <p className="text-sm text-muted">Reviews to moderate</p>
          <p className="font-display mt-1 text-3xl font-semibold">{rc.pending ?? 0}</p>
        </Link>
        <Link href="/admin/products" className="card p-5 hover:ring-1 hover:ring-ink/20">
          <p className="text-sm text-muted">Published shoes</p>
          <p className="font-display mt-1 text-3xl font-semibold">{byStatus.published ?? 0}</p>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          { k: "product_view", label: "Product views", icon: Eye },
          { k: "model_interaction", label: "3D interactions", icon: Box },
          { k: "tryon_start", label: "Try-on starts", icon: Camera },
          { k: "tryon_complete", label: "Try-on completions", icon: Camera },
          { k: "visual_search", label: "Visual searches", icon: ScanSearch },
          { k: "review_submit", label: "Reviews submitted", icon: MessageSquare },
        ].map(({ k, label, icon: Icon }) => (
          <div key={k} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <Icon className="size-4 text-gold" aria-hidden />
            <p className="mt-2 text-2xl font-semibold tabular-nums">{stats.totals[k as keyof typeof stats.totals] ?? 0}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Ranking title="Most viewed shoes" unit="views" rows={stats.mostViewed} />
        <Ranking title="Most tried-on shoes" unit="try-ons" rows={stats.mostTriedOn} />
        <Ranking title="Most searched shoes" unit="top-match searches" rows={stats.mostSearched} hint="Times a shoe was the top Find My Shoe result" />
        <Ranking title="Highest-rated shoes" unit="★" rows={stats.highestRated.map((r) => ({ ...r, extra: `${r.count} review${r.count === 1 ? "" : "s"}` }))} icon />
      </div>
    </div>
  );
}

function Ranking({
  title,
  unit,
  rows,
  hint,
  icon,
}: {
  title: string;
  unit: string;
  rows: Array<{ productId: string; name: string; slug: string; value: number; extra?: string }>;
  hint?: string;
  icon?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No data yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.productId}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/admin/products/${r.productId}`} className="truncate hover:underline">
                  {r.name}
                </Link>
                <span className="shrink-0 text-muted tabular-nums">
                  {icon ? (
                    <>
                      <Star className="inline size-3 text-gold" fill="currentColor" strokeWidth={0} /> {r.value}
                    </>
                  ) : (
                    `${r.value} ${unit}`
                  )}
                  {r.extra && <span className="ml-1 text-xs">({r.extra})</span>}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full rounded-full bg-gold" style={{ width: `${(r.value / (icon ? 5 : max)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
