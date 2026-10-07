import type { Metadata } from "next";
import { CategoryPage } from "@/components/site/category-page";

export const metadata: Metadata = { title: "Kids' shoes", description: "Explore kids' shoes in interactive 3D." };

export default function Page() {
  return <CategoryPage category="kids" />;
}
