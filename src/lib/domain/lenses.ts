import type { Transaction } from "./types";
import { groupIdOf } from "./categories";

/**
 * Lenses — cross-cutting views over spending.
 *
 * Category *groups* are mutually exclusive: every expense belongs to exactly
 * one, so "where did my money go?" adds up to the total with nothing counted
 * twice. But real questions cut across that structure. "How much did I spend
 * eating out?" should include the dinner that got filed under Dating, and
 * "how much on alcohol?" should include drinks bought on a night out with
 * friends.
 *
 * A lens is a saved predicate over the same single transaction row. Nothing
 * is duplicated — the row is simply matched by more than one question.
 */

export interface Lens {
  id: string;
  label: string;
  question: string;
  /** Leaf category ids that always qualify. */
  categoryIds?: string[];
  /** Category groups that always qualify. */
  groupIds?: string[];
  /** Context values that always qualify. */
  contexts?: string[];
  /** Merchant names (lowercase) that always qualify. */
  merchants?: string[];
}

export const LENSES: Lens[] = [
  {
    id: "eating-out",
    label: "Eating out",
    question: "How much did I spend eating out?",
    categoryIds: ["dining"],
  },
  {
    id: "alcohol",
    label: "Alcohol",
    question: "How much did I spend on alcohol?",
    contexts: ["alcohol"],
  },
  {
    id: "dating",
    label: "Dating",
    question: "How much did I spend on dating?",
    contexts: ["dating"],
  },
  {
    id: "friends",
    label: "With friends",
    question: "How much did I spend with friends?",
    contexts: ["friends"],
  },
  {
    id: "cabs",
    label: "Cabs",
    question: "How much did I spend on cabs?",
    categoryIds: ["transport"],
  },
  {
    id: "diet",
    label: "Diet & protein",
    question: "How much did I spend on diet?",
    // Was its own leaf category before the flatten; no flat equivalent
    // exists, so this is a merchant-based lens until Step 2 (the Type
    // dimension) restores category-scoped precision via essentials/diet.
    merchants: ["muscleblaze", "myprotein", "avvatar", "wholetruth", "epigamia"],
  },
  {
    id: "work",
    label: "Work-related",
    question: "How much did work cost me?",
    contexts: ["work"],
  },
  {
    id: "weekends",
    label: "Weekends",
    question: "How much do weekends cost me?",
    contexts: ["weekend"],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    question: "How much goes to subscriptions?",
    // Same story as "diet" — bills.subscriptions had no flat equivalent,
    // so this is merchant-based until Step 2 restores bills+type precision.
    merchants: [
      "netflix", "spotify", "hotstar", "prime", "youtube premium", "disney+",
      "sonyliv", "zee5", "jiocinema", "apple tv", "apple music", "audible",
      "notion", "dropbox", "google one", "icloud", "microsoft 365", "adobe",
      "canva", "chatgpt", "claude", "gemini",
    ],
  },
];

export function matchesLens(transaction: Transaction, lens: Lens): boolean {
  if (transaction.type !== "EXPENSE") return false;

  if (lens.categoryIds && transaction.categoryId) {
    if (lens.categoryIds.includes(transaction.categoryId)) return true;
  }
  if (lens.groupIds && transaction.categoryId) {
    if (lens.groupIds.includes(groupIdOf(transaction.categoryId))) return true;
  }
  if (lens.contexts) {
    for (const c of transaction.contexts) {
      if (lens.contexts.includes(c.value)) return true;
    }
  }
  if (lens.merchants && transaction.merchant) {
    if (lens.merchants.includes(transaction.merchant.toLowerCase())) return true;
  }
  return false;
}

export function lensById(id: string): Lens | undefined {
  return LENSES.find((l) => l.id === id);
}

export function applyLens(transactions: Transaction[], lens: Lens): Transaction[] {
  return transactions.filter((t) => matchesLens(t, lens));
}
