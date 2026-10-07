"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageUp, X } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/** File picker with a "take photo" option on mobile and a local preview. Nothing is uploaded until the parent submits. */
export function PhotoPicker({
  file,
  onChange,
  maxMb = 10,
  captureMode = "environment",
  hint,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  maxMb?: number;
  captureMode?: "user" | "environment";
  hint?: string;
}) {
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const accept = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) return setError("Please choose a photo (JPEG, PNG, WebP or HEIC).");
    if (f.size > maxMb * 1024 * 1024) return setError(`That photo is larger than ${maxMb} MB.`);
    onChange(f);
  };

  return (
    <div>
      {preview ? (
        <div className="relative overflow-hidden rounded-2xl bg-paper-2 ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img src={preview} alt="Your selected photo" className="max-h-80 w-full object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-white/95 shadow ring-1 ring-line"
            aria-label="Remove photo"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-gold bg-gold-soft/40" : "border-line bg-white"}`}
        >
          <ImageUp className="size-8 text-muted" aria-hidden />
          <p className="text-sm text-ink-2">{hint ?? "Drop a photo here, or choose one below."}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => pickRef.current?.click()}>
              <ImageUp className="size-4" /> Choose photo
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => camRef.current?.click()}>
              <Camera className="size-4" /> Take photo
            </button>
          </div>
          <p className="text-xs text-muted">JPEG, PNG, WebP or HEIC · up to {maxMb} MB</p>
        </div>
      )}
      <input ref={pickRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => accept(e.target.files?.[0])} aria-label="Choose photo" />
      <input ref={camRef} type="file" accept="image/*" capture={captureMode} className="sr-only" tabIndex={-1} onChange={(e) => accept(e.target.files?.[0])} aria-label="Take photo" />
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
