import Link from "next/link";
import { Box, Star } from "lucide-react";

export function imageUrl(id: string, size: number) {
  return `/api/media/image/${id}/${size}`;
}

export function modelUrl(id: string) {
  return `/api/media/model/${id}`;
}

/** Responsive, lazy-loaded product image served from pre-generated WebP variants. */
export function ProductImage({
  image,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  className = "",
  priority = false,
}: {
  image: { id: string; variants: number[]; alt: string } | null;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  if (!image) {
    return <div className={`flex items-center justify-center bg-paper-2 text-xs text-muted ${className}`}>No image yet</div>;
  }
  const variants = image.variants.length ? image.variants : [800];
  const largest = Math.max(...variants);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- variants are pre-optimised WebP served by our media route
    <img
      src={imageUrl(image.id, variants.includes(800) ? 800 : largest)}
      srcSet={variants.map((v) => `${imageUrl(image.id, v)} ${v}w`).join(", ")}
      sizes={sizes}
      alt={image.alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      width={largest}
      height={largest}
      className={className}
    />
  );
}

export function Stars({ value, size = "sm", label }: { value: number; size?: "sm" | "md" | "lg"; label?: string }) {
  const px = size === "lg" ? "size-5" : size === "md" ? "size-4" : "size-3.5";
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className={`relative inline-block ${px}`} aria-hidden>
            <Star className={`absolute inset-0 ${px} text-line`} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${px} text-gold`} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export const MODEL_SOURCE_LABEL: Record<string, { label: string; detail: string }> = {
  admin_upload: { label: "Store-uploaded 3D model", detail: "A 3D model provided by the store." },
  sample_library: { label: "Studio sample 3D model", detail: "A sample 3D model representing this style, used while the store's own scan is pending." },
  ai_generated: { label: "AI-generated 3D model", detail: "Generated automatically from photos. Shape and details may differ from the real shoe." },
};

export function ModelSourceBadge({ source }: { source: string }) {
  const s = MODEL_SOURCE_LABEL[source] ?? MODEL_SOURCE_LABEL.admin_upload;
  return (
    <span className={`chip ${source === "ai_generated" ? "border-warning/40 bg-warning/10 text-warning" : "border-line bg-white text-ink-2"}`} title={s.detail}>
      <Box className="size-3" aria-hidden /> {s.label}
    </span>
  );
}

export type CardData = {
  slug: string;
  name: string;
  category: string;
  color: string | null;
  shoeType: string | null;
  image: { id: string; variants: number[]; alt: string } | null;
  model: { source: string } | null;
  rating: { average: number; count: number };
};

export function ProductCard({ p, priority = false }: { p: CardData; priority?: boolean }) {
  return (
    <Link href={`/products/${p.slug}`} className="group block" prefetch={false}>
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-line transition group-hover:ring-ink/30">
        <ProductImage image={p.image} priority={priority} className="size-full object-contain p-4 transition-transform duration-500 group-hover:scale-[1.04]" />
        {p.model && (
          <span className="absolute top-3 left-3 rounded-full bg-ink/85 px-2.5 py-1 text-[10px] font-semibold tracking-widest text-paper uppercase">3D</span>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name}</p>
          <p className="truncate text-sm text-muted">{[p.shoeType, p.color].filter(Boolean).join(" · ")}</p>
        </div>
        {p.rating.count > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-ink-2">
            <Stars value={p.rating.average} /> <span className="tabular-nums">{p.rating.average.toFixed(1)}</span>
          </span>
        )}
      </div>
    </Link>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-square animate-pulse rounded-2xl bg-paper-2" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-paper-2" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-paper-2" />
        </div>
      ))}
    </div>
  );
}
