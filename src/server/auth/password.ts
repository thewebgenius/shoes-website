import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A fixed hash used to spend the same time when the email does not exist. */
let dummy: string | null = null;
export async function dummyVerify(password: string) {
  dummy ??= await hashPassword("timing-equaliser-not-a-real-password");
  await verifyPassword(dummy, password);
}

export function passwordProblems(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 256) return "Password is too long.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) return "Mix at least three of: lowercase, uppercase, digits, symbols.";
  return null;
}
