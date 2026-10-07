/**
 * Lightweight, explainable review screening. It never publishes anything on its
 * own: every review still waits for a person to approve it. The flags help the
 * shopkeeper prioritise, and obvious bot spam is dropped.
 */

// Short list of clearly abusive terms (English + a few common Nepali/Hindi
// insults written in Latin script). Matching is word-boundary based.
const ABUSIVE = [
  "idiot",
  "stupid",
  "moron",
  "retard",
  "bastard",
  "bitch",
  "fuck",
  "fucking",
  "shit",
  "asshole",
  "dickhead",
  "cunt",
  "whore",
  "slut",
  "kill yourself",
  "kys",
  "randi",
  "machikne",
  "muji",
  "chutiya",
  "madarchod",
  "bhenchod",
];

const SPAM_PHRASES = ["buy now", "click here", "free money", "crypto", "bitcoin", "whatsapp me", "telegram", "promo code", "discount code", "earn $", "casino", "viagra", "loan"];

export type ModerationResult = { verdict: "spam" | "flagged" | "clean"; flags: string[] };

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s");

export function screenReview(input: { displayName: string; body: string }): ModerationResult {
  const flags: string[] = [];
  const text = `${input.displayName}\n${input.body}`;
  const norm = normalise(text);

  const links = (text.match(/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|cn|top|info)\b/gi) ?? []).length;
  if (links > 0) flags.push("contains_link");
  if (links > 1) flags.push("multiple_links");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) flags.push("contains_email");
  if (/(\+?\d[\d\s-]{8,}\d)/.test(text)) flags.push("contains_phone_number");

  for (const word of ABUSIVE) {
    const re = new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(norm)) {
      flags.push("abusive_language");
      break;
    }
  }
  if (SPAM_PHRASES.some((p) => norm.includes(p))) flags.push("spam_phrase");
  if (/(.)\1{7,}/.test(text)) flags.push("repeated_characters");
  const letters = input.body.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 20 && letters === letters.toUpperCase()) flags.push("all_caps");
  const words = input.body.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 8 && new Set(words).size / words.length < 0.35) flags.push("repetitive_text");

  const spam = flags.includes("multiple_links") || (flags.includes("spam_phrase") && flags.includes("contains_link"));
  return { verdict: spam ? "spam" : flags.length ? "flagged" : "clean", flags };
}
