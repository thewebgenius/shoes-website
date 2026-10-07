import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-display mt-2 text-4xl font-semibold">We couldn’t find that page.</h1>
      <p className="mt-3 text-muted">The shoe may have been moved or is no longer on display.</p>
      <Link href="/showroom" className="btn-primary mt-8">
        Back to the showroom
      </Link>
    </div>
  );
}
