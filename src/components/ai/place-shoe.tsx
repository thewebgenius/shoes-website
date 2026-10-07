"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Move } from "lucide-react";

export type Placement = { x: number; y: number; scale: number };

export const DEFAULT_PLACEMENT: Placement = { x: 0.5, y: 0.88, scale: 0.42 };

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Lets the customer say where the shoe goes before the preview is generated.
 * Without a try-on model that finds feet by itself, a fixed position lands the
 * shoe wherever the photo happens to be cropped, so the person placing it is
 * the one who knows where their feet are.
 */
export function PlaceShoe({
  photo,
  shoeImageId,
  shoeName,
  placement,
  onChange,
}: {
  photo: File;
  shoeImageId: string | null;
  shoeName: string;
  placement: Placement;
  onChange: (p: Placement) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const photoUrl = useMemo(() => URL.createObjectURL(photo), [photo]);

  useEffect(() => () => URL.revokeObjectURL(photoUrl), [photoUrl]);

  const moveTo = useCallback(
    (clientX: number, clientY: number) => {
      const box = frame.current?.getBoundingClientRect();
      if (!box) return;
      onChange({ ...placement, x: clamp((clientX - box.left) / box.width), y: clamp((clientY - box.top) / box.height) });
    },
    [onChange, placement],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      e.preventDefault();
      moveTo(e.clientX, e.clientY);
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, moveTo]);

  const nudge = (dx: number, dy: number) => onChange({ ...placement, x: clamp(placement.x + dx), y: clamp(placement.y + dy) });

  return (
    <div>
      <div
        ref={frame}
        className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl bg-paper-2 select-none"
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
          moveTo(e.clientX, e.clientY);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, never uploaded until Generate */}
        <img src={photoUrl} alt="Your photo" className="pointer-events-none size-full object-contain" draggable={false} />
        {shoeImageId && (
          <button
            type="button"
            aria-label={`Position of ${shoeName} on your photo. Use the arrow keys to move it.`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-lg ring-2 ring-gold/70 ${dragging ? "cursor-grabbing" : ""}`}
            style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.scale * 100}%` }}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.05 : 0.01;
              if (e.key === "ArrowLeft") nudge(-step, 0);
              else if (e.key === "ArrowRight") nudge(step, 0);
              else if (e.key === "ArrowUp") nudge(0, -step);
              else if (e.key === "ArrowDown") nudge(0, step);
              else return;
              e.preventDefault();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- published catalogue cutout */}
            <img src={`/api/media/image/${shoeImageId}/400`} alt="" className="pointer-events-none w-full" draggable={false} />
            <Move className="absolute -top-2 -right-2 size-5 rounded-full bg-gold p-1 text-white" aria-hidden />
          </button>
        )}
      </div>
      <label className="mt-3 block text-sm" htmlFor="shoe-size">
        Shoe size in the photo
      </label>
      <input
        id="shoe-size"
        type="range"
        min={10}
        max={90}
        step={1}
        value={Math.round(placement.scale * 100)}
        onChange={(e) => onChange({ ...placement, scale: Number(e.target.value) / 100 })}
        className="mt-1 w-full accent-[var(--gold)]"
      />
      <p className="mt-1 text-xs text-muted">Drag the shoe onto your feet and set its size, then generate the preview.</p>
    </div>
  );
}
