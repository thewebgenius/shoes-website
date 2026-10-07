import { describe, expect, it } from "vitest";
import { can } from "@/server/auth/rbac";

describe("role-based access", () => {
  it("lets shopkeepers run the catalogue but not read the audit log or manage users", () => {
    expect(can("shopkeeper", "products:write")).toBe(true);
    expect(can("shopkeeper", "products:publish")).toBe(true);
    expect(can("shopkeeper", "reviews:moderate")).toBe(true);
    expect(can("shopkeeper", "audit:read")).toBe(false);
    expect(can("shopkeeper", "users:manage")).toBe(false);
  });

  it("gives admins everything", () => {
    expect(can("admin", "audit:read")).toBe(true);
    expect(can("admin", "users:manage")).toBe(true);
  });

  it("denies anonymous callers", () => {
    expect(can(null, "products:read")).toBe(false);
    expect(can(undefined, "analytics:read")).toBe(false);
  });
});
