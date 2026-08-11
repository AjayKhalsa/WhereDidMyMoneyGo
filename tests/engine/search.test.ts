import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  filterTransactions,
  isFilterEmpty,
  mergeFilters,
  parseSearchQuery,
  summariseResults,
  type SearchContext,
} from "@/lib/engine/search";
import { buildCategorySeed, UNCATEGORISED_ID } from "@/lib/domain/categories";
import { makeContext } from "@/lib/domain/contexts";

import {
  at,
  expense,
  income,
  investmentTxn,
  makeAccount,
  rs,
  transfer,
} from "../helpers/factories";

/**
 * Search must agree with the rest of the app about what "this month" means.
 * It used to ignore `cycleStartDay` entirely, so a user on a 24th pay cycle
 * got a different answer from search than from Home for the same question —
 * two numbers, both presented as fact.
 */

const PAYDAY = 24;
const hdfc = makeAccount({ name: "HDFC" });

const context: SearchContext = {
  categories: buildCategorySeed(),
  accounts: [hdfc],
  now: new Date(2026, 7, 10), // 10 Aug 2026
  cycleStartDay: PAYDAY,
};

describe("parseSearchQuery", () => {
  test("an empty query filters nothing", () => {
    const { filter, terms } = parseSearchQuery("", context);
    assert.ok(isFilterEmpty(filter));
    assert.deepEqual(terms, []);
  });

  test("reads an upper bound", () => {
    const { filter } = parseSearchQuery("under 500", context);
    assert.equal(filter.maxAmount, rs(500));
  });

  test("reads a lower bound, including k suffixes", () => {
    const { filter } = parseSearchQuery("above 1.5k", context);
    assert.equal(filter.minAmount, rs(1500));
  });

  test("'this month' uses the pay cycle, not the calendar month", () => {
    // On 10 Aug with a 24th payday, "this month" is 24 Jul – 23 Aug.
    const { filter } = parseSearchQuery("this month", context);
    assert.equal(filter.from, "2026-07-24");
    assert.equal(filter.to, "2026-08-23");
  });

  test("'last month' is the previous pay cycle", () => {
    const { filter } = parseSearchQuery("last month", context);
    assert.equal(filter.from, "2026-06-24");
    assert.equal(filter.to, "2026-07-23");
  });

  test("recognises a leaf category by its name", () => {
    // Matched on display name, not id: the leaf "dining.dinner" is named
    // "Dinner", and its group "dining" is named "Food & Dining".
    const { filter, terms } = parseSearchQuery("dinner", context);
    assert.deepEqual(filter.categoryIds, ["dining.dinner"]);
    assert.ok(terms.some((t) => t.kind === "category"));
  });

  test("recognises a group by its name", () => {
    const { filter } = parseSearchQuery("shopping", context);
    assert.deepEqual(filter.groupIds, ["shopping"]);
  });

  test("recognises an account by name", () => {
    const { filter } = parseSearchQuery("hdfc", context);
    assert.deepEqual(filter.accountIds, [hdfc.id]);
  });

  test("unrecognised words become a text search", () => {
    const { filter } = parseSearchQuery("magnolia bakery", context);
    assert.match(filter.text ?? "", /magnolia/);
  });

  test("every recognised term is surfaced so the UI can show its working", () => {
    const { terms } = parseSearchQuery("dining above 1000 this month", context);
    const kinds = terms.map((t) => t.kind);
    assert.ok(kinds.includes("amount"));
    assert.ok(kinds.includes("date"));
    assert.ok(terms.every((t) => t.label.length > 0));
  });
});

