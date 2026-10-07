import Link from "next/link";
import { Suspense } from "react";
import { BarChart3, ClipboardList, LogOut, MessageSquare, Package, ScrollText } from "lucide-react";
import { site } from "@/config/site";
import { requireUser } from "@/server/auth/dal";
import { can } from "@/server/auth/rbac";
import { logoutAction } from "../actions";

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = [
    { href: "/admin", label: "Dashboard", icon: BarChart3 },
    { href: "/admin/products", label: "Products", icon: Package },
    { href: "/admin/products?status=pending_review", label: "Approvals", icon: ClipboardList },
    { href: "/admin/reviews", label: "Reviews", icon: MessageSquare },
    ...(can(user.role, "audit:read") ? [{ href: "/admin/audit", label: "Audit log", icon: ScrollText }] : []),
  ];
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="border-b border-line bg-night text-paper md:sticky md:top-0 md:h-svh md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 md:block md:py-6">
          <Link href="/admin" className="font-display text-xl font-semibold">
            {site.name} <span className="text-xs font-normal text-paper/50">admin</span>
          </Link>
          <form action={logoutAction} className="md:hidden">
            <button className="rounded-full p-2 text-paper/70" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-paper/75 hover:bg-white/10 hover:text-paper">
              <Icon className="size-4" aria-hidden /> {label}
            </Link>
          ))}
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-paper/50 hover:text-paper md:mt-4">
            View site ↗
          </Link>
        </nav>
        <div className="hidden px-5 py-4 text-xs text-paper/50 md:absolute md:bottom-0 md:block md:w-60">
          <p className="truncate text-paper/80">{user.name}</p>
          <p className="truncate">
            {user.email} · {user.role}
          </p>
          <form action={logoutAction} className="mt-3">
            <button className="inline-flex items-center gap-1.5 text-paper/70 hover:text-paper">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  );
}
