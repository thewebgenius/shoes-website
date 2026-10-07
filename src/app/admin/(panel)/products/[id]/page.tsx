import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Circle, Eye } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { env } from "@/server/env";
import { aiProviders } from "@/server/ai/registry";
import { getProductForAdmin } from "@/server/services/product-admin";
import { SAMPLE_MODELS } from "@/server/services/sample-models";
import { ProductForm, type Suggestion } from "@/components/admin/product-form";
import { ModelUploader, RawImageUploader } from "@/components/admin/uploaders";
import { GenerateModelButton, ReprocessButton, SampleModelPicker, TransitionButton } from "@/components/admin/action-forms";
import { StatusBadge } from "@/components/admin/status-badge";
import { DoneBanner } from "@/components/admin/done-banner";
import { ModelSourceBadge, modelUrl } from "@/components/product-bits";
import { LazyProductViewer } from "@/components/three/lazy-viewer";
import { setPrimaryImageAction } from "@/app/admin/actions";

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireUser("products:read");
  const { id } = await params;
  const sp = await searchParams;
  const data = await getProductForAdmin(id);
  if (!data) notFound();
  const { product: p, images, models, jobs, primaryModel, readiness } = data;
  const providers = aiProviders();
  const raws = images.filter((i) => i.kind === "raw");
  const processed = images.filter((i) => i.kind === "processed");
  const lastEnhancement = jobs.find((j) => j.type === "image_enhancement");
  const steps = [
    { done: processed.length > 0, label: "Photo processed" },
    { done: p.metadataVerified, label: "Metadata verified" },
    { done: !!primaryModel, label: "3D model assigned" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
        ← Products
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={p.status} />
            <span className="capitalize">{p.category}</span>
            {p.status === "published" && (
              <Link href={`/products/${p.slug}`} className="underline" target="_blank">
                View live ↗
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/products/${p.id}/preview`} className="btn-ghost">
            <Eye className="size-4" /> Preview
          </Link>
          {["draft", "rejected", "unpublished"].includes(p.status) && <TransitionButton id={p.id} action="submit" label="Submit for approval" />}
          {p.status === "pending_review" && (
            <Link href={`/admin/products/${p.id}/preview`} className="btn-gold">
              Review &amp; approve <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>

      <DoneBanner done={sp.done} />
      {sp.created && <p className="mt-4 rounded-xl bg-success/10 px-4 py-2 text-sm text-success">Draft created. Upload a photo of the shoe below to continue.</p>}
      {p.status === "rejected" && p.rejectionReason && (
        <p className="mt-4 flex gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4 shrink-0" /> Rejected: {p.rejectionReason}
        </p>
      )}
      {p.status === "published" && (
        <p className="mt-4 rounded-xl bg-paper-2 px-4 py-2 text-sm text-ink-2">This shoe is live. Changes you save here are visible to customers immediately and recorded in the audit log.</p>
      )}

      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Readiness">
        {steps.map((s) => (
          <li key={s.label} className={`chip ${s.done ? "border-success/30 bg-success/10 text-success" : "border-line bg-white text-muted"}`}>
            {s.done ? <Check className="size-3" /> : <Circle className="size-3" />} {s.label}
          </li>
        ))}
      </ol>

      {/* 1. Photos */}
      <section id="photos" className={`card mt-6 scroll-mt-24 p-5 sm:p-6 ${processed.length === 0 ? "border-gold ring-2 ring-gold/25" : ""}`} aria-labelledby="photos">
        <h2 id="photos" className="text-lg font-semibold">
          1 · Product photo {processed.length === 0 && <span className="ml-1 text-sm font-normal text-gold">— start here</span>}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Raw photo → background removal → enhancement/upscaling → crop &amp; resize → product image. Processor: <strong>{providers.imageEnhancement.label}</strong>
          {providers.imageEnhancement.isMock && " (swap in a real AI provider via IMAGE_ENHANCEMENT_PROVIDER)"}.
        </p>
        <div className="mt-4">
          <RawImageUploader productId={p.id} maxMb={env().MAX_IMAGE_UPLOAD_MB} />
        </div>
        {lastEnhancement?.status === "failed" && (
          <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">Last processing attempt failed. The raw photo is kept; you can retry below.</p>
        )}
        {raws.length > 0 && (
          <ul className="mt-6 space-y-4">
            {raws.map((raw) => {
              const outs = processed.filter((i) => i.sourceImageId === raw.id);
              const job = jobs.find((j) => j.type === "image_enhancement" && j.inputImageId === raw.id);
              const result = job?.result as { steps?: Array<{ name: string; detail: string }>; warnings?: string[] } | null;
              return (
                <li key={raw.id} className="grid gap-3 rounded-2xl bg-paper p-3 sm:grid-cols-[1fr_1fr_1.2fr]">
                  <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/media/image/${raw.id}/raw`} alt="Raw upload" className="aspect-square w-full rounded-xl bg-white object-contain" />
                    <figcaption className="mt-1 text-xs text-muted">Raw (private)</figcaption>
                  </figure>
                  {outs.map((o) => (
                    <figure key={o.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/media/image/${o.id}/800`} alt="Processed product" className={`aspect-square w-full rounded-xl bg-white object-contain ${o.isPrimary ? "ring-2 ring-gold" : ""}`} />
                      <figcaption className="mt-1 flex items-center justify-between text-xs text-muted">
                        <span>{o.isPrimary ? "Primary image" : "Processed"}</span>
                        {!o.isPrimary && (
                          <form action={setPrimaryImageAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="imageId" value={o.id} />
                            <button className="font-medium text-gold hover:underline">Make primary</button>
                          </form>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                  {outs.length === 0 && <div className="flex aspect-square items-center justify-center rounded-xl bg-white text-xs text-muted">Not processed</div>}
                  <div className="text-xs text-ink-2">
                    <p className="font-semibold">
                      Pipeline {job ? `· ${job.status}` : ""} {job?.isMock && <span className="font-normal text-muted">(local, not AI)</span>}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {result?.steps?.map((s) => (
                        <li key={s.name}>
                          <span className="font-medium">{s.name}:</span> <span className="text-muted">{s.detail}</span>
                        </li>
                      ))}
                    </ul>
                    {result?.warnings?.map((w) => (
                      <p key={w} className="mt-1 text-warning">
                        ⚠ {w}
                      </p>
                    ))}
                    <div className="mt-2">
                      <ReprocessButton id={p.id} rawId={raw.id} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 2. Metadata */}
      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="meta">
        <h2 id="meta" className="text-lg font-semibold">
          2 · Enter &amp; verify details
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">AI may suggest values after the photo is processed. Edit anything, then confirm you’ve checked it.</p>
        <ProductForm
          mode="edit"
          suggestions={(p.aiSuggestions as Suggestion | null) ?? null}
          values={{
            id: p.id,
            name: p.name,
            category: p.category,
            gender: p.gender,
            shoeType: p.shoeType,
            brand: p.brand,
            color: p.color,
            description: p.description,
            metadataVerified: p.metadataVerified,
          }}
        />
      </section>

      {/* 3. 3D model */}
      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="model">
        <h2 id="model" className="text-lg font-semibold">
          3 · 3D model
        </h2>
        <p className="mt-1 text-sm text-muted">Upload the shoe’s GLB model, or assign a sample model while a scan is pending. Automatic photo-to-3D is a Phase 2 capability.</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <ModelUploader productId={p.id} maxMb={env().MAX_MODEL_UPLOAD_MB} />
            <SampleModelPicker id={p.id} samples={SAMPLE_MODELS} />
            <GenerateModelButton id={p.id} available={providers.threeD.available} reason={providers.threeD.unavailableReason} />
          </div>
          <div>
            {primaryModel ? (
              <>
                <div className="aspect-square overflow-hidden rounded-2xl ring-1 ring-line">
                  <LazyProductViewer key={primaryModel.id} modelUrl={modelUrl(primaryModel.id)} name={p.name} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <ModelSourceBadge source={primaryModel.source} />
                  <span>
                    {primaryModel.fileName} · {(primaryModel.bytes / 1024 / 1024).toFixed(1)} MB · {primaryModel.triangleCount?.toLocaleString()} triangles
                  </span>
                </div>
                {models.length > 1 && <p className="mt-1 text-xs text-muted">{models.length - 1} earlier model(s) kept for history.</p>}
              </>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-2xl bg-paper text-sm text-muted">No 3D model yet</div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Submit */}
      <section className="card mt-6 p-5 sm:p-6" aria-labelledby="submit">
        <h2 id="submit" className="text-lg font-semibold">
          4 · Preview &amp; approval
        </h2>
        {readiness.ready ? (
          <p className="mt-1 text-sm text-success">Everything needed is in place.</p>
        ) : (
          <p className="mt-1 text-sm text-muted">Still needed: {readiness.missing.join(", ")}.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/admin/products/${p.id}/preview`} className="btn-ghost">
            Open preview
          </Link>
          {["draft", "rejected", "unpublished"].includes(p.status) && <TransitionButton id={p.id} action="submit" label="Submit for approval" />}
          {p.status === "published" && <TransitionButton id={p.id} action="unpublish" label="Unpublish" variant="ghost" confirm="Hide this shoe from customers?" />}
          {p.status !== "archived" && <TransitionButton id={p.id} action="archive" label="Archive" variant="ghost" confirm="Archive this product? It will be hidden everywhere." />}
          {p.status === "archived" && <TransitionButton id={p.id} action="restore" label="Restore to draft" variant="ghost" />}
        </div>
      </section>

      <section className="mt-6 text-xs text-muted" aria-labelledby="jobs">
        <h2 id="jobs" className="font-semibold text-ink-2">
          AI processing history
        </h2>
        <ul className="mt-2 space-y-1">
          {jobs.map((j) => (
            <li key={j.id}>
              {j.createdAt.toLocaleString("en-GB")} · {j.type.replaceAll("_", " ")} · {j.status} · {j.provider}
              {j.error && <span className="text-danger"> · {j.error}</span>}
            </li>
          ))}
          {!jobs.length && <li>None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
