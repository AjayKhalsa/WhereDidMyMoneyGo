import { buildCategorySeed } from "@/lib/domain/categories";
import type {
  ClassificationRule,
  Database,
  RecurringTransaction,
  Transaction,
  TransactionContext,
} from "@/lib/domain/types";

/**
 * One-time cleanup for data written under the old 10-group/46-leaf category
 * tree, before it flattened to 11 categories with no subcategories.
 *
 * This is the single source of truth for the old→new mapping — the SQL
 * migration (`supabase/migrations/0003_flatten_categories.sql`) hand-copies
 * this same table into a `CASE` statement since it can't import TS; keep
 * the two in sync if this table ever changes.
 */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "essentials.groceries": "essentials",
  "essentials.diet": "essentials",
  "essentials.toiletries": "essentials",
  "essentials.skincare": "essentials",
  "essentials.medicines": "essentials",
  "essentials.other": "essentials",
  "transport.cab": "transport",
  "transport.metro": "transport",
  "transport.fuel": "transport",
  "transport.parking": "transport",
  "transport.other": "transport",
  "dining.restaurant": "dining",
  "dining.delivery": "dining",
  "dining.cafe": "dining",
  "dining.takeaway": "dining",
  "dining.drinks": "dining",
  "dating.dining": "dining",
  "dating.drinks": "dining",
  "dating.movies": "entertainment",
  "dating.activities": "entertainment",
  "dating.gifts": "gifts",
  "dating.other": "other",
  "social.dining": "dining",
  "social.drinks": "dining",
  "social.parties": "entertainment",
  "social.events": "entertainment",
  "social.other": "other",
  "entertainment.movies": "entertainment",
  "entertainment.ott": "entertainment",
  "entertainment.games": "entertainment",
  "entertainment.events": "entertainment",
  "entertainment.other": "entertainment",
  "bills.mobile": "bills",
  "bills.internet": "bills",
  "bills.utilities": "bills",
  "bills.subscriptions": "bills",
  "bills.rent": "bills",
  "bills.other": "bills",
  "shopping.clothes": "shopping",
  "shopping.electronics": "shopping",
  "shopping.home": "shopping",
  // The only lexicon rule that ever pointed here was the gift/voucher
  // activity — moved to the new dedicated Gifts category, not Shopping.
  "shopping.personal": "gifts",
  "shopping.other": "shopping",
  "health.gym": "health",
  "health.doctor": "health",
  "health.wellness": "health",
  "health.other": "health",
  "misc.other": "other",
  // Bare old group ids, in case a row was ever stored at that level.
  misc: "other",
  dating: "other",
  social: "other",
};

function isLegacyId(id: string): boolean {
  return id.includes(".") || id === "misc" || id === "dating" || id === "social";
}

/**
 * `misc.other` rows tagged with an OCCASION:travel context recover their
 * real category (Travel didn't exist as a bucket under the old tree, so
 * these were always dumped into Uncategorised) instead of collapsing into
 * the new catch-all "other" like every other legacy uncategorised row.
 */
function remapCategoryId(id: string, contexts: TransactionContext[]): string {
  if (id === "misc.other") {
    const isTravel = contexts.some((c) => c.type === "OCCASION" && c.value === "travel");
    if (isTravel) return "travel";
  }
  return LEGACY_CATEGORY_MAP[id] ?? id;
}

/** categoryId-only remap — used for RecurringTransaction, which has no `contexts` field. */
function remapCategoryOnly<T extends { categoryId?: string }>(
  row: T,
): { row: T; changed: boolean } {
  if (!row.categoryId || !isLegacyId(row.categoryId)) return { row, changed: false };
  return {
    row: { ...row, categoryId: remapCategoryId(row.categoryId, []) },
    changed: true,
  };
}

/**
 * Old ContextType values, before COMPANY/NATURE were renamed to
 * PEOPLE/ATTRIBUTE (OCCASION unchanged). Stored `type` strings need
 * rewriting even though `value` is untouched — the live Postgres schema's
 * check constraint on `transaction_contexts.type`/`rule_contexts.type` was
 * updated to only allow the new names (see
 * `0004_context_redesign.sql`), so any row still carrying an old type
 * string would fail to save the next time it's written, not just look
 * stale.
 */
