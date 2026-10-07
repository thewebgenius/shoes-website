"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, Lock, Search, Sparkles, Trash2 } from "lucide-react";
import { PhotoPicker } from "./photo-picker";
import { DEFAULT_PLACEMENT, PlaceShoe, type Placement } from "./place-shoe";

export type TryOnProduct = { id: string; slug: string; name: string; category: string; color: string | null; imageId: string | null };

type Result = { resultUrl: string; expiresAt: string; isMock: boolean; provider: string; label: string; sessionId: string };

export function TryOnLab({ products, initialSlug }: { products: TryOnProduct[]; initialSlug?: string }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [productId, setProductId] = useState<string | null>(() => products.find((p) => p.slug === initialSlug)?.id ?? null);
  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState(false);
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!result) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [result]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => `${p.name} ${p.color ?? ""} ${p.category}`.toLowerCase().includes(q)) : products;
  }, [products, query]);
  const selected = products.find((p) => p.id === productId) ?? null;

  const generate = async () => {
    if (!photo || !productId || !consent) return;
    setStatus("working");
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("photo", photo);
    fd.set("productId", productId);
    fd.set("consent", "yes");
    fd.set("placeX", String(placement.x));
    fd.set("placeY", String(placement.y));
    fd.set("placeScale", String(placement.scale));
    try {
      const res = await fetch("/api/try-on", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "We couldn't generate a preview. Please try again.");
      setResult({ ...data, resultUrl: `${data.resultUrl}?v=${Date.now()}` });
      setStatus("done");
      // The photo has been processed; drop the local copy too.
      setPhoto(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  const deleteNow = async () => {
    if (!result) return;
    await fetch(`/api/try-on/${result.sessionId}`, { method: "DELETE" }).catch(() => undefined);
    setResult(null);
    setStatus("idle");
  };

  const remaining = result ? Math.max(0, new Date(result.expiresAt).getTime() - now) : 0;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-8">
        <section aria-labelledby="step1">
          <h2 id="step1" className="mb-3 flex items-center gap-2 font-semibold">
            <Step n={1} done={!!photo || status === "done"} /> Upload your photo
          </h2>
          <PhotoPicker file={photo} onChange={setPhoto} captureMode="environment" hint="A full-length photo or a photo of your feet works best." />
        </section>

        <section aria-labelledby="step2">
          <h2 id="step2" className="mb-3 flex items-center gap-2 font-semibold">
            <Step n={2} done={!!selected} /> Choose a shoe
          </h2>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the catalogue" className="input pl-9" aria-label="Search shoes" />
          </div>
          <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4" role="listbox" aria-label="Shoes">
            {filtered.map((p) => (
              <li key={p.id} role="option" aria-selected={p.id === productId}>
                <button
                  type="button"
                  onClick={() => setProductId(p.id)}
                  className={`studio w-full rounded-xl p-1.5 text-left ring-1 transition ${p.id === productId ? "ring-2 ring-gold" : "ring-line hover:ring-ink/30"}`}
                >
                  {p.imageId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/image/${p.imageId}/400`} alt="" loading="lazy" className="aspect-square w-full object-contain" />
                  )}
                  <span className="mt-1 block truncate text-[11px] font-medium">{p.name}</span>
                </button>
              </li>
            ))}
            {!filtered.length && <li className="col-span-full py-6 text-center text-sm text-muted">No shoes match “{query}”.</li>}
          </ul>
        </section>

        {photo && selected && (
          <section aria-labelledby="step3" className="card p-5">
            <h2 id="step3" className="mb-3 flex items-center gap-2 font-semibold">
              <Step n={3} done={false} /> Place the shoe
            </h2>
            <PlaceShoe photo={photo} shoeImageId={selected.imageId} shoeName={selected.name} placement={placement} onChange={setPlacement} />
          </section>
        )}

        <section aria-labelledby="step4" className="card p-5">
          <h2 id="step4" className="mb-3 flex items-center gap-2 font-semibold">
            <Step n={4} done={status === "done"} /> Generate your preview
          </h2>
          <label className="flex items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--gold)]" />
            <span>
              I agree that my photo is processed only to create this preview. It is not stored, not shared publicly and not used for training, and is deleted right after
              processing. See the <Link href="/privacy#try-on" className="underline">privacy policy</Link>.
            </span>
          </label>
          <button type="button" className="btn-gold mt-4 w-full py-3" onClick={generate} disabled={!photo || !selected || !consent || status === "working"}>
            {status === "working" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating preview…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate try-on preview
              </>
            )}
          </button>
          {!photo && !result && <p className="mt-2 text-xs text-muted">Add a photo to continue.</p>}
          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
          <div className="flex aspect-[3/4] items-center justify-center bg-paper-2">
            {result ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, short-lived result served with no-store
              <img src={result.resultUrl} alt={`AI-generated visual preview wearing ${selected?.name ?? "the selected shoe"}`} className="size-full object-contain" />
            ) : status === "working" ? (
              <div className="flex flex-col items-center gap-3 text-sm text-muted" role="status">
                <Loader2 className="size-8 animate-spin text-gold" />
                Creating your preview…
              </div>
            ) : (
              <div className="max-w-xs p-6 text-center text-sm text-muted">Your AI-generated visual preview will appear here.</div>
            )}
          </div>
          {result && (
            <div className="space-y-3 border-t border-line p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-gold" /> {result.label}
              </p>
              {result.isMock && (
                <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
                  <AlertTriangle className="size-4 shrink-0" />
                  Development preview: no virtual try-on model is connected yet, so this is the catalogue photo overlaid where you placed it ({result.provider}). It does
                  not reshape the shoe to your foot. Connect a try-on service with TRYON_PROVIDER to replace it.
                </p>
              )}
              <p className="text-xs text-muted">This is a visual impression only. It does not predict size, fit or comfort.</p>
              <p className="flex items-center gap-2 text-xs text-muted">
                <Lock className="size-3.5" /> Private to this browser. Auto-deletes in {Math.floor(remaining / 60000)}:{String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={deleteNow} className="btn-ghost btn-sm">
                  <Trash2 className="size-3.5" /> Delete now
                </button>
                {selected && (
                  <Link href={`/products/${selected.slug}`} className="btn-primary btn-sm">
                    View {selected.name} in 3D
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={`flex size-6 items-center justify-center rounded-full text-xs ${done ? "bg-success text-white" : "bg-ink text-paper"}`}>
      {done ? <Check className="size-3.5" /> : n}
    </span>
  );
}
