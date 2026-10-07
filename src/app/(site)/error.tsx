"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">Something went wrong.</h1>
      <p className="mt-3 text-muted">Please try again. If the problem continues, come back a little later.</p>
      <button type="button" onClick={reset} className="btn-primary mt-8">
        Try again
      </button>
    </div>
  );
}
