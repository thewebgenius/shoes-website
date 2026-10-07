"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/track";

export function TrackView({ productId }: { productId: string }) {
  useEffect(() => trackEvent("product_view", productId), [productId]);
  return null;
}
