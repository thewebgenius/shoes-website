import type { Metadata } from "next";
import { CategoryPage } from "@/components/site/category-page";

export const metadata: Metadata = { title: "Women's shoes", description: "Explore women's shoes in interactive 3D." };

export default function Page() {
  return <CategoryPage category="women" />;
}
