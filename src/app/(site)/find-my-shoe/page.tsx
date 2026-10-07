import type { Metadata } from "next";
import { FindMyShoe } from "@/components/ai/find-my-shoe";

export const metadata: Metadata = {
  title: "Find My Shoe",
  description: "Upload or take a photo of a shoe and see the most visually similar shoes in our catalogue.",
};

export default function FindMyShoePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="border-b border-line py-10 sm:py-14">
        <p className="eyebrow">Find My Shoe · visual search</p>
        <h1 className="font-display mt-2 text-4xl font-semibold sm:text-5xl">Saw a shoe you liked? Show us.</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Upload or take a photo. We isolate the shoe, describe what it looks like, and return the five most visually similar pairs in our showroom.
        </p>
      </header>
      <div className="py-10">
        <FindMyShoe />
      </div>
    </div>
  );
}
