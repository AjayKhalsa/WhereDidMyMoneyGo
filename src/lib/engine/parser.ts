import { UNCATEGORISED_ID } from "@/lib/domain/categories";
import { makeContext, normaliseContexts } from "@/lib/domain/contexts";
import { parseAmountInput } from "@/lib/domain/money";
import type {
  Account,
  ClassificationRule,
  Paise,
  Transaction,
  TransactionContext,
  TransactionType,
} from "@/lib/domain/types";
import { matchAccountMentions, type AccountHit } from "./account-match";
import { levenshteinDistance } from "./fuzzy-match";
import { ACTIVITIES, CONTEXT_KEYWORDS, MERCHANTS, STOP_WORDS } from "./lexicon";
import { parseBankSms, type BankSmsRead } from "./sms";

/**
 * Deterministic natural-language expense parser.
 *
 * "3200 dinner + drinks with friends" has to become a fully-formed
 * transaction in one keystroke-free step, and it has to do so the same way
 * every single time. That repeatability is why this is a rule engine rather
 * than a model call: the user learns what the app will do, and the app learns
 * what the user means — see `learning.ts`.
 *
 * Confidence is honest. When the phrase genuinely is ambiguous we say so and
 * the UI asks; when a learned rule matches exactly we let the user save with
 * a single tap.
 */

export interface ParseResult {
  amount: Paise | null;
  /** Cleaned-up human description, e.g. "Dinner with friends". */
  description: string;
  categoryId: string;
  contexts: TransactionContext[];
  merchant?: string;
  type: TransactionType;
  /** Source account, resolved from text — only ever set for TRANSFER. */
  accountId?: string;
  /** Destination account, resolved from text — only ever set for TRANSFER. */
  toAccountId?: string;
  /** True when the phrase reads as money credited back, not new income. */
  isRefund?: boolean;
  /** A recent expense this refund likely reverses — a suggestion, never auto-applied. */
  suggestedReversalId?: string;
  /** 0–1. Above HIGH_CONFIDENCE the UI offers a one-tap save. */
  confidence: number;
  /** Human-readable reasons, surfaced in the "why did it guess this?" popover. */
  reasons: string[];
  /** Id of the learned rule that drove this, if any. */
  matchedRuleId?: string;
  /** Confidence of the matched rule itself, if any — lets a weak/fresh rule still get a second AI opinion. */
  matchedRuleConfidence?: number;
  /** Alternative categories worth offering as quick corrections. */
  alternatives: string[];
  /**
   * ISO date the *source* stated, e.g. the "on 14/08/26" in a bank SMS.
   * Undefined for ordinary typing, which means today.
   */
  date?: string;
}

export const HIGH_CONFIDENCE = 0.82;

export interface Token {
  raw: string;
  clean: string;
}

function tokenize(input: string): Token[] {
  return input
    .toLowerCase()
    // Digit grouping must be resolved before the comma is turned into a
    // separator, or "1,200" splits into "1" and "200" and the largest-token
    // rule silently books ₹200. Only commas *between digits* are removed, so
    // ordinary punctuation ("dinner, coffee") still separates words.
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/[^\p{L}\p{N}\s.+-]/gu, " ")
    .split(/[\s+]+/)
    .filter(Boolean)
    .map((raw) => ({ raw, clean: raw.replace(/[.\-]+$/g, "") }));
}

/** Numbers that are clearly quantities rather than money. */
const AMOUNT_BLOCKLIST = new Set(["1", "2", "3", "4", "5"]);

interface AmountMatch {
  amount: Paise;
  tokenIndex: number;
}

