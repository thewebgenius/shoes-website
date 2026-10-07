import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { connection } from "next/server";
import { listPublished } from "@/server/services/catalog";
import { aiProviders } from "@/server/ai/registry";
import { TRYON_DISCLAIMER, TryOnLab } from "@/components/ai/try-on-lab";

export const metadata: Metadata = {
  title: "Try-On Lab",
  description: "Upload a photo and see an AI visual preview of a shoe on you. Your photo is kept privately for your visit and then deleted.",
};

export default function TryOnPage({ searchParams }: PageProps<"/try-on">) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="border-b border-line py-10 sm:py-14">
        <p className="eyebrow">Try-On Lab</p>
        <h1 className="font-display mt-2 text-4xl font-semibold sm:text-5xl">See a pair on you, in seconds.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Upload a photo once, then try on as many shoes as you like. Each result is an <strong className="text-ink">AI visual preview</strong>: an impression of the
          look, not a size, fit or comfort prediction.
        </p>
        <p className="mt-2 text-sm text-ink-2">{TRYON_DISCLAIMER}</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-ink-2 ring-1 ring-line">
          <ShieldCheck className="size-4 text-success" /> Your photo is private, never used for training, and deleted automatically after your visit.
        </p>
      </header>
      <div className="py-10">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-paper-2" />}>
          <Lab searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Lab({ searchParams }: { searchParams: PageProps<"/try-on">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const slug = typeof sp.product === "string" ? sp.product.slice(0, 120) : undefined;
  const items = await listPublished();
  const products = items
    .filter((p) => p.image)
    .map((p) => ({ id: p.id, slug: p.slug, name: p.name, category: p.category, color: p.color, imageId: p.image?.id ?? null }));
  const p = aiProviders().tryOn;
  return <TryOnLab products={products} initialSlug={slug} provider={{ configured: p.configured, kind: p.kind, label: p.label, usesPlacement: p.usesPlacement }} />;
}
