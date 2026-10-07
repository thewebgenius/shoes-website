"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Box, Camera, Check, Loader2, ScanSearch } from "lucide-react";
import { PhotoPicker } from "./photo-picker";

type Match = {
  rank: number;
  similarity: number;
  id: string;
  slug: string;
  name: string;
  category: string;
  color: string | null;
  shoeType: string | null;
  image: { id: string; variants: number[]; alt: string } | null;
  rating: { average: number; count: number };
  hasModel: boolean;
};

const STAGES = ["Detecting and cropping the shoe", "Describing its shape and colour", "Searching the catalogue"];

function strength(rel: number) {
  if (rel >= 0.97) return "Closest match";
  if (rel >= 0.85) return "Strong resemblance";
  if (rel >= 0.7) return "Some resemblance";
  return "Loose resemblance";
}

export function FindMyShoe() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [stage, setStage] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "working") return;
    const t = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 700);
    return () => clearInterval(t);
  }, [status]);

  const search = async () => {
    if (!photo) return;
    setStage(0);
    setStatus("working");
    setError(null);
    const fd = new FormData();
    fd.set("photo", photo);
    try {
      const res = await fetch("/api/visual-search", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Search failed. Please try another photo.");
      setMatches(data.matches);
      setIsMock(!!data.isMock);
      setStatus("done");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  const best = matches[0]?.similarity || 1;

  return (
    <div className="grid gap-10 lg:grid-cols-[380px_1fr]">
      <div className="space-y-4">
        <PhotoPicker file={photo} onChange={(f) => { setPhoto(f); setStatus("idle"); setMatches([]); }} hint="Photograph one shoe from the side, on a plain background if you can." />
        <button type="button" className="btn-gold w-full py-3" onClick={search} disabled={!photo || status === "working"}>
          {status === "working" ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
          {status === "working" ? "Searching…" : "Find visually similar shoes"}
        </button>
        {status === "working" && (
          <ol className="space-y-2 rounded-2xl bg-white p-4 text-sm ring-1 ring-line" aria-live="polite">
            {STAGES.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 ${i <= stage ? "text-ink" : "text-muted"}`}>
                {i < stage ? <Check className="size-4 text-success" /> : i === stage ? <Loader2 className="size-4 animate-spin text-gold" /> : <span className="size-4" />}
                {s}
              </li>
            ))}
          </ol>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted">
          Your photo is analysed in memory and not stored. Results show <strong>visually similar shoes</strong> from our catalogue. They are not an exact brand or model
          identification and not an authenticity check.
        </p>
      </div>

      <div aria-live="polite">
        {status === "done" && (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-2xl font-semibold">Visually similar shoes</h2>
              <p className="text-xs text-muted">Ranked by visual similarity · top {matches.length}</p>
            </div>
            {isMock && (
              <p className="mb-5 flex gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning">
                <AlertTriangle className="size-4 shrink-0" /> Development search: matching uses local colour and shape features, not an AI vision model yet.
              </p>
            )}
            {matches.length === 0 ? (
              <p className="text-muted">We couldn’t find anything similar in the catalogue.</p>
            ) : (
              <ol className="space-y-3">
                {matches.map((m) => {
                  const rel = m.similarity / best;
                  return (
                    <li key={m.id} className="flex gap-4 rounded-2xl bg-white p-3 ring-1 ring-line sm:items-center">
                      <span className="hidden w-6 text-center font-display text-lg text-muted sm:block">{m.rank}</span>
                      <Link href={`/products/${m.slug}`} className="size-24 shrink-0 overflow-hidden rounded-xl bg-paper-2 sm:size-28">
                        {m.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/media/image/${m.image.id}/400`} alt={m.image.alt} className="size-full object-contain p-1" />
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold tracking-wider text-gold uppercase">{strength(rel)}</p>
                        <Link href={`/products/${m.slug}`} className="block truncate font-semibold hover:underline">
                          {m.name}
                        </Link>
                        <p className="truncate text-sm text-muted">{[m.shoeType, m.color].filter(Boolean).join(" · ")}</p>
                        <div className="mt-2 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-paper-2" title="Relative visual similarity (ranking signal, not a probability)">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(8, rel * 100)}%` }} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link href={`/products/${m.slug}`} className="btn-ghost btn-sm">
                            <Box className="size-3.5" /> {m.hasModel ? "View in 3D" : "View"}
                          </Link>
                          <Link href={`/try-on?product=${m.slug}`} className="btn-primary btn-sm">
                            <Camera className="size-3.5" /> Try it on
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="mt-4 text-xs text-muted">The bar shows how close each result is compared with the top result. It is a ranking signal, not a percentage chance of a match.</p>
          </>
        )}
        {status !== "done" && (
          <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Your matches will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
