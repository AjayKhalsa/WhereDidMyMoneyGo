import type { Category } from "./types";

/**
 * The built-in category tree (spec §10).
 *
 * Two levels: group → leaf. Users never have to walk this tree during entry —
 * the parser picks a leaf for them. It exists so analytics can roll spending
 * up ("Dining" = restaurants + swiggy + cafes) and so the breakdown screens
 * have a stable structure.
 */

interface CategorySeed {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

export const CATEGORY_TREE: CategorySeed[] = [
  {
    id: "essentials",
    name: "Essentials",
    children: [
      { id: "essentials.groceries", name: "Food & Groceries" },
      { id: "essentials.diet", name: "Protein & Diet" },
      { id: "essentials.toiletries", name: "Toiletries" },
      { id: "essentials.skincare", name: "Skincare" },
      { id: "essentials.medicines", name: "Medicines" },
      { id: "essentials.other", name: "Other essentials" },
    ],
  },
  {
    id: "transport",
    name: "Transport",
    children: [
      { id: "transport.cab", name: "Cabs" },
      { id: "transport.metro", name: "Metro" },
      { id: "transport.fuel", name: "Fuel" },
      { id: "transport.parking", name: "Parking" },
      { id: "transport.other", name: "Other transport" },
    ],
  },
  {
    id: "dining",
    name: "Dining",
    children: [
      { id: "dining.restaurant", name: "Restaurants" },
      { id: "dining.delivery", name: "Delivery" },
      { id: "dining.cafe", name: "Cafes" },
      { id: "dining.takeaway", name: "Takeaway" },
      { id: "dining.drinks", name: "Bars & Drinks" },
    ],
  },
  {
    id: "dating",
    name: "Dating",
    children: [
      { id: "dating.dining", name: "Dinners" },
      { id: "dating.drinks", name: "Drinks" },
      { id: "dating.movies", name: "Movies" },
      { id: "dating.activities", name: "Activities" },
      { id: "dating.gifts", name: "Gifts" },
      { id: "dating.other", name: "Other" },
    ],
  },
  {
    id: "social",
    name: "Social",
    children: [
      { id: "social.dining", name: "Group dinners" },
      { id: "social.drinks", name: "Drinks" },
      { id: "social.parties", name: "Parties" },
      { id: "social.events", name: "Events" },
      { id: "social.other", name: "Other" },
    ],
  },
  {
    id: "entertainment",
    name: "Entertainment",
    children: [
      { id: "entertainment.movies", name: "Movies" },
      { id: "entertainment.ott", name: "OTT" },
      { id: "entertainment.games", name: "Games" },
      { id: "entertainment.events", name: "Events" },
      { id: "entertainment.other", name: "Other" },
    ],
  },
  {
    id: "bills",
    name: "Bills & Subscriptions",
    children: [
      { id: "bills.mobile", name: "Mobile" },
      { id: "bills.internet", name: "Internet" },
      { id: "bills.utilities", name: "Utilities" },
      { id: "bills.subscriptions", name: "Subscriptions" },
      { id: "bills.rent", name: "Rent" },
      { id: "bills.other", name: "Other bills" },
    ],
  },
  {
    id: "shopping",
    name: "Shopping",
    children: [
      { id: "shopping.clothes", name: "Clothes" },
      { id: "shopping.electronics", name: "Electronics" },
      { id: "shopping.home", name: "Home" },
      { id: "shopping.personal", name: "Personal items" },
      { id: "shopping.other", name: "Other" },
    ],
  },
  {
    id: "health",
    name: "Health & Fitness",
    children: [
      { id: "health.gym", name: "Gym" },
      { id: "health.doctor", name: "Doctor" },
      { id: "health.wellness", name: "Wellness" },
      { id: "health.other", name: "Other" },
    ],
  },
  {
    id: "misc",
    name: "Miscellaneous",
    children: [{ id: "misc.other", name: "Uncategorised" }],
  },
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

/** Fallback leaf used whenever nothing better can be determined. */
export const UNCATEGORISED_ID = "misc.other";

/** Group id for a leaf id, e.g. "dining.cafe" → "dining". */
export function groupIdOf(categoryId: string): string {
  const dot = categoryId.indexOf(".");
  return dot === -1 ? categoryId : categoryId.slice(0, dot);
}

export interface CategoryLookup {
  byId: Map<string, Category>;
  /** Leaf → its group category. */
  groupOf: (categoryId: string) => Category | undefined;
  nameOf: (categoryId: string | undefined) => string;
  groupNameOf: (categoryId: string | undefined) => string;
  /** "Dining › Cafes" */
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
