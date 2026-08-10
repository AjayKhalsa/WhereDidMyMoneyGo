import type { TransactionType } from "@/lib/domain/types";

/**
 * Bank-narration cleanup for statement import.
 *
 * Raw bank narrations are payment-rail noise wrapped around a merchant name
 * — `UPI-DISTRICT DINING-DISTRICTDINING@HDFC-<ref>` needs to become
 * something the existing NL parser (`parser.ts`) can actually work with, the
 * same way "district dining" would if typed by hand. This module only
 * cleans text and suggests a type hint; it never decides the final
 * category — `parseExpenseInput` still does that, same as manual entry.
 *
 * Deliberately no self-transfer detection here (see the import plan) — with
 * only one account's data available, guessing "this NEFT is probably you
 * moving money to yourself" produces more wrong guesses than it prevents.
 * The only type hints this module makes are ones with a genuinely
 * recognisable signal: a bank-paid interest credit, and a credit-card bill
 * payment.
 */

export interface NarrationCleanupResult {
  cleaned: string;
  typeHint?: TransactionType;
}

/** Payment-rail prefixes stripped outright — noise, not merchant info. Order matters: specific before generic. */
const STRIP_PREFIXES = [
  /^upi\/cr\//i,
  /^upi-/i,
  /^neft-cr-/i,
  /^neft-dr-/i,
  /^neft-/i,
  /^imps-cr-/i,
  /^imps-dr-/i,
  /^mmt\/imps\//i,
  /^imps-/i,
  /^rtgs-/i,
  /^ach-/i,
  /^ecs-/i,
  /^bbps\//i,
  /^pos\s+/i,
  /^visa\//i,
  /^maestro\//i,
  /^atw-/i,
  /^atl-/i,
  /^clg-/i,
  /^chq\s*paid-?/i,
];

const INTEREST_PATTERNS = [/int\.?\s*pd/i, /interest\s*paid/i, /interest\s*credit/i];
const CARD_PAYMENT_PATTERNS = [/credit\s*card/i, /card\s*payment/i, /billdesk/i, /\bcc\s*bill/i];
// A card narration mentioning a fee/penalty is spending against the card,
// not a payment towards it — e.g. "ANNUAL FEE-CREDIT CARD" must not force
// TRANSFER just because it also matches a CARD_PAYMENT_PATTERNS regex.
const CARD_FEE_EXCLUSION = /\b(fee|fees|penalty|surcharge)\b/i;
const SIP_KEYWORDS = [/\bsip\b/i, /mutual\s*fund/i, /\bmf\b/i, /folio/i];
const ACH_MANDATE = /^(ach|ecs)-/i;

export function cleanBankNarration(raw: string): NarrationCleanupResult {
  const original = raw.trim();

  // HDFC's quarterly interest line ("INT.PD:01APR2026-30JUN2026") never
  // contains the word "interest" in a form the parser's own TYPE_HINTS
  // would catch — canonicalise it so that existing hint fires downstream.
  if (INTEREST_PATTERNS.some((p) => p.test(original))) {
    return { cleaned: "interest", typeHint: "INCOME" };
  }

  let typeHint: TransactionType | undefined;
  if (
    CARD_PAYMENT_PATTERNS.some((p) => p.test(original)) &&
    !CARD_FEE_EXCLUSION.test(original)
  ) {
    typeHint = "TRANSFER";
  } else if (ACH_MANDATE.test(original) && SIP_KEYWORDS.some((p) => p.test(original))) {
    typeHint = "INVESTMENT";
  }

  let text = original;
  for (const pattern of STRIP_PREFIXES) {
    text = text.replace(pattern, "");
  }

  // IFSC-shaped codes (4 letters + 0 + 6 alphanumeric), e.g. "BARB0VJSBXX".
  text = text.replace(/\b[a-z]{4}0[a-z0-9]{6}\b/gi, " ");
  // Long reference/mandate numbers (account digits, UTR, mandate ids).
  text = text.replace(/\d{10,}/g, " ");
  // UPI VPA handles, e.g. "districtdining@hdfc" — deliberately excludes "-"
  // from the match, otherwise it greedily eats back across a real word
  // joined by a dash (e.g. "DINING-DISTRICTDINING@HDFC" would lose "DINING").
  text = text.replace(/[a-z0-9._]+@[a-z0-9.]+/gi, " ");
  // Collapse rail separators into plain spaces.
  text = text.replace(/[-/]+/g, " ").replace(/\s+/g, " ").trim();

  return { cleaned: text || original, typeHint };
}
