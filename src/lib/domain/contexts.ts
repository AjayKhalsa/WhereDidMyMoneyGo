import type { ContextType, TransactionContext } from "./types";

/**
 * The context vocabulary — the second dimension of every expense (spec §11).
 *
 * Categories answer "what kind of thing was this?".
 * Contexts answer "who was I with, when, and what was involved?".
 *
 * Because contexts are tags rather than a hierarchy, one ₹3,200 dinner can be
 * counted under Dining, under Friends, and under Alcohol without the money
 * being triple-counted anywhere — each query filters the same single row.
 */

export interface ContextDefinition {
  value: string;
  label: string;
  type: ContextType;
  /** Shown as a suggestion chip in the add flow. */
  suggested: boolean;
  description: string;
}

export const CONTEXT_DEFINITIONS: ContextDefinition[] = [
  // People — who you were with. The most important dimension.
  {
    value: "dating",
    label: "Date",
    type: "PEOPLE",
    suggested: true,
    description: "Spent on or with someone you're seeing",
  },
  {
    value: "friends",
    label: "Friends",
    type: "PEOPLE",
    suggested: true,
    description: "Spent with friends",
  },
  {
    value: "family",
    label: "Family",
    type: "PEOPLE",
    suggested: true,
    description: "Spent with or on family",
  },
  {
    value: "work",
    label: "Work",
    type: "PEOPLE",
    suggested: true,
    description: "Colleagues, clients, or other work-related spending",
  },
  {
    value: "solo",
    label: "Solo",
    type: "PEOPLE",
    suggested: false,
    description: "Spent alone",
  },
  // Occasion — why, if it wasn't routine. Absence means nothing special.
  {
    value: "weekend",
    label: "Weekend",
    type: "OCCASION",
    suggested: false,
    description: "Happened on a Saturday or Sunday",
  },
  {
    value: "late-night",
    label: "Late night",
    type: "OCCASION",
    suggested: false,
    description: "After 10 PM",
  },
  {
    value: "birthday",
    label: "Birthday",
    type: "OCCASION",
    suggested: false,
    description: "A birthday",
  },
  {
    value: "wedding",
    label: "Wedding",
    type: "OCCASION",
    suggested: false,
    description: "A wedding",
  },
  {
    value: "anniversary",
    label: "Anniversary",
    type: "OCCASION",
    suggested: false,
    description: "An anniversary",
  },
  {
    value: "party",
    label: "Party",
    type: "OCCASION",
    suggested: false,
    description: "A party",
  },
  {
    value: "vacation",
    label: "Vacation",
    type: "OCCASION",
    suggested: true,
    description: "Part of a trip",
  },
  {
    value: "celebration",
    label: "Celebration",
    type: "OCCASION",
    suggested: false,
    description: "A festival or general celebration",
  },
  // Attributes — what was distinctive about the transaction itself.
  {
    value: "alcohol",
    label: "Alcohol",
    type: "ATTRIBUTE",
    suggested: true,
    description: "Involved drinks",
  },
  {
    value: "gift",
    label: "Gift",
    type: "ATTRIBUTE",
    suggested: false,
    description: "Bought for someone else",
  },
  {
    value: "shared",
    label: "Shared",
    type: "ATTRIBUTE",
    suggested: false,
    description: "Cost was split with someone else",
  },
  {
    value: "reimbursable",
    label: "Reimbursable",
    type: "ATTRIBUTE",
    suggested: false,
    description: "You'll get this money back",
  },
];

const BY_VALUE = new Map(CONTEXT_DEFINITIONS.map((c) => [c.value, c]));

export function contextLabel(value: string): string {
  return (
    BY_VALUE.get(value)?.label ??
    value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ")
  );
}

export function contextDefinition(value: string): ContextDefinition | undefined {
  return BY_VALUE.get(value);
}

export function makeContext(value: string): TransactionContext {
  const def = BY_VALUE.get(value);
  return { type: def?.type ?? "ATTRIBUTE", value };
}

export function hasContext(
  contexts: TransactionContext[],
  value: string,
): boolean {
  return contexts.some((c) => c.value === value);
}

/** De-duplicate by value, preserving first-seen order. */
export function normaliseContexts(
  contexts: TransactionContext[],
): TransactionContext[] {
  const seen = new Set<string>();
  const out: TransactionContext[] = [];
  for (const c of contexts) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    out.push(c);
  }
  return out;
}

/**
 * Contexts that are purely derived from the transaction's own timestamp.
 * These are recomputed rather than stored as user intent, so editing the date
 * of a transaction keeps "weekend" and "late-night" honest.
 */
export function derivedContexts(dateISO: string): TransactionContext[] {
  const d = new Date(dateISO);
  const out: TransactionContext[] = [];
  const day = d.getDay();
  if (day === 0 || day === 6) out.push(makeContext("weekend"));
  const hour = d.getHours();
  if (hour >= 22 || hour < 4) out.push(makeContext("late-night"));
  return out;
}

export const DERIVED_CONTEXT_VALUES = new Set(["weekend", "late-night"]);
