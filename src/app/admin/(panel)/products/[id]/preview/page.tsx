import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, X } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { can } from "@/server/auth/rbac";
import { getProductForAdmin } from "@/server/services/product-admin";
import { RejectForm, TransitionButton } from "@/components/admin/action-forms";
import { StatusBadge } from "@/components/admin/status-badge";
import { DoneBanner } from "@/components/admin/done-banner";
import { ModelSourceBadge, ProductImage, modelUrl } from "@/components/product-bits";
import { LazyProductViewer } from "@/components/three/lazy-viewer";

export default async function PreviewPage({ params, searchParams }: PageProps<"/admin/products/[id]/preview">) {
  const user = await requireUser("products:read");
  const { id } = await params;
  const { done } = await searchParams;
  const data = await getProductForAdmin(id);
  if (!data) notFound();
  const { product: p, primaryImage, primaryModel, readiness } = data;
  const canPublish = can(user.role, "products:publish");

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/admin/products/${p.id}`} className="text-sm text-muted hover:text-ink">
        ← Back to editing
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Product preview</p>
          <h1 className="font-display text-3xl font-semibold">{p.name}</h1>
        </div>
        <StatusBadge status={p.status} />
      </div>
      <p className="mt-2 text-sm text-muted">This is exactly what customers will see once the shoe is approved. It is not public yet unless the status says Published.</p>
      <DoneBanner done={done} />
      {p.status === "rejected" && (
        <p role="status" className="mt-4 flex gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" /> Rejected{p.rejectionReason ? `: ${p.rejectionReason}` : ""}. The product stays hidden until it is fixed and approved.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden rounded-3xl ring-1 ring-line">
            {primaryModel ? (
              <LazyProductViewer modelUrl={modelUrl(primaryModel.id)} name={p.name} />
            ) : (
              <div className="flex size-full items-center justify-center bg-paper-2 text-sm text-danger">Missing 3D model</div>
            )}
          </div>
          {primaryModel && <ModelSourceBadge source={primaryModel.source} />}
        </div>
        <div className="space-y-4">
          <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-white ring-1 ring-line">
            {primaryImage ? (
              <ProductImage image={{ id: primaryImage.id, variants: primaryImage.variants ?? [800], alt: p.name }} className="size-full object-contain p-6" />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-danger">Missing product image</div>
            )}
          </div>
          {primaryImage?.sourceImageId && (
            <figure className="flex items-center gap-3 text-xs text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- private original, admin only */}
              <img src={`/api/media/image/${primaryImage.sourceImageId}/raw`} alt="Original photo" className="size-20 rounded-xl bg-white object-contain ring-1 ring-line" />
              <figcaption>Original photo (private). Compare it with the processed image above: same shoe, nothing missing, nothing extra.</figcaption>
            </figure>
          )}
          <dl className="card grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 p-5 text-sm">
            <dt className="text-muted">Category</dt>
            <dd className="capitalize">{p.category}</dd>
            <dt className="text-muted">Gender</dt>
            <dd className="capitalize">{p.gender}</dd>
            <dt className="text-muted">Shoe type</dt>
            <dd>{p.shoeType ?? "—"}</dd>
            <dt className="text-muted">Colour</dt>
            <dd>{p.color ?? "—"}</dd>
            <dt className="text-muted">Other colours</dt>
            <dd>{p.secondaryColors ?? "—"}</dd>
            <dt className="text-muted">Style</dt>
            <dd>{p.style ?? "—"}</dd>
            <dt className="text-muted">Brand</dt>
            <dd>{p.brand ?? "—"}</dd>
            <dt className="text-muted">Model</dt>
            <dd>{p.modelName ?? "—"}</dd>
            <dt className="text-muted">Status</dt>
            <dd>
              <StatusBadge status={p.status} />
            </dd>
            <dt className="text-muted">Metadata</dt>
            <dd className={p.metadataVerified ? "text-success" : "text-warning"}>{p.metadataVerified ? "Verified by staff" : "Not verified yet"}</dd>
            <dt className="text-muted">Description</dt>
            <dd className="leading-relaxed whitespace-pre-line">{p.description ?? "—"}</dd>
          </dl>
        </div>
      </div>

      <section className="card mt-6 p-5" aria-labelledby="checklist">
        <h2 id="checklist" className="font-semibold">
          Approval checklist
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {[
            ["Product image", !!primaryImage],
            ["3D model", !!primaryModel],
            ["Metadata verified", p.metadataVerified],
          ].map(([label, ok]) => (
            <li key={String(label)} className={`flex items-center gap-2 ${ok ? "text-success" : "text-danger"}`}>
              {ok ? <Check className="size-4" /> : <X className="size-4" />} {label}
            </li>
          ))}
        </ul>
        {!readiness.ready && (
          <p className="mt-3 flex gap-2 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" /> Can’t publish until: {readiness.missing.join(", ")}.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-start gap-2">
          <Link href={`/admin/products/${p.id}`} className="btn-ghost">
            Edit
          </Link>
          {p.status === "pending_review" && canPublish && (
            <>
              <TransitionButton id={p.id} action="approve" label="Approve" variant="gold" from="preview" />
              <RejectForm id={p.id} />
            </>
          )}
          {p.status === "approved" && canPublish && (
            <>
              <TransitionButton id={p.id} action="publish" label="Publish" variant="gold" from="preview" confirm="Publish this shoe? It will be visible to customers." />
              <RejectForm id={p.id} />
            </>
          )}
          {["draft", "rejected", "unpublished"].includes(p.status) && <TransitionButton id={p.id} action="submit" label="Submit for approval" from="preview" />}
          {p.status === "published" && (
            <Link href={`/products/${p.slug}`} target="_blank" className="btn-primary">
              View live page ↗
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