describe("filterTransactions", () => {
  const rows = [
    expense({ categoryId: "dining", amount: rs(3000), accountId: hdfc.id, date: at("2026-08-01"), description: "Dinner" }),
    expense({ categoryId: "transport", amount: rs(200), date: at("2026-07-25"), description: "Cab" }),
    income({ amount: rs(250_000), date: at("2026-07-24"), description: "Salary" }),
    transfer({ amount: rs(5000), date: at("2026-08-02"), description: "Moved" }),
  ];

  test("filters by type", () => {
    const out = filterTransactions(rows, { types: ["EXPENSE"] });
    assert.equal(out.length, 2);
  });

  test("filters by amount range, inclusively", () => {
    assert.equal(filterTransactions(rows, { minAmount: rs(3000), maxAmount: rs(3000) }).length, 1);
  });

  test("filters by date range, inclusively at both ends", () => {
    const out = filterTransactions(rows, { from: "2026-07-24", to: "2026-07-25" });
    assert.deepEqual(out.map((t) => t.description).sort(), ["Cab", "Salary"]);
  });

  test("filters by account, matching either side of a transfer", () => {
    const move = transfer({ accountId: makeAccount().id, toAccountId: hdfc.id, amount: rs(100) });
    const out = filterTransactions([...rows, move], { accountIds: [hdfc.id] });
    assert.equal(out.length, 2);
  });

  test("filters by category group", () => {
    assert.equal(filterTransactions(rows, { groupIds: ["dining"] }).length, 1);
  });

  test("context filters are AND, not OR", () => {
    // "dinner with friends AND alcohol" must not match a dinner with only one.
    const both = expense({ contexts: [makeContext("friends"), makeContext("alcohol")] });
    const one = expense({ contexts: [makeContext("friends")] });
    const out = filterTransactions([both, one], { contexts: ["friends", "alcohol"] });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, both.id);
  });

  test("text search covers description, merchant and notes", () => {
    const rowsWithText = [
      expense({ description: "Lunch", merchant: "Magnolia Bakery" }),
      expense({ description: "Cab", notes: "airport run" }),
      expense({ description: "Coffee" }),
    ];
    assert.equal(filterTransactions(rowsWithText, { text: "magnolia" }).length, 1);
    assert.equal(filterTransactions(rowsWithText, { text: "airport" }).length, 1);
    assert.equal(filterTransactions(rowsWithText, { text: "zzz" }).length, 0);
  });

  test("needsReview finds only uncategorised expenses", () => {
    const rowsToReview = [
      expense({ categoryId: UNCATEGORISED_ID }),
      expense({ categoryId: "dining" }),
      income({ categoryId: UNCATEGORISED_ID }),
    ];
    const out = filterTransactions(rowsToReview, { needsReview: true });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.type, "EXPENSE");
  });

  test("an empty filter returns everything unchanged", () => {
    assert.equal(filterTransactions(rows, {}).length, rows.length);
  });

  test("search over a pay cycle agrees with the cycle bounds", () => {
    // The end-to-end version of the bug: parse "this month", apply it, and
    // the row dated 23 Jul (previous cycle) must not appear.
    const { filter } = parseSearchQuery("this month", context);
    const spanning = [
      expense({ date: at("2026-07-23"), description: "previous cycle" }),
      expense({ date: at("2026-07-24"), description: "first day" }),
      expense({ date: at("2026-08-23"), description: "last day" }),
      expense({ date: at("2026-08-24"), description: "next cycle" }),
    ];
    assert.deepEqual(
      filterTransactions(spanning, filter).map((t) => t.description),
      ["first day", "last day"],
    );
  });
});

describe("summariseResults", () => {
  const rows = [
    expense({ amount: rs(3000) }),
    expense({ amount: rs(1000) }),
    income({ amount: rs(250_000) }),
    transfer({ amount: rs(5000) }),
    investmentTxn({ amount: rs(10_000) }),
  ];

  test("only expenses count as spending", () => {
    // A salary in the results must never read as money spent.
    const summary = summariseResults(rows);
    assert.equal(summary.spent, rs(4000));
    assert.equal(summary.expenseCount, 2);
    assert.equal(summary.income, rs(250_000));
    assert.equal(summary.moved, rs(15_000));
  });

  test("reports the largest expense, not the largest row", () => {
    assert.equal(summariseResults(rows).largest?.amount, rs(3000));
  });

  test("an empty result set is all zeros, not NaN", () => {
    const summary = summariseResults([]);
    assert.equal(summary.count, 0);
    assert.equal(summary.averageExpense, 0);
    assert.equal(summary.largest, undefined);
  });
});

describe("isFilterEmpty", () => {
  test("true for nothing set and for empty arrays", () => {
    assert.ok(isFilterEmpty({}));
    assert.ok(isFilterEmpty({ categoryIds: [], contexts: [] }));
  });

  test("false as soon as anything is set, including a zero bound", () => {
    assert.ok(!isFilterEmpty({ text: "coffee" }));
    assert.ok(!isFilterEmpty({ minAmount: 0 }));
    assert.ok(!isFilterEmpty({ needsReview: true }));
  });
});

describe("mergeFilters", () => {
  test("the typed query wins over the filter bar", () => {
    const merged = mergeFilters({ categoryIds: ["dining"] }, { categoryIds: ["transport"] });
    assert.deepEqual(merged.categoryIds, ["transport"]);
  });

  test("empty overlay values do not erase the base", () => {
    const merged = mergeFilters({ categoryIds: ["dining"] }, { categoryIds: [] });
    assert.deepEqual(merged.categoryIds, ["dining"]);
  });

  test("unrelated keys from both sides survive", () => {
    const merged = mergeFilters({ text: "coffee" }, { minAmount: rs(100) });
    assert.equal(merged.text, "coffee");
    assert.equal(merged.minAmount, rs(100));
  });
});
