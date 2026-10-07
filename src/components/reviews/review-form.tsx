"use client";

import { useState } from "react";
import { Star } from "lucide-react";

type Errors = Partial<Record<"rating" | "displayName" | "body" | "form", string>>;

export function ReviewForm({ productId, formToken }: { productId: string; formToken: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      productId,
      rating,
      displayName: String(form.get("displayName") ?? ""),
      body: String(form.get("body") ?? ""),
      website: String(form.get("website") ?? ""),
      formToken,
    };
    const local: Errors = {};
    if (!rating) local.rating = "Choose a star rating";
    if (payload.displayName.trim().length < 2) local.displayName = "Please enter a display name";
    if (payload.body.trim().length < 10) local.body = "Please write at least 10 characters";
    setErrors(local);
    if (Object.keys(local).length) return;
    setState("sending");
    try {
      const res = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrors({ ...(data.fieldErrors ?? {}), form: data.error ?? "Something went wrong. Please try again." });
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setErrors({ form: "Network error. Please try again." });
      setState("idle");
    }
  };

  if (state === "done") {
    return (
      <div className="card p-6" role="status">
        <p className="font-semibold">Thank you for your review!</p>
        <p className="mt-1 text-sm text-muted">It will appear here once the store has checked it. This usually takes less than a day.</p>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
      <p className="font-semibold">Write a review</p>
      <fieldset>
        <legend className="label">Your rating</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="rounded p-0.5"
            >
              <Star className={`size-7 ${n <= shown ? "text-gold" : "text-line"}`} fill="currentColor" strokeWidth={0} />
            </button>
          ))}
        </div>
        {errors.rating && <p className="mt-1 text-xs text-danger">{errors.rating}</p>}
      </fieldset>
      <div>
        <label htmlFor="displayName" className="label">
          Display name
        </label>
        <input id="displayName" name="displayName" className="input" maxLength={40} autoComplete="nickname" aria-invalid={!!errors.displayName} />
        {errors.displayName && <p className="mt-1 text-xs text-danger">{errors.displayName}</p>}
      </div>
      <div>
        <label htmlFor="body" className="label">
          Your review
        </label>
        <textarea id="body" name="body" className="input min-h-28" maxLength={2000} aria-invalid={!!errors.body} />
        {errors.body && <p className="mt-1 text-xs text-danger">{errors.body}</p>}
      </div>
      {/* Honeypot: hidden from people, often filled by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {errors.form && <p className="text-sm text-danger" role="alert">{errors.form}</p>}
      <button type="submit" className="btn-primary w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Submit review"}
      </button>
      <p className="text-xs text-muted">Reviews are checked by the store before they appear. Please don’t include personal details.</p>
    </form>
  );
}
