import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CATEGORIES, isCategory } from "@/config/site";
import { listPublished } from "@/server/services/catalog";
import { ProductCard, modelUrl } from "@/components/product-bits";
import { LazyShowroom } from "@/components/three/lazy-showroom";

export async function generateMetadata({ params }: PageProps<"/showroom/[category]">) {
  const { category } = await params;
  const c = CATEGORIES.find((x) => x.key === category);
  return { title: c ? `${c.label} · 3D Showroom` : "3D Showroom" };
}

export default function ShowroomCategoryPage({ params }: PageProps<"/showroom/[category]">) {
  return (
    <div className="bg-night text-paper">
      <Suspense fallback={<div className="h-[78svh] min-h-[460px] animate-pulse bg-night-2" />}>
        <Gallery params={params} />
      </Suspense>
    </div>
  );
}

async function Gallery({ params }: { params: PageProps<"/showroom/[category]">["params"] }) {
  const { category } = await params;
  if (!isCategory(category)) notFound();
  const meta = CATEGORIES.find((c) => c.key === category)!;
  const items = await listPublished({ category });
  const withModels = items.filter((p) => p.model);
  return (
    <>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pt-6 pb-4 sm:px-6">
        <div>
          <p className="eyebrow">3D Showroom</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{meta.label}</h1>
        </div>
        <nav aria-label="Showroom galleries" className="flex gap-1 rounded-full bg-white/5 p-1">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              href={`/showroom/${c.key}`}
              aria-current={c.key === category ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm transition ${c.key === category ? "bg-gold text-white" : "text-paper/70 hover:text-paper"}`}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      </div>
      <section aria-label={`${meta.label} 3D gallery`} className="h-[72svh] min-h-[460px] w-full sm:h-[78svh]">
        {withModels.length ? (
          <LazyShowroom
            title={`${meta.label} gallery`}
            items={withModels.map((p) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              modelUrl: modelUrl(p.model!.id),
              subtitle: [p.shoeType, p.color].filter(Boolean).join(" · "),
              rating: p.rating,
              modelSource: p.model!.source,
            }))}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-paper/60">No shoes on display in this gallery yet.</div>
        )}
      </section>
      <div className="bg-paper text-ink">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <h2 className="font-display mb-6 text-2xl font-semibold">Everything in this gallery</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
