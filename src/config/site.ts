/**
 * Store details shown on the public site. These are PLACEHOLDERS: replace them
 * with the real store's name, address, hours and contact before launch.
 */
export const site = {
  name: "StrideHaus",
  tagline: "Shoes you can turn over in your hands, before you ever touch them.",
  description:
    "Explore every pair in an interactive 3D showroom, read honest reviews, find a shoe from a photo and preview it with AI try-on.",
  store: {
    address: "Store address goes here (placeholder)",
    city: "Kathmandu, Nepal",
    hours: [
      { days: "Sunday – Friday", time: "10:00 – 19:00" },
      { days: "Saturday", time: "11:00 – 17:00" },
    ],
    phone: "+977-00-000000 (placeholder)",
    email: "hello@example.com",
  },
  legal: {
    entity: "StrideHaus (placeholder legal entity)",
    updated: "7 October 2026",
    contactEmail: "privacy@example.com",
  },
} as const;

export const CATEGORIES = [
  { key: "men", label: "Men", blurb: "Runners, court classics, boots and loafers." },
  { key: "women", label: "Women", blurb: "Pumps, flats, sandals and sneakers." },
  { key: "kids", label: "Kids", blurb: "Tough, bright and easy on, easy off." },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export function isCategory(v: string): v is CategoryKey {
  return v === "men" || v === "women" || v === "kids";
}