function extractAmount(tokens: Token[]): AmountMatch | null {
  const candidates: AmountMatch[] = [];
  tokens.forEach((token, index) => {
    const parsed = parseAmountInput(token.clean);
    if (parsed === null || parsed <= 0) return;
    // "2 pizzas" — a bare small integer mid-phrase is a count, not a price.
    if (index > 0 && AMOUNT_BLOCKLIST.has(token.clean)) return;
    // A bare run of ten or more digits is a phone number, a reference or an
    // account — not a price. Since the rule below takes the largest
    // candidate, one stray "9840012345" would otherwise win outright. A real
    // amount that long can still be typed with a comma, a decimal or a ₹.
    if (/^\d{10,}$/.test(token.clean)) return;
    candidates.push({ amount: parsed, tokenIndex: index });
  });
  if (candidates.length === 0) return null;
  // A leading number is almost always the amount; otherwise take the largest.
  const leading = candidates.find((c) => c.tokenIndex === 0);
  if (leading) return leading;
  return candidates.reduce((best, c) => (c.amount > best.amount ? c : best));
}

interface LexiconHit {
  categoryId: string;
  contexts: string[];
  weight: number;
  matchedWord: string;
}

function findMerchant(tokens: Token[]) {
  for (const token of tokens) {
    for (const merchant of MERCHANTS) {
      if (merchant.aliases.includes(token.clean)) {
        return { merchant, matchedWord: token.clean, fuzzy: false };
      }
    }
  }
  return null;
}

/**
 * A typo'd merchant ("swiggyy") still deserves a category guess — but it
 * must never be trusted as much as an exact hit. Only tried when the exact
 * match fails. Ambiguous ties (two different merchants equally close) are
 * dropped rather than guessed, same rule `account-match.ts` follows.
 */
function findMerchantFuzzy(tokens: Token[]) {
  for (const token of tokens) {
    if (token.clean.length < 5) continue;
    const threshold = token.clean.length >= 8 ? 2 : 1;
    const hits: { merchant: (typeof MERCHANTS)[number]; distance: number }[] = [];
    for (const merchant of MERCHANTS) {
      for (const alias of merchant.aliases) {
        if (Math.abs(alias.length - token.clean.length) > 2) continue;
        const distance = levenshteinDistance(token.clean, alias);
        if (distance > 0 && distance <= threshold) {
          hits.push({ merchant, distance });
        }
      }
    }
    if (hits.length === 0) continue;
    const min = Math.min(...hits.map((h) => h.distance));
    const closest = new Map(
      hits.filter((h) => h.distance === min).map((h) => [h.merchant.name, h.merchant]),
    );
    if (closest.size === 1) {
      return { merchant: [...closest.values()][0]!, matchedWord: token.clean, fuzzy: true };
    }
  }
  return null;
}

function findActivities(tokens: Token[]): LexiconHit[] {
  const hits: LexiconHit[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    for (const activity of ACTIVITIES) {
      if (!activity.keywords.includes(token.clean)) continue;
      if (seen.has(activity.categoryId)) continue;
      seen.add(activity.categoryId);
      hits.push({
        categoryId: activity.categoryId,
        contexts: activity.contexts ?? [],
        weight: activity.weight,
        matchedWord: token.clean,
      });
    }
  }
  return hits.sort((a, b) => b.weight - a.weight);
}

function findContexts(tokens: Token[]): { context: string; word: string }[] {
  const out: { context: string; word: string }[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    for (const entry of CONTEXT_KEYWORDS) {
      if (!entry.keywords.includes(token.clean)) continue;
      if (seen.has(entry.context)) continue;
      seen.add(entry.context);
      out.push({ context: entry.context, word: token.clean });
    }
  }
  return out;
}

