import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-2xl font-semibold">
          {site.name}
        </Link>
        <h1 className="font-display mt-8 text-3xl font-semibold">Shopkeeper sign in</h1>
        <p className="mt-2 text-sm text-muted">Manage the catalogue, approvals and reviews.</p>
        <LoginForm />
        <p className="mt-6 text-xs text-muted">Accounts are created by the store owner. Repeated failed attempts temporarily lock the account.</p>
      </div>
    </div>
  );
}
