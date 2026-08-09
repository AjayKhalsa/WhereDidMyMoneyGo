import { buildCategorySeed } from "@/lib/domain/categories";
import type { Database, TransactionContext } from "@/lib/domain/types";

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

interface CategorisedRow {
  categoryId?: string;
  contexts?: TransactionContext[];
}

function remapRow<T extends CategorisedRow>(row: T): { row: T; changed: boolean } {
  if (!row.categoryId || !isLegacyId(row.categoryId)) return { row, changed: false };
  return {
    row: { ...row, categoryId: remapCategoryId(row.categoryId, row.contexts ?? []) },
    changed: true,
  };
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

  const transactions = db.transactions.map((t) => {
    const result = remapRow(t);
    if (result.changed) changed = true;
    return result.row;
  });
  const rules = db.rules.map((r) => {
    const result = remapRow(r);
    if (result.changed) changed = true;
    return result.row;
  });
  const recurring = db.recurring.map((r) => {
    const result = remapRow(r);
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
