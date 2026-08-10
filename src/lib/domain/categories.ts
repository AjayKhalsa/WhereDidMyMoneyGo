import type { Category } from "./types";

/**
 * The built-in category tree.
 *
 * Two levels: a category answers "what financial bucket does this belong
 * to" (Food & Dining, Transport, ...); a child — the Type dimension —
 * answers "what specifically" (Lunch, Cab, ...) *only where that split is
 * actually useful*. Not every category has children: Essentials, Education,
 * Gifts and Other stay flat because breaking them down further wouldn't
 * earn its keep. Finer detail still like *who* you were with or *why*
 * belongs to the separate `TransactionContext` dimension, scoped to
 * category+type by `contextScopeFor` in `contexts.ts` — see that file and
 * `types.ts`'s doc comment on `TransactionContext`.
 *
 * Users never have to walk this list during entry — the parser picks a leaf
 * for them where it can, and Type is always skippable when it can't.
 */

interface CategorySeed {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Every category gets a catch-all leaf once it has any children at all. */
const OTHER_CHILD = { id: "other", name: "Other" };

export const CATEGORY_TREE: CategorySeed[] = [
  { id: "essentials", name: "Essentials", children: [] },
  {
    id: "transport",
    name: "Transport",
    children: [
      { id: "cab", name: "Cab" },
      { id: "metro", name: "Metro" },
      { id: "train", name: "Train" },
      { id: "bus", name: "Bus" },
      { id: "fuel", name: "Fuel" },
      { id: "parking", name: "Parking" },
      OTHER_CHILD,
    ],
  },
  {
    id: "travel",
    name: "Travel",
    children: [
      { id: "flight", name: "Flight" },
      { id: "train", name: "Train" },
      { id: "hotel", name: "Hotel" },
      { id: "local-transport", name: "Local transport" },
      { id: "activity", name: "Activity" },
      { id: "visa", name: "Visa" },
      OTHER_CHILD,
    ],
  },
  {
    id: "dining",
    name: "Food & Dining",
    children: [
      { id: "breakfast", name: "Breakfast" },
      { id: "lunch", name: "Lunch" },
      { id: "dinner", name: "Dinner" },
      { id: "coffee", name: "Coffee" },
      { id: "snacks", name: "Snacks" },
      { id: "drinks", name: "Drinks" },
      OTHER_CHILD,
    ],
  },
  {
    id: "shopping",
    name: "Shopping",
    children: [
      { id: "clothing", name: "Clothing" },
      { id: "electronics", name: "Electronics" },
      { id: "home", name: "Home" },
      { id: "personal", name: "Personal" },
      OTHER_CHILD,
    ],
  },
  {
    id: "entertainment",
    name: "Entertainment",
    children: [
      { id: "movie", name: "Movie" },
      { id: "ott", name: "OTT" },
      { id: "games", name: "Games" },
      { id: "event", name: "Event" },
      { id: "activity", name: "Activity" },
      OTHER_CHILD,
    ],
  },
  {
    id: "bills",
    name: "Bills & Subscriptions",
    children: [
      { id: "rent", name: "Rent" },
      { id: "mobile", name: "Mobile" },
      { id: "internet", name: "Internet" },
      { id: "utilities", name: "Utilities" },
      { id: "subscription", name: "Subscription" },
      { id: "insurance", name: "Insurance" },
      { id: "fees", name: "Fees & Interest" },
      OTHER_CHILD,
    ],
  },
  {
    id: "health",
    name: "Health & Fitness",
    children: [
      { id: "doctor", name: "Doctor" },
      { id: "medicine", name: "Medicine" },
      { id: "dental", name: "Dental" },
      { id: "gym", name: "Gym" },
      { id: "class", name: "Class" },
      { id: "equipment", name: "Equipment" },
      OTHER_CHILD,
    ],
  },
  { id: "education", name: "Education", children: [] },
  { id: "gifts", name: "Gifts", children: [] },
  { id: "other", name: "Other", children: [] },
];

export function buildCategorySeed(): Category[] {
  const rows: Category[] = [];
  CATEGORY_TREE.forEach((group, gi) => {
    rows.push({
      id: group.id,
      name: group.name,
      parentId: null,
      order: gi,
      system: true,
    });
    group.children.forEach((child, ci) => {
      rows.push({
        // Namespaced so "other" (or any short id) doesn't collide across
        // categories — matches the dotted shape the old pre-flatten leaves
        // used (see `LEGACY_CATEGORY_MAP` in category-migration.ts).
        id: `${group.id}.${child.id}`,
        name: child.name,
        parentId: group.id,
        order: ci,
        system: true,
      });
    });
  });
  return rows;
}

/** Fallback category used whenever nothing better can be determined. */
export const UNCATEGORISED_ID = "other";

/**
 * Group id for a category id. Identity for today's flat tree — kept because
 * a handful of call sites still ask "what group is this leaf under" and this
 * degrades correctly (returns the id itself) if categories ever grow a
 * child level again.
 */
export function groupIdOf(categoryId: string): string {
  const dot = categoryId.indexOf(".");
  return dot === -1 ? categoryId : categoryId.slice(0, dot);
}

export interface CategoryLookup {
  byId: Map<string, Category>;
  /** A category's own group — itself, for today's flat tree. */
  groupOf: (categoryId: string) => Category | undefined;
  nameOf: (categoryId: string | undefined) => string;
  groupNameOf: (categoryId: string | undefined) => string;
  /** Just the category's name — no parent to prefix in a flat tree. */
  pathOf: (categoryId: string | undefined) => string;
  groups: Category[];
  leavesOf: (groupId: string) => Category[];
}

export function createCategoryLookup(categories: Category[]): CategoryLookup {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = categories
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.order - b.order);
  const childrenByParent = new Map<string, Category[]>();
  for (const c of categories) {
    if (!c.parentId) continue;
    const list = childrenByParent.get(c.parentId) ?? [];
    list.push(c);
    childrenByParent.set(c.parentId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  const groupOf = (categoryId: string) => {
    const cat = byId.get(categoryId);
    if (!cat) return undefined;
    return cat.parentId ? byId.get(cat.parentId) : cat;
  };

  return {
    byId,
    groups,
    groupOf,
    leavesOf: (groupId) => childrenByParent.get(groupId) ?? [],
    nameOf: (id) => (id ? (byId.get(id)?.name ?? "Uncategorised") : "—"),
    groupNameOf: (id) =>
      id ? (groupOf(id)?.name ?? "Uncategorised") : "Uncategorised",
    pathOf: (id) => {
      if (!id) return "Uncategorised";
      const cat = byId.get(id);
      if (!cat) return "Uncategorised";
      if (!cat.parentId) return cat.name;
      const parent = byId.get(cat.parentId);
      return parent ? `${parent.name} › ${cat.name}` : cat.name;
    },
  };
}
