import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight, Box, Camera, ScanSearch, Sparkles, Star } from "lucide-react";
import { CATEGORIES, site } from "@/config/site";
import { categoryCounts, listPublished } from "@/server/services/catalog";
import { ProductCard, ProductGridSkeleton, ProductImage } from "@/components/product-bits";

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-night text-paper">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgba(169,131,75,0.28),transparent_60%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pt-14 pb-16 sm:px-6 md:grid-cols-2 md:pt-20 md:pb-24">
          <div>
            <p className="eyebrow">Interactive 3D shoe showroom</p>
            <h1 className="font-display mt-4 text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">Turn every pair over in your hands before you visit.</h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-paper/70 sm:text-lg">{site.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/showroom" className="btn-gold px-6 py-3 text-base">
                Enter the 3D showroom <ArrowRight className="size-4" />
              </Link>
              <Link href="/find-my-shoe" className="btn border border-white/20 px-6 py-3 text-base text-paper hover:bg-white/10">
                Find a shoe from a photo
              </Link>
            </div>
          </div>
          <Suspense fallback={<div className="aspect-square rounded-3xl bg-white/5" />}>
            <HeroShoe />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="sections-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Shop by section</p>
            <h2 id="sections-heading" className="font-display mt-2 text-3xl font-semibold sm:text-4xl">Men, Women &amp; Kids</h2>
          </div>
          <Link href="/showroom" className="hidden text-sm font-medium underline-offset-4 hover:underline sm:block">
            View all in 3D
          </Link>
        </div>
        <Suspense fallback={<div className="mt-8 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-paper-2" />)}</div>}>
          <SectionTiles />
        </Suspense>
      </section>

      <section className="border-y border-line bg-white" aria-labelledby="how-heading">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="eyebrow">What you can do here</p>
          <h2 id="how-heading" className="font-display mt-2 max-w-2xl text-3xl font-semibold sm:text-4xl">A showroom that answers your questions before you ask them.</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Box, title: "Real 3D models", text: "Rotate a full 360°, zoom into the stitching, and view every pair inside its glass case.", href: "/showroom" },
              { icon: ScanSearch, title: "Find My Shoe", text: "Snap a photo of a shoe you like and we’ll show the most visually similar pairs we stock.", href: "/find-my-shoe" },
              { icon: Camera, title: "Try-On Lab", text: "Upload a photo and get an AI-generated visual preview. Your photo is deleted after processing.", href: "/try-on" },
              { icon: Star, title: "Honest reviews", text: "Ratings from real customers, checked by the store before they appear.", href: "/showroom" },
            ].map(({ icon: Icon, title, text, href }) => (
              <Link key={title} href={href} className="group rounded-2xl border border-line p-6 transition hover:border-ink/30 hover:shadow-sm">
                <Icon className="size-6 text-gold" aria-hidden />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium group-hover:gap-2">
                  Explore <ArrowRight className="size-3.5 transition-all" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="new-heading">
        <p className="eyebrow">Just in</p>
        <h2 id="new-heading" className="font-display mt-2 mb-8 text-3xl font-semibold sm:text-4xl">New in the showroom</h2>
        <Suspense fallback={<ProductGridSkeleton />}>
          <NewArrivals />
        </Suspense>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-gold-soft/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
            <p className="text-sm leading-relaxed text-ink-2">
              <strong className="text-ink">Honest AI.</strong> Try-on results are AI-generated visual previews, not size or fit predictions. Visual search shows
              visually similar shoes, not guaranteed identical models. We never use your photos for training.
            </p>
          </div>
          <Link href="/privacy" className="btn-ghost shrink-0">
            How we handle photos
          </Link>
        </div>
      </section>
    </>
  );
}

async function HeroShoe() {
  await connection();
  const items = await listPublished({ limit: 50 });
  const hero = items.find((p) => p.slug === "knit-runner-midnight") ?? items[0];
  if (!hero) return <div className="aspect-square rounded-3xl bg-white/5" />;
  return (
    <Link href={`/products/${hero.slug}`} className="group relative block">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-gradient-to-b from-white/10 to-white/0 ring-1 ring-white/10">
        <ProductImage image={hero.image} priority sizes="(min-width: 768px) 50vw, 100vw" className="size-full object-contain p-8 drop-shadow-2xl transition duration-700 group-hover:scale-105" />
      </div>
      <div className="absolute bottom-4 left-4 rounded-full bg-black/60 px-4 py-2 text-sm backdrop-blur">
        {hero.name} <span className="text-paper/60">· view in 3D</span>
      </div>
    </Link>
  );
}

async function SectionTiles() {
  await connection();
  const [counts, items] = await Promise.all([categoryCounts(), listPublished({ limit: 200 })]);
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      {CATEGORIES.map((c) => {
        const pick = items.find((p) => p.category === c.key);
        return (
          <Link key={c.key} href={`/${c.key}`} className="group relative overflow-hidden rounded-3xl bg-white ring-1 ring-line">
            <div className="aspect-[4/3]">
              {pick && <ProductImage image={pick.image} sizes="(min-width: 768px) 33vw, 100vw" className="size-full object-contain p-6 transition duration-500 group-hover:scale-105" />}
            </div>
            <div className="flex items-end justify-between border-t border-line p-5">
              <div>
                <p className="font-display text-2xl font-semibold">{c.label}</p>
                <p className="mt-1 text-sm text-muted">{c.blurb}</p>
              </div>
              <span className="text-sm text-muted tabular-nums">{counts[c.key]} styles</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

async function NewArrivals() {
  await connection();
  const items = await listPublished({ limit: 8, newest: true });
  if (!items.length) return <p className="text-muted">The showroom is being stocked. Check back soon.</p>;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}
