import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

// Admin pages are always rendered per request for the signed-in user.
export const instant = false;

export default function AdminRoot({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-full flex-1 flex-col bg-paper">{children}</div>;
}
