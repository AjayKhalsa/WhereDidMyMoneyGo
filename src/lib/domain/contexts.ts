import type { ContextType, TransactionContext } from "./types";

/**
 * The context vocabulary — the third dimension of every expense, after
 * Category and (where the category has one) Type.
 *
 * Category+Type answer "what kind of thing was this?" (Food & Dining ›
 * Lunch). Contexts answer "who was I with, why, and what was involved?".
 *
 * Because contexts are tags rather than a hierarchy, one ₹3,200 dinner can be
 * counted under Dining, under Friends, and under Alcohol without the money
 * being triple-counted anywhere — each query filters the same single row.
 *
 * Not every context value makes sense for every category — a flight has no
 * use for "Alcohol", a cab ride has no use for "Birthday". `CONTEXT_DEFINITIONS`
 * below stays the full flat vocabulary (used by the parser's keyword lexicon,
 * classification rules, seed data and search, none of which know a category
 * ahead of time), but `contextScopeFor` narrows it to what's actually worth
 * *offering* once a category (and type) is known — that's what the add-flow's
 * context picker renders from instead of the full list.
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
  // Purpose — why the money moved, distinct from who it moved with. Mostly
  // relevant to transport and travel, where "who with" often doesn't apply.
  {
    value: "commute",
    label: "Commute",
    type: "PURPOSE",
    suggested: false,
    description: "Routine travel to/from work",
  },
  {
    value: "airport",
    label: "Airport",
    type: "PURPOSE",
    suggested: false,
    description: "To or from the airport",
  },
  {
    value: "travel",
    label: "Travel",
    type: "PURPOSE",
    suggested: false,
    description: "Part of getting somewhere, not the destination itself",
  },
  {
    value: "personal",
    label: "Personal",
    type: "PURPOSE",
    suggested: false,
    description: "For yourself, not work or anyone else",
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
  {
    value: "impulse",
    label: "Impulse",
    type: "ATTRIBUTE",
    suggested: false,
    description: "Unplanned — decided in the moment",
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

/**
 * Builds a stored context tag. `type` defaults to the value's own vocabulary
 * entry (what the parser/lexicon/rules paths want), but can be overridden —
 * the same value can be offered under a different dimension for a different
 * category (e.g. "work" as PURPOSE for a cab ride vs PEOPLE for who you had
 * lunch with), and the picker passes the dimension it was actually shown
 * under so that distinction survives in the stored data.
 */
export function makeContext(value: string, type?: ContextType): TransactionContext {
  const def = BY_VALUE.get(value);
  return { type: type ?? def?.type ?? "ATTRIBUTE", value };
}

export function hasContext(
  contexts: TransactionContext[],
  value: string,
): boolean {
  return contexts.some((c) => c.value === value);
}

/**
 * De-duplicate by (type, value), preserving first-seen order. Keyed on the
 * pair rather than value alone because the same value can legitimately be
 * tagged under two dimensions at once — e.g. a cab ride "with a colleague,
 * for work" is PEOPLE:work AND PURPOSE:work, two distinct facts that happen
 * to share a word.
 */