function buildDescription(tokens: Token[], amountIndex: number | null): string {
  const words = tokens
    .filter((_, i) => i !== amountIndex)
    .map((t) => t.clean)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  if (words.length === 0) return "";
  const phrase = words.join(" ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Longest learned rule whose pattern appears in the phrase wins. */
function findRule(
  normalised: string,
  rules: ClassificationRule[],
): ClassificationRule | null {
  // Word-boundary match, not raw substring — a rule pattern is always a
  // single token (see `deriveRulePattern`), so "tea" must not match inside
  // "steak".
  const words = normalised.split(" ");
  let best: ClassificationRule | null = null;
  for (const rule of rules) {
    if (!words.includes(rule.pattern)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length &&
        rule.confidence > best.confidence)
    ) {
      best = rule;
    }
  }
  return best;
}

const TYPE_HINTS: { keywords: string[]; type: TransactionType }[] = [
  {
    keywords: [
      "salary", "bonus", "refund", "refunded", "cashback", "received", "freelance", "income",
      "commission", "interest", "dividend", "dividends", "reimbursement", "reimbursed",
    ],
    type: "INCOME",
  },
  { keywords: ["invested", "sip", "ppf", "mutual", "nps", "elss", "fd", "rd", "bond", "bonds", "sgb"], type: "INVESTMENT" },
  { keywords: ["transferred", "transfer", "repaid", "repayment", "cardpayment"], type: "TRANSFER" },
];

/** Money credited back against earlier spending, not new income. */
const REFUND_KEYWORDS = new Set(["refund", "refunded", "return", "returned", "cashback"]);

interface AccountResolution {
  accountId?: string;
  toAccountId?: string;
  reason?: string;
}

/**
 * "50000 from HDFC to ICICI" / "HDFC to ICICI" — two distinct accounts with
 * a bare "to" sitting between their mentions. Direction: whichever account
 * is mentioned before "to" is the source.
 */
function detectTransferShape(
  tokens: Token[],
  hits: AccountHit[],
): AccountResolution | null {
  const byAccount = new Map<string, AccountHit>();
  for (const hit of hits) {
    if (!byAccount.has(hit.account.id)) byAccount.set(hit.account.id, hit);
  }
  if (byAccount.size !== 2) return null;
  const [source, destination] = [...byAccount.values()].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  ) as [AccountHit, AccountHit];

  const toIndex = tokens.findIndex(
    (t, i) => t.clean === "to" && i > source.tokenIndex,
  );
  if (toIndex === -1 || toIndex >= destination.tokenIndex) return null;

  return {
    accountId: source.account.id,
    toAccountId: destination.account.id,
    reason: `"${source.matchedWord}" → ${source.account.name}, "${destination.matchedWord}" → ${destination.account.name}`,
  };
}

/**
 * "32000 paid HDFC card" — exactly one credit-card account mentioned,
 * alongside "paid" and/or "card". Source account defaults to the user's
 * default bank/cash account (or the sole one), never guessed between two.
 */
/** A fee/penalty on the card is an expense, not a payment towards it. */
const FEE_WORDS = new Set(["fee", "fees", "penalty", "surcharge"]);

function detectCardPayment(
  tokens: Token[],
  hits: AccountHit[],
  accounts: Account[],
): AccountResolution | null {
  const cardHits = new Map(
    hits
      .filter((h) => h.account.type === "CREDIT_CARD")
      .map((h) => [h.account.id, h] as const),
  );
  if (cardHits.size !== 1) return null;
  // Fees/interest accrue against the card — the bare word "card" would
  // otherwise satisfy `hasPaymentWord` below and mislabel spending as a
  // transfer. The dedicated interest-is-expense check right after this
  // function gets the final say on "interest" phrases.
  if (tokens.some((t) => FEE_WORDS.has(t.clean) || t.clean === "interest")) {
    return null;
  }
  const hasPaymentWord = tokens.some(
    (t) => t.clean === "paid" || t.clean === "card",
  );
  if (!hasPaymentWord) return null;

  const card = [...cardHits.values()][0]!;
  const spendable = accounts.filter(
    (a) => a.isActive && (a.type === "BANK" || a.type === "CASH"),
  );
  const source =
    spendable.find((a) => a.isDefault) ??
    (spendable.length === 1 ? spendable[0] : undefined);

  return {
    accountId: source?.id,
    toAccountId: card.account.id,
    reason: `"${card.matchedWord}" → ${card.account.name} card payment`,
  };
}

