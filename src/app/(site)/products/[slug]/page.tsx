import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Camera, ChevronRight, ShieldCheck } from "lucide-react";
import { CATEGORIES } from "@/config/site";
import { approvedReviews, getPublishedBySlug, publishedImages, ratingSummary } from "@/server/services/catalog";
import { reviewFormToken } from "@/server/services/reviews";
import { MODEL_SOURCE_LABEL, ModelSourceBadge, ProductImage, Stars, modelUrl } from "@/components/product-bits";
import { LazyProductViewer } from "@/components/three/lazy-viewer";
import { ReviewForm } from "@/components/reviews/review-form";
import { HelpfulButton } from "@/components/reviews/helpful-button";
import { TrackView } from "@/components/site/track-view";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const p = await getPublishedBySlug(slug);
  if (!p) return { title: "Shoe not found" };
  return { title: p.name, description: p.description ?? `${p.name} in interactive 3D.` };
}

export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <Product params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="aspect-square animate-pulse rounded-3xl bg-paper-2" />
      <div className="space-y-4">
        <div className="h-10 w-2/3 animate-pulse rounded bg-paper-2" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-paper-2" />
        <div className="h-24 animate-pulse rounded bg-paper-2" />
      </div>
    </div>
  );
}

async function Product({ params }: { params: PageProps<"/products/[slug]">["params"] }) {
  const { slug } = await params;
  const p = await getPublishedBySlug(slug);
  if (!p) notFound();
  const [images, summary, list] = await Promise.all([publishedImages(p.id), ratingSummary(p.id), approvedReviews(p.id)]);
  const category = CATEGORIES.find((c) => c.key === p.category)!;
  const poster = p.image ? (
    <ProductImage image={p.image} priority sizes="(min-width: 1024px) 55vw, 100vw" className="size-full object-contain p-10" />
  ) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <TrackView productId={p.id} />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 py-5 text-sm text-muted">
        <Link href={`/${p.category}`} className="hover:text-ink">
          {category.label}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="truncate text-ink">{p.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
        <div>
          <div className="aspect-[4/5] overflow-hidden rounded-3xl ring-1 ring-line sm:aspect-square">
            {p.model ? (
              <LazyProductViewer modelUrl={modelUrl(p.model.id)} productId={p.id} name={p.name} poster={poster} />
            ) : (
              <div className="studio size-full">{poster}</div>
            )}
          </div>
          {images.length > 0 && (
            <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Product photos">
              {images.map((img) => (
                <li key={img.id} className="studio aspect-square overflow-hidden rounded-xl ring-1 ring-line">
                  <a href={`/api/media/image/${img.id}/1200`} target="_blank" rel="noopener" aria-label={`Open photo: ${img.alt ?? p.name}`}>
                    <ProductImage image={{ id: img.id, variants: img.variants ?? [400], alt: img.alt ?? p.name }} sizes="120px" className="size-full object-contain p-1.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:pt-4">
          <p className="eyebrow">{[category.label, p.shoeType].filter(Boolean).join(" · ")}</p>
          <h1 className="font-display mt-2 text-4xl font-semibold sm:text-5xl">{p.name}</h1>
          <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm text-ink-2 hover:underline">
            <Stars value={summary.average} size="md" />
            {summary.count > 0 ? (
              <span>
                {summary.average.toFixed(1)} · {summary.count} review{summary.count === 1 ? "" : "s"}
              </span>
            ) : (
              <span>No reviews yet</span>
            )}
          </a>
          {p.description && <p className="mt-6 leading-relaxed text-ink-2">{p.description}</p>}
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-5 text-sm">
            {p.brand && (
              <>
                <dt className="text-muted">Brand</dt>
                <dd>{p.brand}</dd>
              </>
            )}
            <dt className="text-muted">Colour</dt>
            <dd>{p.color ?? "—"}</dd>
            <dt className="text-muted">Style</dt>
            <dd>{p.shoeType ?? "—"}</dd>
            <dt className="text-muted">Section</dt>
            <dd>{category.label}</dd>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/try-on?product=${p.slug}`} className="btn-primary px-6 py-3">
              <Camera className="size-4" /> Try it on
            </Link>
            <Link href={`/showroom/${p.category}`} className="btn-ghost px-6 py-3">
              See it in the showroom
            </Link>
          </div>
          {p.model && (
            <div className="mt-6 rounded-2xl bg-white p-4 text-xs leading-relaxed text-muted ring-1 ring-line">
              <ModelSourceBadge source={p.model.source} />
              <p className="mt-2">{MODEL_SOURCE_LABEL[p.model.source]?.detail}</p>
              {p.model.attribution && <p className="mt-1">Credit: {p.model.attribution}</p>}
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> Showroom only. Visit the store to try on and buy. Online orders are not available.
          </p>
        </div>
      </div>

      <section id="reviews" className="mt-20 scroll-mt-24" aria-labelledby="reviews-heading">
        <h2 id="reviews-heading" className="font-display text-3xl font-semibold">Reviews</h2>
        <div className="mt-8 grid gap-10 lg:grid-cols-[320px_1fr]">
          <div>
            <div className="card p-6">
              <p className="font-display text-5xl font-semibold tabular-nums">{summary.count ? summary.average.toFixed(1) : "–"}</p>
              <div className="mt-2">
                <Stars value={summary.average} size="lg" />
              </div>
              <p className="mt-1 text-sm text-muted">
                {summary.count} review{summary.count === 1 ? "" : "s"}
              </p>
              <ul className="mt-5 space-y-2" aria-label="Rating distribution">
                {([5, 4, 3, 2, 1] as const).map((star) => {
                  const n = summary.distribution[star];
                  const pct = summary.count ? (n / summary.count) * 100 : 0;
                  return (
                    <li key={star} className="flex items-center gap-3 text-xs">
                      <span className="w-10 text-ink-2">{star} star</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2">
                        <span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-6 text-right text-muted tabular-nums">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="mt-6">
              <ReviewForm productId={p.id} formToken={reviewFormToken(p.id)} />
            </div>
          </div>
          <div>
            {list.length === 0 ? (
              <p className="text-muted">No reviews yet. Be the first to share what you think.</p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((r) => (
                  <li key={r.id} className="py-6 first:pt-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Stars value={r.rating} />
                      <p className="font-medium">{r.displayName}</p>
                      <time className="text-xs text-muted" dateTime={r.createdAt.toISOString()}>
                        {r.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </time>
                    </div>
                    <p className="mt-2 leading-relaxed whitespace-pre-line text-ink-2">{r.body}</p>
                    <HelpfulButton reviewId={r.id} initialCount={r.helpfulCount} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
