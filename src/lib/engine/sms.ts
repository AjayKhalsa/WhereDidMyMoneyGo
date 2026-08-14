import { parseAmountInput } from "@/lib/domain/money";
import type { Account, Paise, TransactionType } from "@/lib/domain/types";
import { parseFlexibleDMYDate } from "@/lib/import/statement-row";

/**
 * Reading a bank transaction SMS.
 *
 * The generic parser picks the *largest* number in a phrase, which is right
 * for "dinner 2400 with 4 friends" and catastrophic for a bank alert: a real
 * HSBC message ends "Report fraud on +914061268002", and that phone number
 * booked an expense of ₹9,14,06,12,68,002. Reference numbers, credit limits,
 * amounts due and helplines are all larger than the transaction itself.
 *
 * What makes an SMS tractable is a convention every Indian bank follows: the
 * transaction amount is the **first** currency-prefixed figure in the
 * message. Everything after it is context — limit, due, balance, ref. So this
 * module does not try to be clever; it reads the first amount, and takes the
 * direction, merchant, date and account from surrounding wording.
 *
 * Deliberately separate from `narration.ts`, which cleans *statement*
 * narrations: those are terse rail strings, these are sentences.
 */

/** The transaction amount: the first currency-prefixed figure in the message. */
const AMOUNT = /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;

/**
 * Words that only appear in machine-sent bank messages. Detection needs one
 * of these *and* a currency amount — "rs 500 lunch" is a person typing, not a
 * bank, and must keep going through the ordinary parser.
 */
const BANK_MARKERS = [
  /\ba\/c\b/i,
  /\bacct\b/i,
  /\baccount\b/i,
  /\bcredit\s*card\b/i,
  /\bdebit\s*card\b/i,
  /\bcreditcard\b/i,
  /\bdebited\b/i,
  /\bcredited\b/i,
  /\bavl\b/i,
  /\bavail(?:able)?\s*(?:bal|limit)\b/i,
  /\bref\s*(?:no\.?|number)?\s*\d{6,}/i,
  /\bupi\b/i,
  /\bnot\s*you\b/i,
  /\breport\s*fraud\b/i,
  /\btxn\b/i,
  /\bxx+\d/i,
];

const CREDIT_WORDS = /\b(credited|received|deposited|refunded|reversal|reversed)\b/i;
const DEBIT_WORDS = /\b(debited|used at|sent|spent|withdrawn|paid|purchase)\b/i;
const REFUND_WORDS = /\b(refund|refunded|reversal|reversed|cashback)\b/i;
/**
 * A card bill being paid, rather than spending. Fees and interest mention the
 * card too, so they are excluded here for the same reason `narration.ts`
 * excludes them — "ANNUAL FEE-CREDIT CARD" is spending *on* the card.
 */
const CARD_PAYMENT = /\b(card\s*(?:bill|payment)|payment\s*(?:towards|received)\s*.*card)\b/i;
const FEE_WORDS = /\b(fee|fees|penalty|charge|charges|surcharge|interest)\b/i;

/** "on 14/08/26", "on 14-08-2026" — the date the bank says it happened. */
const DATE = /\bon\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/i;

/**
 * The account this touched: "xxxxx6934", "A/C *7900", "card ending 1234".
 * Only the last four digits are used, because that is what `Account.hint`
 * stores and what the UI already shows as "•••• 6934".
 */
const LAST_FOUR = [
  /(?:x{2,}|\*{2,})\s*(\d{4})\b/i,
  /\ba\/c\s*\*?\s*(?:x*)(\d{4})\b/i,
  /\bending\s*(?:with\s*)?(\d{4})\b/i,
];

