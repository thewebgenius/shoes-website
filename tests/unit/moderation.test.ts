import { describe, expect, it } from "vitest";
import { screenReview } from "@/server/security/moderation";

describe("screenReview", () => {
  it("passes an ordinary review", () => {
    const r = screenReview({ displayName: "Asha", body: "Comfortable from day one and the sole grips well on wet roads." });
    expect(r.verdict).toBe("clean");
    expect(r.flags).toEqual([]);
  });

  it("treats link-stuffed promotional text as spam", () => {
    const r = screenReview({ displayName: "Deals", body: "Buy now at www.cheap.example and www.x.top best price click here" });
    expect(r.verdict).toBe("spam");
  });

  it("flags abusive language for a person to look at", () => {
    const r = screenReview({ displayName: "Ravi", body: "These are shit, total garbage, the seller is an idiot." });
    expect(r.verdict).not.toBe("clean");
    expect(r.flags.join(" ")).toMatch(/abus|profan/);
  });

  it("flags contact details", () => {
    const r = screenReview({ displayName: "Mina", body: "Nice shoes, email me at mina@example.com for a swap" });
    expect(r.verdict).not.toBe("clean");
  });
});