export function normaliseContexts(
  contexts: TransactionContext[],
): TransactionContext[] {
  const seen = new Set<string>();
  const out: TransactionContext[] = [];
  for (const c of contexts) {
    const key = `${c.type}:${c.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
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

// ---------------------------------------------------------------------------
// Category/Type → relevant context dimensions
// ---------------------------------------------------------------------------

export const DIMENSION_LABELS: Record<ContextType, string> = {
  PEOPLE: "With whom",
  PURPOSE: "Purpose",
  OCCASION: "Occasion",
  ATTRIBUTE: "Attributes",
};

/** Display order for a scope's dimension sections. */
export const DIMENSION_ORDER: ContextType[] = [
  "PURPOSE",
  "PEOPLE",
  "OCCASION",
  "ATTRIBUTE",
];

export type ContextScope = Partial<Record<ContextType, string[]>>;

const GENERIC_SCOPE: ContextScope = {
  ATTRIBUTE: ["shared", "reimbursable"],
};

/**
 * Which context values are worth *offering* for a given category (or, where
 * one exists, its specific Type leaf) — the data-driven backend behind the
 * add-flow's context picker. Keyed by category id: a top-level id (e.g.
 * "dining") is that category's default scope, used by every one of its
 * types unless a more specific leaf id (e.g. "dining.dinner") overrides it.
 *
 * This is deliberately hand-curated per category rather than derived from
 * `CONTEXT_DEFINITIONS`' own `type` field — that field is each value's
 * *default* dimension, not a claim that the value belongs everywhere. A
 * flight has no use for "Alcohol" even though "Alcohol" exists; a cab ride
 * legitimately wants "Work" under both "With whom" (a colleague) and
 * "Purpose" (a business trip), which is why the same value can appear under
 * more than one dimension in the same scope.
 */
export const CONTEXT_SCOPES: Record<string, ContextScope> = {
  // ---- Food & Dining -------------------------------------------------
  dining: {
    PEOPLE: ["solo", "friends", "dating", "family", "work"],
    OCCASION: ["celebration", "birthday", "vacation"],
    ATTRIBUTE: ["alcohol", "shared", "reimbursable"],
  },
  "dining.dinner": {
    PEOPLE: ["solo", "friends", "dating", "family", "work"],
    OCCASION: ["celebration", "birthday", "anniversary", "party", "vacation"],
    ATTRIBUTE: ["alcohol", "shared", "reimbursable"],
  },
  "dining.coffee": {
    PEOPLE: ["solo", "friends", "dating", "work"],
    ATTRIBUTE: ["shared", "reimbursable"],
  },
  "dining.drinks": {
    PEOPLE: ["solo", "friends", "dating", "work"],
    OCCASION: ["celebration", "party"],
    ATTRIBUTE: ["alcohol", "shared", "reimbursable"],
  },
  "dining.snacks": {
    PEOPLE: ["solo", "friends", "family"],
    ATTRIBUTE: ["shared"],
  },

  // ---- Transport -------------------------------------------------------
  transport: {
    PEOPLE: ["solo", "friends", "family", "work"],
    ATTRIBUTE: ["shared", "reimbursable"],
  },
  "transport.cab": {
    PURPOSE: ["commute", "work", "airport", "travel", "personal"],
    PEOPLE: ["solo", "friends", "family", "work"],
    ATTRIBUTE: ["shared", "reimbursable"],
  },
  "transport.fuel": {
    PURPOSE: ["commute", "work", "personal"],
    ATTRIBUTE: ["reimbursable"],
  },
  "transport.parking": {
    PURPOSE: ["work", "personal"],
    ATTRIBUTE: ["reimbursable"],
  },

  // ---- Travel ------------------------------------------------------------
  travel: {
    PEOPLE: ["family", "friends", "work"],
    OCCASION: ["vacation"],
    ATTRIBUTE: ["shared", "reimbursable"],
  },
  "travel.flight": {
    PURPOSE: ["work", "vacation", "family"],
    ATTRIBUTE: ["reimbursable", "shared"],
  },

  // ---- Entertainment -------------------------------------------------
  entertainment: {
    PEOPLE: ["solo", "friends", "dating", "family", "work"],
    OCCASION: ["celebration"],
    ATTRIBUTE: ["shared"],
  },

  // ---- Shopping ------------------------------------------------------
  shopping: {
    PURPOSE: ["personal", "work", "gift"],
    OCCASION: ["birthday", "wedding", "vacation"],
    ATTRIBUTE: ["impulse", "shared"],
  },

  // ---- Bills & Subscriptions -------------------------------------------
  bills: GENERIC_SCOPE,

  // ---- Health & Fitness --------------------------------------------------
  health: {
    PEOPLE: ["family"],
    ATTRIBUTE: ["reimbursable"],
  },

  // ---- Gifts ---------------------------------------------------------
  gifts: {
    PEOPLE: ["family", "friends", "dating", "work"],
    OCCASION: ["birthday", "wedding", "anniversary", "celebration"],
  },
};

/**
 * Resolves the context scope for a category id — a leaf Type id (e.g.
 * "dining.dinner") falls back to its parent's scope if it has no override
 * of its own, and anything with no scope defined at all falls back to a
 * bare-bones generic scope rather than the old universal list.
 */
export function contextScopeFor(categoryId: string | undefined): ContextScope {
  if (!categoryId) return GENERIC_SCOPE;
  if (CONTEXT_SCOPES[categoryId]) return CONTEXT_SCOPES[categoryId];
  const dot = categoryId.indexOf(".");
  if (dot !== -1) {
    const parentId = categoryId.slice(0, dot);
    if (CONTEXT_SCOPES[parentId]) return CONTEXT_SCOPES[parentId];
  }
  return GENERIC_SCOPE;
}
