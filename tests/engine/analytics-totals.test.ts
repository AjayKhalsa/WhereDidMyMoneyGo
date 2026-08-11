import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  averageTransactionSize,
  compareToAverage,
  inMonth,
  monthTotals,
  monthTransactions,
  outlierTransactions,
  shareAfterHour,
  spendByCategory,
  spendByMerchant,
  spendingVelocity,
  weekendSplit,
} from "@/lib/engine/analytics";

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
 * The monthly totals are what Home, Insights and the surplus all read from.
 * The two rules that keep them honest: only EXPENSE is spending, and a
 * correction is neither income nor spending.
 */

const PAYDAY = 24;
const MONTH = "2026-07-24";
const bank = makeAccount();

describe("inMonth and monthTransactions", () => {
  test("a cycle runs from its start day to the day before the next", () => {
    assert.ok(inMonth(expense({ date: at("2026-07-24") }), MONTH, PAYDAY));
    assert.ok(inMonth(expense({ date: at("2026-08-23", 23) }), MONTH, PAYDAY));
    assert.ok(!inMonth(expense({ date: at("2026-07-23") }), MONTH, PAYDAY));
    assert.ok(!inMonth(expense({ date: at("2026-08-24") }), MONTH, PAYDAY));
  });

  test("monthTransactions keeps only rows inside the cycle", () => {
    const rows = [
      expense({ date: at("2026-07-23"), description: "before" }),
      expense({ date: at("2026-08-01"), description: "inside" }),
      expense({ date: at("2026-08-24"), description: "after" }),
    ];
    assert.deepEqual(
      monthTransactions(rows, MONTH, PAYDAY).map((t) => t.description),
      ["inside"],
    );
  });
});

describe("monthTotals", () => {
  test("separates the four types — only EXPENSE is spending", () => {
    const rows = [
      income({ amount: rs(100_000), date: at("2026-07-24") }),
      expense({ amount: rs(20_000), date: at("2026-07-25") }),
      investmentTxn({ amount: rs(30_000), date: at("2026-07-26") }),
      transfer({ amount: rs(5000), date: at("2026-07-27") }),
    ];
    const totals = monthTotals(rows, MONTH, PAYDAY);
    assert.equal(totals.income, rs(100_000));
    assert.equal(totals.spent, rs(20_000));
    assert.equal(totals.invested, rs(30_000));
    assert.equal(totals.transferred, rs(5000));
    assert.equal(totals.expenseCount, 1);
  });

  test("a refund nets against spending rather than counting as income", () => {
    const rows = [
      expense({ amount: rs(5000), date: at("2026-07-25") }),
      income({ amount: rs(2000), isRefund: true, date: at("2026-07-28") }),
    ];
    const totals = monthTotals(rows, MONTH, PAYDAY);
    assert.equal(totals.spent, rs(3000));
    assert.equal(totals.income, 0);
  });

  test("a refund arriving after the purchase's cycle can push spent negative", () => {
    // The honest figure: this cycle really did see money come back and none
    // go out. Clamping it to zero would hide the refund entirely.
    const rows = [income({ amount: rs(2000), isRefund: true, date: at("2026-07-28") })];
    assert.equal(monthTotals(rows, MONTH, PAYDAY).spent, rs(-2000));
  });

  test("a reconciliation adjustment is neither income nor spending", () => {
    // It corrects a balance that drifted. Counting it would distort the
    // monthly surplus and every insight built on these totals.
    const rows = [
      income({ amount: rs(8000), categoryId: "adjustment", date: at("2026-07-25") }),
      expense({ amount: rs(3000), categoryId: "adjustment", date: at("2026-07-26") }),
      expense({ amount: rs(1000), date: at("2026-07-27") }),
    ];
    const totals = monthTotals(rows, MONTH, PAYDAY);
    assert.equal(totals.income, 0);
    assert.equal(totals.spent, rs(1000));
    assert.equal(totals.expenseCount, 1);
  });

  test("rows outside the cycle are ignored entirely", () => {
    const rows = [expense({ amount: rs(99_999), date: at("2026-06-01") })];
    assert.equal(monthTotals(rows, MONTH, PAYDAY).spent, 0);
  });

  test("an empty ledger reports zeros, not NaN", () => {
    const totals = monthTotals([], MONTH, PAYDAY);
    assert.equal(totals.income, 0);
    assert.equal(totals.spent, 0);
    assert.equal(totals.expenseCount, 0);
  });
});

