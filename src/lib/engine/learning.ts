import { createId } from "@/lib/utils";
import { DERIVED_CONTEXT_VALUES } from "@/lib/domain/contexts";
import type {
  ClassificationRule,
  TransactionContext,
} from "@/lib/domain/types";
import { CONTEXT_KEYWORDS, MERCHANTS, STOP_WORDS } from "./lexicon";

/**
 * Context words ("birthday", "work", "solo", ...) describe *who/why*, not
 * *what* — they're exactly the words most likely to recur across otherwise
 * unrelated purchases, so letting one become a rule pattern risks two
 * unrelated categories silently overwriting each other's rule the next time
 * either gets corrected.
 */
const CONTEXT_WORDS = new Set(CONTEXT_KEYWORDS.flatMap((k) => k.keywords));

/**
 * Personal learning (spec §14).
 *
 * The app should stop asking a question it has already been answered. Every
 * time a guess is accepted, the rule behind it gets a little more trusted;
 * every time a guess is corrected, a rule is written or rewritten so the same
 * mistake is not made twice.
 *
 * Rules are keyed on the most distinctive word in the description, because
 * that is the part a person actually repeats — "uber", "swiggy", "protein".
 */

const CONFIRM_STEP = 0.08;
const CORRECT_PENALTY = 0.25;
const MAX_CONFIDENCE = 0.98;
const NEW_RULE_CONFIDENCE = 0.6;

/**
 * Picks the token a rule should key on.
 * Merchant names win; otherwise the longest meaningful word, which is a
 * decent proxy for specificity ("groceries" beats "for").
 */
export function deriveRulePattern(description: string): string | null {
  const tokens = description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    if (MERCHANTS.some((m) => m.aliases.includes(token))) return token;
  }
  const candidates = tokens.filter((t) => !CONTEXT_WORDS.has(t));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, t) => (t.length > best.length ? t : best));
}

/** Contexts worth storing on a rule — timestamp-derived ones are not. */
function persistableContexts(
  contexts: TransactionContext[],
): TransactionContext[] {
  return contexts.filter((c) => !DERIVED_CONTEXT_VALUES.has(c.value));
}

export interface LearningInput {
  description: string;
  categoryId: string;
  contexts: TransactionContext[];
  merchant?: string;
  accountId?: string;
  /** The rule the parser used, if it used one. */
  matchedRuleId?: string;
  /** True when the user changed what the parser proposed. */
  wasCorrected: boolean;
}

/**
 * Returns the rules that should be written after a transaction is saved.
 * Pure — the caller persists them, which keeps this testable and keeps
 * storage concerns out of the engine.
 */
export function learnFromEntry(
  input: LearningInput,
  existing: ClassificationRule[],
): ClassificationRule[] {
  const pattern = deriveRulePattern(input.description);
  if (!pattern) return [];

  const now = new Date().toISOString();
  const contexts = persistableContexts(input.contexts);
  const match =
    existing.find((r) => r.id === input.matchedRuleId) ??
    existing.find((r) => r.pattern === pattern);

  // Nothing learned yet for this word — start a rule only once the user has
  // actually told us something, i.e. on a correction or an explicit save.
  if (!match) {
    return [
      {
        id: createId("rule"),
        pattern,
        categoryId: input.categoryId,
        contexts,
        merchant: input.merchant,
        accountId: input.accountId,
        confidence: NEW_RULE_CONFIDENCE,
        timesApplied: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  // The rule was right and went unchallenged: trust it a little more.
  if (!input.wasCorrected && match.categoryId === input.categoryId) {
    return [
      {
        ...match,
        confidence: Math.min(MAX_CONFIDENCE, match.confidence + CONFIRM_STEP),
        timesApplied: match.timesApplied + 1,
        updatedAt: now,
      },
    ];
  }

  // The rule was wrong. Rewrite it to what the user actually meant and knock
  // confidence down so one correction does not immediately become gospel.
  return [
    {
      ...match,
      categoryId: input.categoryId,
      contexts,
      merchant: input.merchant ?? match.merchant,
      accountId: input.accountId ?? match.accountId,
      confidence: Math.max(
        NEW_RULE_CONFIDENCE,
        match.confidence - CORRECT_PENALTY,
      ),
      timesApplied: 1,
      updatedAt: now,
    },
  ];
}

/** Rules the user is most likely to want to review, strongest first. */
export function sortRules(rules: ClassificationRule[]): ClassificationRule[] {
  return [...rules].sort(
    (a, b) =>
      b.timesApplied - a.timesApplied ||
      b.confidence - a.confidence ||
      a.pattern.localeCompare(b.pattern),
  );
}
