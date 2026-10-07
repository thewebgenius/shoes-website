"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, Lock, RotateCcw, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { PhotoPicker } from "./photo-picker";
import { DEFAULT_PLACEMENT, PlaceShoe, type Placement } from "./place-shoe";

export type TryOnProduct = { id: string; slug: string; name: string; category: string; color: string | null; imageId: string | null };

/** What the server says about the configured try-on provider. Never contains keys or URLs. */
export type TryOnProviderInfo = { configured: boolean; kind: "ai" | "mock" | "algorithm" | "none"; label: string; usesPlacement: boolean };

export const TRYON_DISCLAIMER = "AI visual preview. Results may vary from the actual appearance and fit.";

type PhotoState =
  | { phase: "none" }
  | { phase: "uploading"; progress: number }
  | { phase: "analyzing" }
  | { phase: "ready"; url: string; expiresAt: string }
  | { phase: "error"; message: string };

type Preview = {
  sessionId: string;
  productId: string;
  productName: string;
  phase: "generating" | "retrying" | "completed" | "failed";
  error?: string;
  retryable?: boolean;
  resultUrl?: string;
  expiresAt?: string;
  isMock?: boolean;
};

const POLL_MS = 2000;

export function TryOnLab({ products, initialSlug, provider }: { products: TryOnProduct[]; initialSlug?: string; provider: TryOnProviderInfo }) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({ phase: "none" });
  const [productId, setProductId] = useState<string | null>(() => products.find((p) => p.slug === initialSlug)?.id ?? null);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const polls = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const selected = products.find((p) => p.id === productId) ?? null;
  const active = previews.find((p) => p.sessionId === activeId) ?? null;
  const busy = previews.some((p) => p.phase === "generating" || p.phase === "retrying");

  // Restore a photo uploaded earlier in this visit (e.g. after a reload).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/try-on/photo", { cache: "no-store" })
      // Always read the body so the request completes even on 404 (no photo yet).
      .then((r) => r.json().then((d) => (r.ok ? d : null), () => null))
      .then((d) => {
        if (!cancelled && d?.ok) setPhoto({ phase: "ready", url: `/api/try-on/photo/image?v=${d.photoId}`, expiresAt: d.expiresAt });
      })
      .catch(() => undefined);
    const timers = polls.current;
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (photo.phase !== "ready") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [photo.phase]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => `${p.name} ${p.color ?? ""} ${p.category}`.toLowerCase().includes(q)) : products;
  }, [products, query]);

  const upload = useCallback((f: File) => {
    setPhoto({ phase: "uploading", progress: 0 });
    const fd = new FormData();
    fd.set("photo", f);
    fd.set("consent", "yes");
    // XHR rather than fetch so the page can show real upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/try-on/photo");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && setPhoto({ phase: "uploading", progress: e.loaded / e.total });
    xhr.upload.onload = () => setPhoto({ phase: "analyzing" });
    xhr.onload = () => {
      const d = xhr.response ?? {};
      if (xhr.status >= 200 && xhr.status < 300 && d.ok) {
        setPhoto({ phase: "ready", url: `/api/try-on/photo/image?v=${d.photoId}`, expiresAt: d.expiresAt });
        setPreviews([]);
        setActiveId(null);
        setFile(null);
      } else setPhoto({ phase: "error", message: d.error ?? "Upload failed. Please try again." });
    };
    xhr.onerror = () => setPhoto({ phase: "error", message: "Network error during upload. Please try again." });
    xhr.send(fd);
  }, []);

  const update = (sessionId: string, patch: Partial<Preview>) => setPreviews((list) => list.map((p) => (p.sessionId === sessionId ? { ...p, ...patch } : p)));

  const poll = useCallback((sessionId: string) => {
    const tick = async () => {
      polls.current.delete(sessionId);
      try {
        const r = await fetch(`/api/try-on/${sessionId}/status`, { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.status === "gone") {
          update(sessionId, { phase: "failed", error: d.error ?? "This preview has expired.", retryable: true });
          return;
        }
        if (d.status === "completed") {
          update(sessionId, { phase: "completed", resultUrl: `/api/try-on/${sessionId}?v=${Date.now()}`, expiresAt: d.expiresAt, isMock: d.isMock });
          return;
        }
        if (d.status === "failed") {
          update(sessionId, { phase: "failed", error: d.error, retryable: d.retryable });
          return;
        }
        update(sessionId, { phase: d.status === "retrying" ? "retrying" : "generating" });
      } catch {
        // Network blip: keep polling.
      }
      polls.current.set(sessionId, setTimeout(tick, POLL_MS));
    };
    polls.current.set(sessionId, setTimeout(tick, POLL_MS));
  }, []);

  const generate = async (product: TryOnProduct | null = selected) => {
    if (!product || photo.phase !== "ready" || !provider.configured) return;
    setRequestError(null);
    const res = await fetch("/api/try-on", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: product.id, placement: provider.usesPlacement ? placement : undefined }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !d.ok) {
      if (res?.status === 410) setPhoto({ phase: "none" });
      setRequestError(d.error ?? "We couldn't start the preview. Please try again.");
      return;
    }
    setPreviews((list) => [
      { sessionId: d.sessionId, productId: product.id, productName: product.name, phase: "generating" },
      ...list.filter((p) => p.sessionId !== d.sessionId),
    ]);
    setActiveId(d.sessionId);
    poll(d.sessionId);
  };

  const deletePhoto = async () => {
    polls.current.forEach((t) => clearTimeout(t));
    polls.current.clear();
    await fetch("/api/try-on/photo", { method: "DELETE" }).catch(() => undefined);
    setPhoto({ phase: "none" });
    setPreviews([]);
    setActiveId(null);
  };

  const remaining = photo.phase === "ready" ? Math.max(0, new Date(photo.expiresAt).getTime() - now) : 0;
  const photoBusy = photo.phase === "uploading" || photo.phase === "analyzing";

  if (!provider.configured) {
    return (
      <div className="card flex gap-3 p-6 text-sm" role="status">
        <AlertTriangle className="size-5 shrink-0 text-warning" />
        <div>
          <p className="font-semibold">AI provider not configured</p>
          <p className="mt-1 text-muted">Virtual try-on isn’t available yet. You can still explore every shoe in 3D in the showroom.</p>
          <Link href="/showroom" className="btn-primary btn-sm mt-3">
            Open the showroom
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-8">
        {provider.kind === "mock" && (
          <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning" role="note">
            <AlertTriangle className="size-4 shrink-0" />
            Development mock (not AI): no try-on model is connected, so previews are the catalogue photo overlaid where you place it.
          </p>
        )}

        <section aria-labelledby="step1">
          <h2 id="step1" className="mb-3 flex items-center gap-2 font-semibold">
            <Step n={1} done={photo.phase === "ready"} /> Your photo
          </h2>
          {photo.phase === "ready" ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl bg-paper-2 ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- the visitor's own private photo */}
                <img src={photo.url} alt="Your uploaded photo" className="max-h-80 w-full object-contain" />
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3.5" /> Saved privately for this visit. Auto-deletes in {Math.floor(remaining / 60000)}:
                  {String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}.
                </span>
                <button type="button" onClick={deletePhoto} className="font-medium text-danger hover:underline">
                  <Trash2 className="mr-1 inline size-3.5" />
                  Delete my photo now
                </button>
              </p>
              <p className="text-xs text-muted">Pick any shoe below to try it on. You don’t need to upload again.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <PhotoPicker file={file} onChange={setFile} captureMode="environment" hint="Your feet must be in the photo: feet only, lower body or full body. A waist-up selfie cannot show shoes." />
              <label className="flex items-start gap-3 text-sm text-ink-2">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 accent-[var(--gold)]" />
                <span>
                  I agree that my photo is stored privately for this visit only, sent securely to our try-on provider to create previews, never used for training, and
                  deleted automatically. See the{" "}
                  <Link href="/privacy#try-on" className="underline">
                    privacy policy
                  </Link>
                  .
                </span>
              </label>
              <button type="button" className="btn-primary w-full" disabled={!file || !consent || photoBusy} onClick={() => file && upload(file)}>
                {photo.phase === "uploading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Uploading… {Math.round(photo.progress * 100)}%
                  </>
                ) : photo.phase === "analyzing" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Analyzing image…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" /> Use this photo
                  </>
                )}
              </button>
              {photo.phase === "error" && (
                <p className="text-sm text-danger" role="alert">
                  {photo.message}
                </p>
              )}
            </div>
          )}
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

        {provider.usesPlacement && photo.phase === "ready" && selected && (
          <section aria-labelledby="place" className="card p-5">
            <h2 id="place" className="mb-3 flex items-center gap-2 font-semibold">
              Place the shoe <span className="text-xs font-normal text-muted">(development mock only)</span>
            </h2>
            <PlaceShoe photoUrl={photo.url} shoeImageId={selected.imageId} shoeName={selected.name} placement={placement} onChange={setPlacement} />
          </section>
        )}

        <section aria-labelledby="step3" className="card p-5">
          <h2 id="step3" className="mb-3 flex items-center gap-2 font-semibold">
            <Step n={3} done={active?.phase === "completed"} /> Generate your preview
          </h2>
          <button type="button" className="btn-gold w-full py-3" onClick={() => generate()} disabled={photo.phase !== "ready" || !selected || busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating try-on…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate try-on preview
              </>
            )}
          </button>
          {photo.phase !== "ready" && <p className="mt-2 text-xs text-muted">Add your photo to continue.</p>}
          {requestError && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {requestError}
            </p>
          )}
        </section>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
          <div className="flex aspect-[3/4] items-center justify-center bg-paper-2">
            {active?.phase === "completed" && active.resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, short-lived result served with no-store
              <img src={active.resultUrl} alt={`AI visual preview wearing ${active.productName}`} className="size-full object-contain" />
            ) : active && (active.phase === "generating" || active.phase === "retrying") ? (
              <div className="flex flex-col items-center gap-3 px-6 text-center text-sm text-muted" role="status">
                <Loader2 className="size-8 animate-spin text-gold" />
                <span className="font-medium text-ink">Generating try-on…</span>
                {active.phase === "retrying" && <span>The provider was busy, retrying automatically.</span>}
              </div>
            ) : active?.phase === "failed" ? (
              <div className="max-w-xs space-y-3 p-6 text-center text-sm" role="alert">
                <AlertTriangle className="mx-auto size-7 text-danger" />
                <p className="font-semibold text-danger">Failed</p>
                <p className="text-muted">{active.error}</p>
                {active.retryable !== false && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => generate(products.find((p) => p.id === active.productId) ?? null)}>
                    <RotateCcw className="size-3.5" /> Retry
                  </button>
                )}
              </div>
            ) : (
              <div className="max-w-xs p-6 text-center text-sm text-muted">Your AI visual preview will appear here.</div>
            )}
          </div>
          {active?.phase === "completed" && (
            <div className="space-y-3 border-t border-line p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Check className="size-4 text-success" /> Completed · {active.productName}
              </p>
              {active.isMock ? (
                <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
                  <AlertTriangle className="size-4 shrink-0" /> Development mock (not AI): the catalogue photo overlaid where you placed it.
                </p>
              ) : null}
              <p className="text-xs text-ink-2" data-testid="tryon-disclaimer">
                {TRYON_DISCLAIMER}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/products/${products.find((p) => p.id === active.productId)?.slug ?? ""}`} className="btn-primary btn-sm">
                  View {active.productName} in 3D
                </Link>
              </div>
            </div>
          )}
        </div>
        {previews.length > 1 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted">Your previews this visit</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {previews.map((p) => (
                <li key={p.sessionId}>
                  <button
                    type="button"
                    onClick={() => setActiveId(p.sessionId)}
                    className={`chip ${p.sessionId === activeId ? "border-gold bg-gold-soft/40" : "border-line bg-white"}`}
                  >
                    {p.productName} · {p.phase === "completed" ? "ready" : p.phase === "failed" ? "failed" : "generating"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
