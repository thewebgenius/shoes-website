import Link from "next/link";
import { Box, Check, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { productStatus, type ProductStatus } from "@/server/db/schema";
import { listProductsForAdmin } from "@/server/services/product-admin";
import { StatusBadge, STATUS_LABEL } from "@/components/admin/status-badge";

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireUser("products:read");
  const sp = await searchParams;
  const status = (productStatus.enumValues as readonly string[]).includes(String(sp.status)) ? (sp.status as ProductStatus) : undefined;
  const rows = await listProductsForAdmin(status);
  const tabs: Array<[string, string]> = [["", "All active"], ...productStatus.enumValues.map((s) => [s, STATUS_LABEL[s]] as [string, string])];
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Products</h1>
        <Link href="/admin/products/new" className="btn-primary">
          <Plus className="size-4" /> Add shoe
        </Link>
      </div>
      <nav className="mt-5 flex gap-1 overflow-x-auto pb-1" aria-label="Filter by status">
        {tabs.map(([key, label]) => (
          <Link
            key={key || "all"}
            href={key ? `/admin/products?status=${key}` : "/admin/products"}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${(status ?? "") === key ? "bg-ink text-paper" : "bg-white text-ink-2 ring-1 ring-line"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-line">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">No products here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/products/${p.id}`} className="flex items-center gap-4 p-3 hover:bg-paper/60 sm:p-4">
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-paper-2">
                    {p.imageId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/image/${p.imageId}/400`} alt="" className="size-full object-contain" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted capitalize">
                      {p.category} · {p.color ?? "no colour"} · updated {p.updatedAt.toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
                    <span className={`flex items-center gap-1 ${p.hasModel ? "text-success" : ""}`}>
                      <Box className="size-3.5" /> {p.hasModel ? "3D" : "No 3D"}
                    </span>
                    <span className={`flex items-center gap-1 ${p.metadataVerified ? "text-success" : ""}`}>
                      <Check className="size-3.5" /> {p.metadataVerified ? "Verified" : "Unverified"}
                    </span>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