interface TypeDetection {
  type: TransactionType;
  accountId?: string;
  toAccountId?: string;
  reason?: string;
  /** True when accounts were resolved from an unambiguous phrase shape. */
  strong: boolean;
  /** Deterministic category override for a structural (not lexicon) signal. */
  categoryId?: string;
}

/**
 * "interest" alone is an INCOME keyword (bank interest credited) — but
 * "220 HDFC card interest charged" is the opposite: interest *charged on*
 * a card is spending, not income. Evidence of that: the phrase mentions a
 * credit-card account, or uses charge/late wording even without one.
 */
const CARD_INTEREST_EVIDENCE = new Set(["charged", "charge", "late"]);

function detectType(tokens: Token[], accounts: Account[]): TypeDetection {
  const hits = matchAccountMentions(tokens, accounts);

  const transferShape = detectTransferShape(tokens, hits);
  if (transferShape) return { type: "TRANSFER", ...transferShape, strong: true };

  const cardPayment = detectCardPayment(tokens, hits, accounts);
  if (cardPayment) return { type: "TRANSFER", ...cardPayment, strong: true };

  const hasCardMention = hits.some((h) => h.account.type === "CREDIT_CARD");
  const isCardInterestExpense =
    tokens.some((t) => t.clean === "interest") &&
    (hasCardMention || tokens.some((t) => CARD_INTEREST_EVIDENCE.has(t.clean)));
  if (isCardInterestExpense) {
    return { type: "EXPENSE", strong: false, categoryId: "bills.fees" };
  }

  for (const token of tokens) {
    for (const hint of TYPE_HINTS) {
      if (hint.keywords.includes(token.clean)) return { type: hint.type, strong: false };
    }
  }
  return { type: "EXPENSE", strong: false };
}

/**
 * Best-guess original expense a refund reverses — a suggestion the UI
 * prompts the user to confirm, never applied silently. Matches on merchant
 * when one resolved, else category; ranked by amount closeness then
 * recency among unreversed expenses from the last 60 days.
 */
