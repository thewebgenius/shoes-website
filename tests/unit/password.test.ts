import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblems, verifyPassword } from "@/server/auth/password";

describe("passwords", () => {
  it("hashes with argon2id and verifies only the right password", async () => {
    const hash = await hashPassword("Correct-Horse-42");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "Correct-Horse-42")).toBe(true);
    expect(await verifyPassword(hash, "correct-horse-42")).toBe(false);
  });

  it("rejects weak passwords", () => {
    expect(passwordProblems("short1A!")).not.toBeNull();
    expect(passwordProblems("alllowercaseletters")).not.toBeNull();
    expect(passwordProblems("Showroom!2026-dev")).toBeNull();
  });
});