describe("spend breakdowns", () => {
  const rows = [
    expense({ categoryId: "dining", amount: rs(3000), merchant: "Swiggy", date: at("2026-07-25") }),
    expense({ categoryId: "dining", amount: rs(2000), merchant: "Swiggy", date: at("2026-07-26") }),
    expense({ categoryId: "transport", amount: rs(1000), merchant: "Uber", date: at("2026-07-27") }),
    investmentTxn({ amount: rs(50_000), date: at("2026-07-28") }),
  ];

  test("spendByCategory sums expenses only, largest first", () => {
    // Takes an already-filtered slice plus a label lookup — it does no month
    // filtering of its own.
    const slices = spendByCategory(monthTransactions(rows, MONTH, PAYDAY), (id) => id);
    assert.equal(slices[0]?.amount, rs(5000));
    assert.equal(slices[0]?.count, 2);
    assert.equal(slices[1]?.amount, rs(1000));
    assert.equal(
      slices.reduce((acc, s) => acc + s.amount, 0),
      rs(6000),
      "an investment must never appear in a spending breakdown",
    );
  });

  test("spendByMerchant groups repeat visits", () => {
    const slices = spendByMerchant(rows);
    const swiggy = slices.find((s) => s.label.toLowerCase() === "swiggy");
    assert.equal(swiggy?.amount, rs(5000));
    assert.equal(swiggy?.count, 2);
  });
});

describe("patterns", () => {
  test("weekendSplit separates Saturday and Sunday spending", () => {
    const rows = [
      expense({ amount: rs(4000), date: at("2026-08-08") }), // Saturday
      expense({ amount: rs(1000), date: at("2026-08-10") }), // Monday
    ];
    const split = weekendSplit(rows);
    assert.equal(split.weekend, rs(4000));
    assert.equal(split.weekday, rs(1000));
  });

  test("shareAfterHour measures late-night spending", () => {
    const rows = [
      expense({ amount: rs(3000), date: at("2026-08-01", 23) }),
      expense({ amount: rs(1000), date: at("2026-08-02", 13) }),
    ];
    assert.equal(shareAfterHour(rows, 22), 75);
  });

  test("averageTransactionSize ignores non-expenses", () => {
    const rows = [
      expense({ amount: rs(1000) }),
      expense({ amount: rs(3000) }),
      transfer({ amount: rs(100_000) }),
    ];
    assert.equal(averageTransactionSize(rows), rs(2000));
  });

  test("averageTransactionSize of nothing is zero, not NaN", () => {
    assert.equal(averageTransactionSize([]), 0);
  });

  test("outlierTransactions finds the unusually large ones", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => expense({ amount: rs(500) })),
      expense({ amount: rs(50_000), description: "Flight" }),
    ];
    const outliers = outlierTransactions(rows);
    assert.ok(outliers.some((t) => t.description === "Flight"));
    assert.ok(!outliers.some((t) => t.amount === rs(500)));
  });

  test("spendingVelocity divides by days elapsed, never by zero", () => {
    const rows = [expense({ amount: rs(18_000), date: at("2026-07-24") })];
    const velocity = spendingVelocity(rows, MONTH, new Date(2026, 7, 10), PAYDAY);
    assert.equal(velocity.perDay, rs(1000)); // 18 days elapsed
    assert.ok(Number.isFinite(velocity.perDay));
  });

  test("compareToAverage reports no baseline rather than an invented one", () => {
    // No history at all: the UI must say "no history yet", not "+∞%".
    const result = compareToAverage([], MONTH, () => true, 3, PAYDAY);
    assert.equal(result.percentChange, null);
    assert.equal(result.monthsCounted, 0);
  });

  test("compareToAverage averages only the months that had activity", () => {
    const rows = [
      expense({ amount: rs(2000), date: at("2026-06-25") }),
      expense({ amount: rs(4000), date: at("2026-05-25") }),
      expense({ amount: rs(6000), date: at("2026-07-25") }),
    ];
    const result = compareToAverage(rows, MONTH, () => true, 3, PAYDAY);
    assert.equal(result.current, rs(6000));
    assert.equal(result.average, rs(3000));
    assert.equal(result.monthsCounted, 2);
    assert.equal(result.percentChange, 100);
  });
});
