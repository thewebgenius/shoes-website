"use client";

type ClientEvent = "product_view" | "model_interaction";

const sent = new Set<string>();

/** Fire-and-forget analytics. Each event/product pair is sent at most once per page load. */
export function trackEvent(type: ClientEvent, productId: string) {
  const key = `${type}:${productId}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, productId }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}
