"use client";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">Something went wrong.</h1>
      <p className="mt-2 text-sm text-muted">The action didn’t complete. Nothing was published by mistake.</p>
      <button type="button" onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
