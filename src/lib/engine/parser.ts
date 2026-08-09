import { UNCATEGORISED_ID } from "@/lib/domain/categories";
import { makeContext, normaliseContexts } from "@/lib/domain/contexts";
import { parseAmountInput } from "@/lib/domain/money";
import type {
  ClassificationRule,
  Paise,
  TransactionContext,
  TransactionType,
} from "@/lib/domain/types";
import { ACTIVITIES, CONTEXT_KEYWORDS, MERCHANTS, STOP_WORDS } from "./lexicon";

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
  /** 0–1. Above HIGH_CONFIDENCE the UI offers a one-tap save. */
  confidence: number;
  /** Human-readable reasons, surfaced in the "why did it guess this?" popover. */
  reasons: string[];
  /** Id of the learned rule that drove this, if any. */
  matchedRuleId?: string;
  /** Alternative categories worth offering as quick corrections. */
  alternatives: string[];
}

export const HIGH_CONFIDENCE = 0.82;

interface Token {
  raw: string;
  clean: string;
}

function tokenize(input: string): Token[] {
  return input
    .toLowerCase()
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
        return { merchant, matchedWord: token.clean };
      }
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
  let best: ClassificationRule | null = null;
  for (const rule of rules) {
    if (!normalised.includes(rule.pattern)) continue;
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

function detectType(tokens: Token[]): TransactionType {
  for (const token of tokens) {
    for (const hint of TYPE_HINTS) {
      if (hint.keywords.includes(token.clean)) return hint.type;
    }
  }
  return "EXPENSE";
}

export interface ParseOptions {
  rules?: ClassificationRule[];
  /** Used to derive weekend / late-night contexts. Defaults to now. */
  date?: Date;
}

export function parseExpenseInput(
  input: string,
  options: ParseOptions = {},
): ParseResult {
  const rules = options.rules ?? [];
  const tokens = tokenize(input);
  const amountMatch = extractAmount(tokens);
  const normalised = tokens.map((t) => t.clean).join(" ");

  const reasons: string[] = [];
  const contextValues: string[] = [];
  const alternatives: string[] = [];

  const type = detectType(tokens);

  // ---- 1. A learned rule beats everything the lexicon knows. -------------
  const rule = findRule(normalised, rules);

  // ---- 2. Lexicon signals ------------------------------------------------
  const merchantHit = findMerchant(tokens);
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
  } else if (merchantHit) {
    categoryId = merchantHit.merchant.categoryId;
    baseScore = 0.85;
    reasons.push(`${merchantHit.merchant.name} is usually this category`);
  } else if (activityHits.length > 0) {
    const top = activityHits[0]!;
    categoryId = top.categoryId;
    baseScore = activityHits.length === 1 ? 0.8 : 0.74;
    reasons.push(`"${top.matchedWord}" suggests ${top.categoryId}`);
    for (const other of activityHits.slice(1, 3)) {
      alternatives.push(other.categoryId);
    }
  } else {
    baseScore = 0.2;
    reasons.push("Nothing in the description was recognisable");
  }

  // ---- 4. Derived contexts from the timestamp ----------------------------
  const when = options.date ?? new Date();
  const day = when.getDay();
  if (day === 0 || day === 6) contextValues.push("weekend");
  const hour = when.getHours();
  if (hour >= 22 || hour < 4) contextValues.push("late-night");

  // ---- 5. Confidence -----------------------------------------------------
  let confidence = baseScore;
  if (amountMatch === null) confidence *= 0.5;
  if (categoryId === UNCATEGORISED_ID) confidence = Math.min(confidence, 0.3);
  // A long rambling phrase with one weak signal deserves a second look.
  if (tokens.length > 8 && baseScore < 0.8) confidence *= 0.9;
  confidence = Math.max(0, Math.min(1, confidence));

  const description = buildDescription(tokens, amountMatch?.tokenIndex ?? null);

  return {
    amount: amountMatch?.amount ?? null,
    description: description || (merchant ?? ""),
    categoryId,
    contexts: normaliseContexts(contextValues.map(makeContext)),
    merchant,
    type,
    confidence,
    reasons,
    matchedRuleId: rule?.id,
    alternatives: [...new Set(alternatives)].filter((a) => a !== categoryId),
  };
}

/**
 * Is this phrase confident enough to save without confirmation?
 * Requires an amount, a real category, and a strong signal — anything less
 * and we show the interpretation first (spec §13).
 */
export function canQuickSave(result: ParseResult): boolean {
  return (
    result.amount !== null &&
    result.amount > 0 &&
    result.categoryId !== UNCATEGORISED_ID &&
    result.confidence >= HIGH_CONFIDENCE
  );
}