/** "used at NYKAA E RETAIL LIMI for", "To Zomato", "at Starbucks on". */
const MERCHANT_PATTERNS = [
  /\bused\s+at\s+(.+?)\s+for\b/i,
  /\bat\s+(.+?)\s+on\s+\d/i,
  /\bto\s+([A-Za-z][A-Za-z0-9 &'._-]{1,40}?)\s*(?:\n|on\s+\d|ref\b|$)/i,
  /\btowards\s+(.+?)\s*(?:\n|on\s+\d|$)/i,
];

/** Corporate tails a bank appends that no one calls the shop by. */
const MERCHANT_NOISE =
  /\b(e\s*retail|retail|limi(?:ted)?|ltd|pvt|private|india|services|solutions|technologies|payments?)\b/gi;

export interface BankSmsRead {
  amount: Paise;
  type: TransactionType;
  merchant?: string;
  /** ISO date taken from the message, not today. */
  date?: string;
  /** Resolved against `Account.hint` when the last four digits match one. */
  accountId?: string;
  isRefund?: boolean;
  /** Human-readable, so the "why did it guess this?" popover still works. */
  reasons: string[];
}

/**
 * True when this reads as a machine-sent bank alert.
 *
 * Requires two independent signals so ordinary typing never trips it: a
 * currency-prefixed amount, and a word only a bank would send.
 */
export function looksLikeBankSms(text: string): boolean {
  if (!text || text.length < 25) return false;
  if (!AMOUNT.test(text)) return false;
  return BANK_MARKERS.some((marker) => marker.test(text));
}

function cleanMerchant(raw: string): string | undefined {
  const cleaned = raw
    .replace(MERCHANT_NOISE, " ")
    .replace(/[^\p{L}\p{N}\s&'.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return undefined;
  // Bank alerts shout; title-case reads like the rest of the app.
  return cleaned
    .split(" ")
    .map((word) =>
      word.length <= 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function findAccount(text: string, accounts: Account[]): Account | undefined {
  for (const pattern of LAST_FOUR) {
    const match = pattern.exec(text);
    const digits = match?.[1];
    if (!digits) continue;
    const hit = accounts.find(
      (a) => a.isActive && a.hint && a.hint.replace(/\D/g, "").endsWith(digits),
    );
    if (hit) return hit;
  }
  return undefined;
}

export function parseBankSms(
  text: string,
  accounts: Account[] = [],
): BankSmsRead | null {
  if (!looksLikeBankSms(text)) return null;

  const amountMatch = AMOUNT.exec(text);
  const amount = amountMatch?.[1] ? parseAmountInput(amountMatch[1]) : null;
  if (amount === null || amount <= 0) return null;

  const reasons: string[] = ["Read as a bank message"];

  // --- Direction ----------------------------------------------------------
  // Checked in order of specificity: a card bill being paid is a transfer,
  // not spending — unless the message is about a fee, which is spending on
  // the card even though it says "card".
  let type: TransactionType = "EXPENSE";
  let isRefund = false;
  if (CARD_PAYMENT.test(text) && !FEE_WORDS.test(text)) {
    type = "TRANSFER";
    reasons.push("Reads as a card bill payment");
  } else if (CREDIT_WORDS.test(text) && !DEBIT_WORDS.test(text)) {
    type = "INCOME";
    isRefund = REFUND_WORDS.test(text);
    reasons.push(isRefund ? "Reads as money refunded" : "Reads as money in");
  } else {
    reasons.push("Reads as money out");
  }

  // --- Merchant -----------------------------------------------------------
  let merchant: string | undefined;
  for (const pattern of MERCHANT_PATTERNS) {
    const hit = pattern.exec(text)?.[1];
    if (!hit) continue;
    merchant = cleanMerchant(hit);
    if (merchant) {
      reasons.push(`Merchant read as ${merchant}`);
      break;
    }
  }

  // --- Date ---------------------------------------------------------------
  const rawDate = DATE.exec(text)?.[1];
  const date = rawDate ? (parseFlexibleDMYDate(rawDate) ?? undefined) : undefined;
  if (date) reasons.push(`Dated ${rawDate} in the message`);

  // --- Account ------------------------------------------------------------
  const account = findAccount(text, accounts);
  if (account) reasons.push(`Matched ${account.name} by its last four digits`);

  return {
    amount,
    type,
    merchant,
    date,
    accountId: account?.id,
    isRefund: isRefund || undefined,
    reasons,
  };
}