export function suggestReversal(
  amount: Paise | null,
  categoryId: string,
  merchant: string | undefined,
  recentTransactions: Transaction[],
): string | undefined {
  if (amount === null) return undefined;
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const alreadyReversed = new Set(
    recentTransactions
      .map((t) => t.reversesTransactionId)
      .filter((id): id is string => Boolean(id)),
  );

  const candidates = recentTransactions.filter((t) => {
    if (t.type !== "EXPENSE") return false;
    if (alreadyReversed.has(t.id)) return false;
    if (new Date(t.date).getTime() < cutoff) return false;
    if (merchant) return t.merchant?.toLowerCase() === merchant.toLowerCase();
    return t.categoryId === categoryId;
  });
  if (candidates.length === 0) return undefined;

  const [best] = candidates.sort((a, b) => {
    const diff = Math.abs(a.amount - amount) - Math.abs(b.amount - amount);
    if (diff !== 0) return diff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  return best?.id;
}

export interface ParseOptions {
  rules?: ClassificationRule[];
  /** Used to derive weekend / late-night contexts. Defaults to now. */
  date?: Date;
  /** Live account list — enables resolving transfer/card-payment accounts from text. */
  accounts?: Account[];
  /** Recent transactions — enables suggesting a refund's original expense. */
  recentTransactions?: Transaction[];
}

/**
 * A pasted bank alert, read by its own rules and then categorised by the
 * ordinary ones.
 *
 * The amount, direction, date and account come from the message, which states
 * them as fact. The *category* does not exist in a bank SMS, so the merchant
 * name is put back through the normal three tiers — a learned "nykaa" rule
 * still wins, exactly as if it had been typed.
 */
function fromBankSms(sms: BankSmsRead, options: ParseOptions): ParseResult {
  const inner = parseExpenseInput(sms.merchant ?? "", {
    rules: options.rules,
    date: sms.date ? new Date(sms.date) : options.date,
  });

  const categorised = inner.categoryId !== UNCATEGORISED_ID;
  return {
    ...inner,
    amount: sms.amount,
    type: sms.type,
    merchant: sms.merchant ?? inner.merchant,
    description: sms.merchant ?? inner.description,
    accountId: sms.accountId ?? inner.accountId,
    // A statement only ever names the account money left; where it landed is
    // never in the message, so a transfer's destination stays for the user.
    toAccountId: undefined,
    isRefund: sms.isRefund,
    date: sms.date,
    // The figure and direction are certain; only the category is a guess.
    confidence: categorised ? 0.9 : 0.55,
    reasons: [...sms.reasons, ...inner.reasons],
  };
}

export function parseExpenseInput(
  input: string,
  options: ParseOptions = {},
): ParseResult {
  // A bank message before anything else: its numbers are dense with limits,
  // dues, references and helplines, any of which the ordinary "largest
  // number wins" rule would happily book as the amount.
  const sms = parseBankSms(input, options.accounts ?? []);
  if (sms) return fromBankSms(sms, options);

  const rules = options.rules ?? [];
  const tokens = tokenize(input);
  const amountMatch = extractAmount(tokens);
  const normalised = tokens.map((t) => t.clean).join(" ");

  const reasons: string[] = [];
  const contextValues: string[] = [];
  const alternatives: string[] = [];

  const typeDetection = detectType(tokens, options.accounts ?? []);
  const { type } = typeDetection;

  // ---- 1. A learned rule beats everything the lexicon knows. -------------
  const rule = findRule(normalised, rules);

  // ---- 2. Lexicon signals ------------------------------------------------
  const merchantHit = findMerchant(tokens) ?? findMerchantFuzzy(tokens);
  const activityHits = findActivities(tokens);
  const contextHits = findContexts(tokens);

  for (const hit of contextHits) contextValues.push(hit.context);
  for (const hit of activityHits) contextValues.push(...hit.contexts);
  if (merchantHit?.merchant.contexts) {
    contextValues.push(...merchantHit.merchant.contexts);
  }

  // ---- 3. Choose the base category ---------------------------------------
  let categoryId = UNCATEGORISED_ID;
  let baseScore = 0;
  let merchant = merchantHit?.merchant.name;

  if (rule) {
    categoryId = rule.categoryId;
    baseScore = 0.55 + Math.min(0.35, rule.confidence * 0.35);
    if (rule.merchant) merchant = rule.merchant;
    for (const c of rule.contexts) contextValues.push(c.value);
    reasons.push(`You've classified "${rule.pattern}" this way before`);
  } else if (activityHits.length > 0 && merchantHit) {
    // Both fired. The more specific activity wins unless the merchant is
    // unambiguous about what it sells (Netflix is never "dinner").
    const top = activityHits[0]!;
    const merchantCategory = merchantHit.merchant.categoryId;
    const agree = merchantCategory === top.categoryId;
    categoryId = agree ? merchantCategory : top.categoryId;
    baseScore = agree ? 0.9 : 0.72;
    reasons.push(
      agree
        ? `"${merchantHit.matchedWord}" and "${top.matchedWord}" both point here`
        : `"${top.matchedWord}" was more specific than "${merchantHit.matchedWord}"`,
    );
    if (!agree) alternatives.push(merchantCategory);
    // A typo'd merchant can never be trusted enough to one-tap-save, no
    // matter how well it agrees with an activity keyword.
    if (merchantHit.fuzzy) baseScore = Math.min(baseScore, 0.65);
  } else if (merchantHit) {
    categoryId = merchantHit.merchant.categoryId;
    baseScore = merchantHit.fuzzy ? 0.65 : 0.85;
    reasons.push(
      merchantHit.fuzzy
        ? `Read "${merchantHit.matchedWord}" as ${merchantHit.merchant.name}`
        : `${merchantHit.merchant.name} is usually this category`,
    );
  } else if (activityHits.length > 0) {
    const top = activityHits[0]!;
    categoryId = top.categoryId;
    baseScore = activityHits.length === 1 ? 0.8 : 0.74;
    reasons.push(`"${top.matchedWord}" suggests ${top.categoryId}`);
    for (const other of activityHits.slice(1, 3)) {
      alternatives.push(other.categoryId);
    }
  } else if (typeDetection.categoryId) {
    // Structural signal (e.g. card interest charged) — deterministic, no
    // lexicon guess involved.
    categoryId = typeDetection.categoryId;
    baseScore = 0.85;
    reasons.push("Interest charged on your card");
  } else {
    baseScore = 0.2;
    reasons.push("Nothing in the description was recognisable");
  }

  // ---- 3b. A resolved transfer/card-payment shape is as strong a signal as
  // an exact merchant match — the category guess above is irrelevant for a
  // TRANSFER (materialise strips it), so it never gets to override this.
  if (typeDetection.strong) {
    baseScore = Math.max(baseScore, 0.9);
    if (typeDetection.reason) reasons.unshift(typeDetection.reason);
  }

  // ---- 3c. Refund detection — money credited back, not new income. -------
  const isRefund =
    type === "INCOME" && tokens.some((t) => REFUND_KEYWORDS.has(t.clean));
  const suggestedReversalId = isRefund
    ? suggestReversal(
        amountMatch?.amount ?? null,
        categoryId,
        merchant,
        options.recentTransactions ?? [],
      )
    : undefined;

  // ---- 4. Derived contexts from the timestamp ----------------------------
  const when = options.date ?? new Date();
  const day = when.getDay();
  if (day === 0 || day === 6) contextValues.push("weekend");
  const hour = when.getHours();
  if (hour >= 22 || hour < 4) contextValues.push("late-night");

  // ---- 5. Confidence -----------------------------------------------------
  let confidence = baseScore;
  if (amountMatch === null) confidence *= 0.5;
  // A transfer never gets a real category (it doesn't need one), so the
  // usual "no category = low confidence" penalty must not apply to it.
  if (categoryId === UNCATEGORISED_ID && type !== "TRANSFER") {
    confidence = Math.min(confidence, 0.3);
  }
  // A long rambling phrase with one weak signal deserves a second look.
  if (tokens.length > 8 && baseScore < 0.8) confidence *= 0.9;
  confidence = Math.max(0, Math.min(1, confidence));

  const description = buildDescription(tokens, amountMatch?.tokenIndex ?? null);

  return {
    amount: amountMatch?.amount ?? null,
    description: description || (merchant ?? ""),
    categoryId,
    accountId: typeDetection.accountId,
    toAccountId: typeDetection.toAccountId,
    isRefund: isRefund || undefined,
    suggestedReversalId,
    contexts: normaliseContexts(contextValues.map((value) => makeContext(value))),
    merchant,
    type,
    confidence,
    reasons,
    matchedRuleId: rule?.id,
    matchedRuleConfidence: rule?.confidence,
    alternatives: [...new Set(alternatives)].filter((a) => a !== categoryId),
  };
}

/**
 * Is this phrase confident enough to save without confirmation?
 * Requires an amount, a real category, and a strong signal — anything less
 * and we show the interpretation first (spec §13).
 *
 * A TRANSFER never gets a category (it doesn't need one), so its bar is
 * both accounts resolved instead — an unambiguous "from X to Y" is as
 * trustworthy a one-tap save as an exact merchant match.
 */
export function canQuickSave(result: ParseResult): boolean {
  if (result.amount === null || result.amount <= 0) return false;
  if (result.confidence < HIGH_CONFIDENCE) return false;
  if (result.type === "TRANSFER") {
    return Boolean(result.accountId && result.toAccountId);
  }
  return result.categoryId !== UNCATEGORISED_ID;
}
