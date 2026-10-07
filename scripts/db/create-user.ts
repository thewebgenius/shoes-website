/**
 * Creates a staff account. Usage:
 *   npm run user:create -- --email=staff@example.com --name="Sita" --role=shopkeeper
 * The password is read from the STAFF_PASSWORD env var, or generated and printed once.
 */
import { randomBytes } from "node:crypto";
import { db } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";
import { hashPassword, passwordProblems } from "../../src/server/auth/password";

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
  const email = String(args.email ?? "").trim().toLowerCase();
  const role = args.role === "admin" ? "admin" : "shopkeeper";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email is required");
  let password = process.env.STAFF_PASSWORD ?? "";
  const generated = !password;
  if (generated) password = randomBytes(18).toString("base64url") + "!A1";
  const problem = passwordProblems(password);
  if (problem) throw new Error(problem);
  await db.insert(users).values({ email, name: String(args.name ?? email.split("@")[0]), role, passwordHash: await hashPassword(password) });
  console.log(`Created ${role} ${email}${generated ? ` with password: ${password} (shown once)` : ""}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
