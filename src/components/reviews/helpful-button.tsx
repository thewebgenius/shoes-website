"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";

export function HelpfulButton({ reviewId, initialCount }: { reviewId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const vote = async () => {
    if (voted || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/helpful`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCount(data.helpfulCount ?? count);
        setVoted(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={vote}
      disabled={voted || busy}
      aria-pressed={voted}
      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink-2 transition hover:bg-white disabled:opacity-70"
    >
      <ThumbsUp className="size-3.5" aria-hidden /> {voted ? "Thanks!" : "Helpful"} {count > 0 && <span className="tabular-nums">({count})</span>}
    </button>
  );
}
