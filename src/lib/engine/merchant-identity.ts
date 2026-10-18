import { MERCHANTS } from "./lexicon";

/** Preserve payee names; remove payment machinery, never arbitrary substrings. */
export function merchantKey(text: string): string {
  const cleaned = text.toLowerCase().replace(/^upi[-/]\d+[-/]/, "")
    .replace(/\b(?:reference|rrn|utr)[:\s]+[a-z0-9]+/g, " ")
    .replace(/\([^)]*vpa[^)]*\)/g, " ")
    .replace(/\S+@\S+/g, " ").replace(/\b(?:upi|vpa|payment|private|pvt|limited|ltd)\b/g, " ")
    .replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ");
  const known = MERCHANTS.filter(m => m.aliases.some(a => words.includes(a)));
  // Instamart must not collapse into Swiggy food delivery.
  if (known.length === 1) return known[0]!.name.toLowerCase();
  return cleaned;
}
