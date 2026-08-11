import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  UNCATEGORISED_ID,
  buildCategorySeed,
  createCategoryLookup,
  groupIdOf,
} from "@/lib/domain/categories";

/**
 * The category seed is data, and data rots quietly: a duplicated id or an
 * orphaned child never throws, it just makes one bucket swallow another's
 * spending. These are cheap structural guards over that.
 */

const seed = buildCategorySeed();

describe("buildCategorySeed", () => {
  test("every id is unique", () => {
    const ids = seed.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every child names a parent that exists", () => {
    const ids = new Set(seed.map((c) => c.id));
    for (const cat of seed) {
      if (cat.parentId === null) continue;
      assert.ok(ids.has(cat.parentId), `${cat.id} has no parent ${cat.parentId}`);
    }
  });

  test("children are namespaced under their group", () => {
    // "other" as a leaf id would collide across groups without the prefix.
    for (const cat of seed) {
      if (cat.parentId === null) continue;
      assert.equal(groupIdOf(cat.id), cat.parentId);
      assert.ok(cat.id.startsWith(`${cat.parentId}.`));
    }
  });

  test("the fallback category exists", () => {
    assert.ok(seed.some((c) => c.id === UNCATEGORISED_ID));
  });

  test("the balance-adjustment category exists and is a group", () => {
    // Reconciliation rows are filtered out of income/spent by this exact id.
    const adjustment = seed.find((c) => c.id === "adjustment");
    assert.ok(adjustment);
    assert.equal(adjustment.parentId, null);
  });

  test("every category is system-owned and undeletable", () => {
    assert.ok(seed.every((c) => c.system));
  });
});

describe("groupIdOf", () => {
  test("strips the leaf from a dotted id", () => {
    assert.equal(groupIdOf("dining.lunch"), "dining");
  });

  test("is identity for a group id", () => {
    assert.equal(groupIdOf("dining"), "dining");
  });
});

describe("createCategoryLookup", () => {
  const lookup = createCategoryLookup(seed);

  test("groups are the parentless rows, in order", () => {
    assert.ok(lookup.groups.every((g) => g.parentId === null));
    const orders = lookup.groups.map((g) => g.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  test("groupOf resolves a leaf to its group and a group to itself", () => {
    const leaf = seed.find((c) => c.parentId !== null);
    assert.ok(leaf);
    assert.equal(lookup.groupOf(leaf.id)?.id, leaf.parentId);
    assert.equal(lookup.groupOf("dining")?.id, "dining");
  });

  test("leavesOf returns a group's own children", () => {
    for (const group of lookup.groups) {
      for (const leaf of lookup.leavesOf(group.id)) {
        assert.equal(leaf.parentId, group.id);
      }
    }
  });

  test("names degrade rather than throw on an unknown id", () => {
    assert.equal(lookup.nameOf("no-such-category"), "Uncategorised");
    assert.equal(lookup.groupNameOf("no-such-category"), "Uncategorised");
    assert.equal(lookup.pathOf("no-such-category"), "Uncategorised");
  });

  test("an absent id reads as a dash rather than a fake category", () => {
    assert.equal(lookup.nameOf(undefined), "—");
  });

  test("pathOf shows the group for a leaf and the bare name for a group", () => {
    const leaf = seed.find((c) => c.parentId !== null);
    assert.ok(leaf);
    assert.match(lookup.pathOf(leaf.id), / › /);
    assert.ok(!lookup.pathOf("dining").includes("›"));
  });
});
