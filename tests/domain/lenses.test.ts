import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { LENSES, applyLens, lensById, matchesLens } from "@/lib/domain/lenses";
import { makeContext } from "@/lib/domain/contexts";

import { expense, income, investmentTxn, transfer } from "../helpers/factories";

/**
 * A lens is a saved question over the same rows the category breakdown uses.
 * The property that matters is that it never *replaces* the category — a
 * dinner filed under Dating must still be found by "eating out" — and that it
 * never picks up money that was not spent.
 */

describe("the lens catalogue", () => {
  test("every lens id is unique", () => {
    const ids = LENSES.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every lens declares at least one way to match", () => {
    for (const lens of LENSES) {
      const criteria =
        (lens.categoryIds?.length ?? 0) +
        (lens.groupIds?.length ?? 0) +
        (lens.contexts?.length ?? 0) +
        (lens.merchants?.length ?? 0);
      assert.ok(criteria > 0, `${lens.id} matches nothing`);
    }
  });

  test("merchant lists are lowercase, since matching lowercases the input", () => {
    for (const lens of LENSES) {
      for (const merchant of lens.merchants ?? []) {
        assert.equal(merchant, merchant.toLowerCase(), `${lens.id}: "${merchant}"`);
      }
    }
  });

  test("lensById finds a known lens and returns undefined otherwise", () => {
    assert.equal(lensById("eating-out")?.id, "eating-out");
    assert.equal(lensById("no-such-lens"), undefined);
  });
});

describe("matchesLens", () => {
  const eatingOut = lensById("eating-out")!;
  const alcohol = lensById("alcohol")!;
  const dating = lensById("dating")!;
  const subscriptions = lensById("subscriptions")!;

  test("only expenses can match — money moved is not money spent", () => {
    // A ₹50,000 transfer to a savings account must never appear under
    // "eating out" just because it lacks a category.
    assert.ok(!matchesLens(income({ categoryId: "dining" }), eatingOut));
    assert.ok(!matchesLens(transfer({ categoryId: "dining" }), eatingOut));
    assert.ok(!matchesLens(investmentTxn({ categoryId: "dining" }), eatingOut));
  });

  test("matches on category", () => {
    assert.ok(matchesLens(expense({ categoryId: "dining" }), eatingOut));
    assert.ok(!matchesLens(expense({ categoryId: "transport" }), eatingOut));
  });

  test("matches on context", () => {
    const drinks = expense({
      categoryId: "dining",
      contexts: [makeContext("alcohol")],
    });
    assert.ok(matchesLens(drinks, alcohol));
    assert.ok(!matchesLens(expense({ categoryId: "dining" }), alcohol));
  });

  test("a dinner on a date is found by both lenses, without duplication", () => {
    // The whole point of lenses: one row, two questions, counted once each.
    const dinner = expense({
      categoryId: "dining",
      contexts: [makeContext("dating")],
    });
    assert.ok(matchesLens(dinner, eatingOut));
    assert.ok(matchesLens(dinner, dating));
  });

  test("matches merchants case-insensitively", () => {
    assert.ok(matchesLens(expense({ merchant: "Netflix" }), subscriptions));
    assert.ok(matchesLens(expense({ merchant: "netflix" }), subscriptions));
    assert.ok(!matchesLens(expense({ merchant: "Nextflix" }), subscriptions));
  });

  test("a transaction with no category, context or merchant matches nothing", () => {
    const bare = expense({ categoryId: undefined, merchant: undefined });
    for (const lens of LENSES) {
      assert.ok(!matchesLens(bare, lens), `${lens.id} matched a bare expense`);
    }
  });
});

describe("applyLens", () => {
  test("filters to matching rows and keeps them intact", () => {
    const rows = [
      expense({ categoryId: "dining", description: "Dinner" }),
      expense({ categoryId: "transport", description: "Cab" }),
      expense({ categoryId: "dining", description: "Lunch" }),
      income({ categoryId: "dining", description: "Refund" }),
    ];
    const out = applyLens(rows, lensById("eating-out")!);
    assert.deepEqual(out.map((t) => t.description), ["Dinner", "Lunch"]);
  });

  test("returns an empty array rather than throwing on no rows", () => {
    assert.deepEqual(applyLens([], lensById("alcohol")!), []);
  });
});
