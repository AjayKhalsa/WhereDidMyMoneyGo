import type { Category } from "./types";

/**
 * The built-in category tree.
 *
 * Flat — 11 categories, no subcategories. Categories answer "what financial
 * bucket does this belong to"; finer detail (what specifically happened,
 * who you were with) belongs to the separate `TransactionContext` dimension
 * instead of forking the category itself — see `types.ts`'s doc comment on
 * `TransactionContext`. Users never have to walk this list during entry —
 * the parser picks one for them.
 */

interface CategorySeed {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

export const CATEGORY_TREE: CategorySeed[] = [
  { id: "essentials", name: "Essentials", children: [] },
  { id: "transport", name: "Transport", children: [] },
  { id: "travel", name: "Travel", children: [] },
  { id: "dining", name: "Food & Dining", children: [] },
  { id: "shopping", name: "Shopping", children: [] },
  { id: "entertainment", name: "Entertainment", children: [] },
  { id: "bills", name: "Bills & Subscriptions", children: [] },
  { id: "health", name: "Health & Fitness", children: [] },
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
        id: child.id,
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
