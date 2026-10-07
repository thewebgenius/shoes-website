"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { site } from "@/config/site";

const NAV = [
  { href: "/showroom", label: "3D Showroom" },
  { href: "/men", label: "Men" },
  { href: "/women", label: "Women" },
  { href: "/kids", label: "Kids" },
  { href: "/find-my-shoe", label: "Find My Shoe" },
  { href: "/try-on", label: "Try-On Lab" },
  { href: "/about", label: "Store" },
];

function DesktopNav({ pathname }: { pathname: string | null }) {
  return (
    <>
      {NAV.map((n) => {
        const active = !!pathname && (pathname === n.href || pathname.startsWith(n.href + "/"));
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-2 text-sm transition-colors ${active ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

function ActiveDesktopNav() {
  return <DesktopNav pathname={usePathname()} />;
}

function CloseOnNavigate({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  useEffect(() => onNavigate(), [pathname, onNavigate]);
  return null;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const closeMenu = useCallback(() => setOpen(false), []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-display text-2xl font-semibold tracking-tight" aria-label={`${site.name} home`}>
          {site.name}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <Suspense fallback={<DesktopNav pathname={null} />}>
            <ActiveDesktopNav />
          </Suspense>
        </nav>
        <button
          type="button"
          className="-mr-2 rounded-full p-2 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      <Suspense fallback={null}>
        <CloseOnNavigate onNavigate={closeMenu} />
      </Suspense>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-paper px-4 pt-4 pb-10 lg:hidden">
          <ul className="divide-y divide-line">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="font-display block py-4 text-2xl">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
