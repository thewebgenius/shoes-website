import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Box } from "lucide-react";
import { CATEGORIES, type CategoryKey } from "@/config/site";
import { listPublished } from "@/server/services/catalog";
import { ProductCard, ProductGridSkeleton } from "@/components/product-bits";

export function CategoryPage({ category }: { category: CategoryKey }) {
  const meta = CATEGORIES.find((c) => c.key === category)!;
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="flex flex-col gap-6 border-b border-line py-10 sm:flex-row sm:items-end sm:justify-between sm:py-14">
        <div>
          <p className="eyebrow">The {meta.label.toLowerCase()} collection</p>
          <h1 className="font-display mt-2 text-4xl font-semibold sm:text-5xl">{meta.label}</h1>
          <p className="mt-3 max-w-xl text-muted">{meta.blurb} Every pair can be explored as a real 3D model.</p>
        </div>
        <Link href={`/showroom/${category}`} className="btn-primary self-start sm:self-auto">
          <Box className="size-4" /> View {meta.label.toLowerCase()} in the 3D showroom
        </Link>
      </div>
      <div className="py-10">
        <Suspense fallback={<ProductGridSkeleton />}>
          <Grid category={category} />
        </Suspense>
      </div>
    </div>
  );
}

async function Grid({ category }: { category: CategoryKey }) {
  await connection();
  const items = await listPublished({ category });
  if (!items.length) return <p className="py-16 text-center text-muted">No shoes in this section yet.</p>;
  return (
    <>
      <p className="mb-6 text-sm text-muted">{items.length} styles</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4">
        {items.map((p, i) => (
          <ProductCard key={p.id} p={p} priority={i < 4} />
        ))}
      </div>
    </>
  );
}
