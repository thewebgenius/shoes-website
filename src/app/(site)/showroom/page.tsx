import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { CATEGORIES } from "@/config/site";
import { categoryCounts, listPublished } from "@/server/services/catalog";
import { ProductImage } from "@/components/product-bits";

export const metadata: Metadata = { title: "3D Showroom", description: "Walk through our men's, women's and kids' collections in interactive 3D." };

export default function ShowroomIndex() {
  return (
    <div className="bg-night text-paper">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="eyebrow">The 3D Showroom</p>
        <h1 className="font-display mt-3 max-w-3xl text-4xl font-semibold sm:text-6xl">Choose a gallery. Every shoe waits in its own glass case.</h1>
        <p className="mt-5 max-w-2xl text-paper/65">
          Each gallery loads real 3D models. Rotate the room, tap a case to bring a shoe forward, then open it to spin it 360° and zoom right in.
        </p>
        <Suspense fallback={<div className="mt-12 grid gap-5 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-96 animate-pulse rounded-3xl bg-white/5" />)}</div>}>
          <Galleries />
        </Suspense>
      </div>
    </div>
  );
}

async function Galleries() {
  await connection();
  const [counts, items] = await Promise.all([categoryCounts(), listPublished()]);
  return (
    <div className="mt-12 grid gap-5 md:grid-cols-3">
      {CATEGORIES.map((c) => {
        const picks = items.filter((p) => p.category === c.key).slice(0, 3);
        return (
          <Link key={c.key} href={`/showroom/${c.key}`} className="group relative overflow-hidden rounded-3xl bg-night-2 ring-1 ring-white/10 transition hover:ring-gold/60">
            <div className="relative flex h-64 items-end justify-center gap-2 bg-[radial-gradient(ellipse_at_50%_100%,rgba(169,131,75,0.35),transparent_65%)] px-4 pb-6">
              {picks.map((p, i) => (
                <div key={p.id} className={`w-1/3 rounded-xl bg-white/90 p-2 shadow-2xl transition duration-500 ${i === 1 ? "-translate-y-4 group-hover:-translate-y-6" : "group-hover:-translate-y-2"}`}>
                  <ProductImage image={p.image} sizes="15vw" className="aspect-square w-full object-contain" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between p-6">
              <div>
                <p className="font-display text-3xl font-semibold">{c.label}</p>
                <p className="mt-1 text-sm text-paper/60">{counts[c.key]} shoes on display</p>
              </div>
              <span className="flex size-11 items-center justify-center rounded-full bg-gold text-white transition group-hover:translate-x-1">
                <ArrowRight className="size-5" />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