const LEGACY_CONTEXT_TYPE_MAP: Record<string, TransactionContext["type"]> = {
  COMPANY: "PEOPLE",
  NATURE: "ATTRIBUTE",
};

function remapContextType(context: TransactionContext): {
  context: TransactionContext;
  changed: boolean;
} {
  const remapped = LEGACY_CONTEXT_TYPE_MAP[context.type as string];
  if (!remapped) return { context, changed: false };
  return { context: { ...context, type: remapped }, changed: true };
}

/**
 * "Travel" stopped being a selectable Occasion once Travel became a real
 * category (an Occasion:Travel chip sitting next to a Travel category label
 * is pure visible duplication) — but only strip it where that duplication
 * is actually present. A `travel` tag on a row that ends up categorised as
 * something else is left alone, same as any other now-orphaned context
 * value (harmless, still meaningful, not worth a forced cleanup).
 */
function stripRedundantTravelContext(
  categoryId: string | undefined,
  contexts: TransactionContext[],
): { contexts: TransactionContext[]; changed: boolean } {
  if (categoryId !== "travel") return { contexts, changed: false };
  const filtered = contexts.filter((c) => !(c.type === "OCCASION" && c.value === "travel"));
  if (filtered.length === contexts.length) return { contexts, changed: false };
  return { contexts: filtered, changed: true };
}

/** categoryId + contexts remap — used for Transaction and ClassificationRule, both of which always carry a `contexts` array. */
function remapCategorisedRow<T extends { categoryId?: string; contexts: TransactionContext[] }>(
  row: T,
): { row: T; changed: boolean } {
  let changed = false;
  let categoryId = row.categoryId;
  if (categoryId && isLegacyId(categoryId)) {
    categoryId = remapCategoryId(categoryId, row.contexts);
    changed = true;
  }

  let contexts = row.contexts;
  const retyped = contexts.map(remapContextType);
  if (retyped.some((r) => r.changed)) {
    contexts = retyped.map((r) => r.context);
    changed = true;
  }

  const stripped = stripRedundantTravelContext(categoryId, contexts);
  if (stripped.changed) changed = true;

  if (!changed) return { row, changed: false };
  return {
    row: { ...row, categoryId, contexts: stripped.contexts },
    changed: true,
  };
}

/**
 * Bank statements give a date, never a real time, so an imported
 * transaction's stored timestamp always defaults to local midnight —
 * `materialise()` in `actions.ts` now skips deriving weekend/late-night for
 * new imports because of this, but transactions imported before that fix
 * already have the spurious tags baked in. Strip them here too.
 */
function stripImportDerivedContexts(t: Transaction): { row: Transaction; changed: boolean } {
  if (t.source !== "imported") return { row: t, changed: false };
  const filtered = t.contexts.filter(
    (c) => !(c.type === "OCCASION" && (c.value === "weekend" || c.value === "late-night")),
  );
  if (filtered.length === t.contexts.length) return { row: t, changed: false };
  return { row: { ...t, contexts: filtered }, changed: true };
}

/**
 * Pure function: rewrites any legacy category ids found on transactions,
 * rules, or recurring rules, and refreshes `categories` to the current flat
 * seed whenever legacy ids are found anywhere. Returns the same `db`
 * reference (and `changed: false`) when there's nothing to do, so callers
 * can skip a write for brand-new users and on every subsequent boot.
 */
export function remapLegacyCategories(db: Database): { db: Database; changed: boolean } {
  let changed = false;

  const transactions: Transaction[] = db.transactions.map((t) => {
    const result = remapCategorisedRow(t);
    if (result.changed) changed = true;
    const stripped = stripImportDerivedContexts(result.row);
    if (stripped.changed) changed = true;
    return stripped.row;
  });
  const rules: ClassificationRule[] = db.rules.map((r) => {
    const result = remapCategorisedRow(r);
    if (result.changed) changed = true;
    return result.row;
  });
  const recurring: RecurringTransaction[] = db.recurring.map((r) => {
    const result = remapCategoryOnly(r);
    if (result.changed) changed = true;
    return result.row;
  });

  if (db.categories.some((c) => isLegacyId(c.id))) changed = true;

  if (!changed) return { db, changed: false };

  return {
    db: { ...db, transactions, rules, recurring, categories: buildCategorySeed() },
    changed: true,
  };
}
