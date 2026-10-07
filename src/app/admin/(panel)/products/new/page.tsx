import Link from "next/link";
import { requireUser } from "@/server/auth/dal";
import { ProductForm } from "@/components/admin/product-form";

export default async function NewProductPage() {
  await requireUser("products:write");
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">
        ← Products
      </Link>
      <h1 className="font-display mt-3 text-3xl font-semibold">Add a shoe</h1>
      <p className="mt-1 text-sm text-muted">
        Start with a name and section. Saving this takes you straight to the photo upload, then the 3D model. Nothing is public until you approve it.
      </p>
      <div className="card mt-6 p-6">
        <ProductForm mode="create" />
      </div>
    </div>
  );
}
