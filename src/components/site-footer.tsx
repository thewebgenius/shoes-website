import Link from "next/link";
import { site } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-night text-paper/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl text-paper">{site.name}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-paper/60">{site.tagline}</p>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-paper/50 uppercase">Explore</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/showroom" className="hover:text-paper">3D Showroom</Link></li>
            <li><Link href="/men" className="hover:text-paper">Men</Link></li>
            <li><Link href="/women" className="hover:text-paper">Women</Link></li>
            <li><Link href="/kids" className="hover:text-paper">Kids</Link></li>
            <li><Link href="/find-my-shoe" className="hover:text-paper">Find My Shoe</Link></li>
            <li><Link href="/try-on" className="hover:text-paper">Try-On Lab</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-paper/50 uppercase">Store</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/about" className="hover:text-paper">About &amp; visit us</Link></li>
            <li><Link href="/privacy" className="hover:text-paper">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-paper">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-paper/50 sm:flex-row sm:justify-between sm:px-6">
          <p>© 2026 {site.name}. Showroom only: browse in 3D, buy in store.</p>
          <p>AI features give visual previews and suggestions, not guarantees of fit or identity.</p>
        </div>
      </div>
    </footer>
  );
}
