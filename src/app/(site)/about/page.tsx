import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "About & Store", description: `Visit ${site.name}: address, opening hours and how our 3D showroom works.` };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="grid gap-8 border-b border-line py-12 md:grid-cols-2 md:py-16">
        <div>
          <p className="eyebrow">About {site.name}</p>
          <h1 className="font-display mt-2 text-4xl font-semibold sm:text-5xl">A shoe shop you can explore before you arrive.</h1>
        </div>
        <div className="space-y-4 leading-relaxed text-ink-2">
          <p>
            We built our showroom so you can inspect every pair the way you would in the shop: turn it over, look at the sole, get close to the stitching. Each shoe
            on this site is a real 3D model, shown in its own glass case.
          </p>
          <p>
            When you’ve found a favourite, come and try it on in person. This website is a showroom only. We don’t take online orders or payments.
          </p>
        </div>
      </header>

      <section className="grid gap-6 py-12 md:grid-cols-3" aria-labelledby="visit">
        <h2 id="visit" className="sr-only">Visit the store</h2>
        <div className="card p-6">
          <MapPin className="size-5 text-gold" aria-hidden />
          <p className="mt-3 font-semibold">Address</p>
          <p className="mt-1 text-sm text-muted">
            {site.store.address}
            <br />
            {site.store.city}
          </p>
        </div>
        <div className="card p-6">
          <Clock className="size-5 text-gold" aria-hidden />
          <p className="mt-3 font-semibold">Opening hours</p>
          <ul className="mt-1 space-y-1 text-sm text-muted">
            {site.store.hours.map((h) => (
              <li key={h.days} className="flex justify-between gap-4">
                <span>{h.days}</span>
                <span className="tabular-nums">{h.time}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <Phone className="size-5 text-gold" aria-hidden />
          <p className="mt-3 font-semibold">Contact</p>
          <p className="mt-1 text-sm text-muted">{site.store.phone}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Mail className="size-3.5" /> {site.store.email}
          </p>
        </div>
      </section>

      <section className="rounded-3xl bg-night p-8 text-paper sm:p-12" aria-labelledby="how">
        <h2 id="how" className="font-display text-3xl font-semibold">How our technology works, honestly</h2>
        <div className="mt-8 grid gap-8 text-sm leading-relaxed text-paper/75 md:grid-cols-3">
          <div>
            <p className="font-semibold text-paper">3D models</p>
            <p className="mt-2">
              Every model is labelled: <em>store-uploaded</em>, <em>studio sample</em> (a representative model while our own scan is pending) or{" "}
              <em>AI-generated</em>. We never present a flat photo as a 3D model.
            </p>
          </div>
          <div>
            <p className="font-semibold text-paper">Find My Shoe</p>
            <p className="mt-2">Visual search ranks our shoes by how similar they look to your photo. It doesn’t identify brands or check authenticity.</p>
          </div>
          <div>
            <p className="font-semibold text-paper">Try-On Lab</p>
            <p className="mt-2">
              Results are AI-generated visual previews. They don’t measure your feet or predict size or fit. Your photo is deleted after processing.{" "}
              <Link href="/privacy" className="underline">
                Read more
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
