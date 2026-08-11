import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  calculateSafeToSpend,
  expectedMonthlyIncome,
  goalAllocations,
  remainingPlannedInvestments,
  type SafeToSpendInput,
} from "@/lib/engine/safe-to-spend";
import type { Transaction } from "@/lib/domain/types";

import {
  at,
  expense,
  income,
  investmentTxn,
  makeAccount,
  makeCard,
  makeGoal,
  makeIncomeSource,
  makeInvestment,
  rs,
  transfer,
} from "../helpers/factories";

/**
 * Safe to spend is the app's headline number and the one that was most wrong:
 * it used to answer "how much of this cycle's income is unallocated", which
 * on real data read ₹56,395 while the user actually had ₹2,470 they could
 * spend. It is now a cash figure, and these tests pin the three properties
 * that make it trustworthy plus the identity that makes the monthly figure
 * checkable by hand against a bank statement.
 */

const PAYDAY = 24;
const MONTH = "2026-07-24";
const NOW = new Date(2026, 7, 10); // 10 Aug 2026, mid-cycle

const bank = makeAccount({ name: "HDFC", openingBalance: rs(26_231) });
const card = makeCard({ name: "HSBC" });

function calc(overrides: Partial<SafeToSpendInput> = {}) {
  return calculateSafeToSpend({
    transactions: [],
    accounts: [bank, card],
    incomeSources: [],
    investments: [],
    recurring: [],
    goals: [],
    month: MONTH,
    now: NOW,
    cycleStartDay: PAYDAY,
    ...overrides,
  });
}

describe("safeAmount is cash, not income minus expenses", () => {
  test("with no history it is simply the money in the bank", () => {
    assert.equal(calc().safeAmount, rs(26_231));
  });

  test("card debt is subtracted in full, whenever it was charged", () => {
    // Every rupee owed comes out of this same cash, even if the charge
    // belongs to a previous cycle. The old model held back only the part it
    // considered "carried", and was systematically optimistic as a result.
    const old = expense({
      accountId: card.id,
      amount: rs(19_301),
      date: at("2026-06-01"),
    });
    assert.equal(calc({ transactions: [old] }).safeAmount, rs(26_231 - 19_301));
  });

  test("the headline reads cash − cards = uncommitted", () => {
    const rows = [expense({ accountId: card.id, amount: rs(19_301) })];
    const result = calc({ transactions: rows });
    assert.equal(result.bankBalance, rs(26_231));
    assert.equal(result.cardOutstanding, rs(19_301));
    assert.equal(result.unencumberedCash, rs(6930));
    assert.equal(result.safeAmount, rs(6930));
  });
});

describe("the three no-double-counting invariants", () => {
  const base = calc().safeAmount;

  test("charging ₹1,000 to a card drops safe-to-spend exactly once", () => {
    const rows = [expense({ accountId: card.id, amount: rs(1000) })];
    assert.equal(calc({ transactions: rows }).safeAmount, base - rs(1000));
  });

  test("paying the card leaves safe-to-spend unchanged", () => {
    // The invariant the user asked for: cash falls and debt falls together,
    // so the number that matters does not move. Money stopped being theirs
    // when it was spent, not when the payment cleared.
    const rows: Transaction[] = [
      expense({ accountId: card.id, amount: rs(1000) }),
      transfer({ accountId: bank.id, toAccountId: card.id, amount: rs(1000) }),
    ];
    const result = calc({ transactions: rows });
    assert.equal(result.safeAmount, base - rs(1000));
    assert.equal(result.bankBalance, rs(25_231));
    assert.equal(result.cardOutstanding, 0);
  });

  test("spending ₹1,000 from the bank drops safe-to-spend exactly once", () => {
    const rows = [expense({ accountId: bank.id, amount: rs(1000) })];
    assert.equal(calc({ transactions: rows }).safeAmount, base - rs(1000));
  });

  test("an investment leaves the cash but is not double-counted as spending", () => {
    const rows = [investmentTxn({ accountId: bank.id, amount: rs(5000) })];
    assert.equal(calc({ transactions: rows }).safeAmount, base - rs(5000));
  });
});

describe("commitments still to come", () => {
  test("salary due but not yet landed is added back", () => {
    // Otherwise the app reads near-zero on payday morning and jumps hours
    // later, which trains people to distrust it.
    const sources = [makeIncomeSource({ amount: rs(300_000), deductions: rs(50_000) })];
    const result = calc({ incomeSources: sources });
    assert.equal(result.safeAmount, rs(26_231) + rs(250_000));
  });

  test("once pay lands the add-back disappears rather than doubling", () => {
    const sources = [makeIncomeSource({ amount: rs(250_000), deductions: 0 })];
    const salary = income({
      accountId: bank.id,
      amount: rs(250_000),
      date: at("2026-07-24"),
    });
    const result = calc({ incomeSources: sources, transactions: [salary] });
    assert.equal(result.bankBalance, rs(26_231) + rs(250_000));
    assert.equal(result.safeAmount, rs(26_231) + rs(250_000));
  });

  test("planned investments and goal money are held back", () => {
    const result = calc({
      investments: [makeInvestment({ monthlyContribution: rs(30_000) })],
      goals: [makeGoal({ monthlyContribution: rs(5000) })],
    });
    assert.equal(result.safeAmount, rs(26_231) - rs(35_000));
  });

  test("a goal already funded stops being held back", () => {
    const funded = makeGoal({
      monthlyContribution: rs(5000),
      currentAmount: rs(500_000),
      targetAmount: rs(500_000),
    });
    assert.equal(calc({ goals: [funded] }).safeAmount, rs(26_231));
  });

  test("safeAmount can go negative rather than clamping to zero", () => {
    const rows = [expense({ accountId: card.id, amount: rs(60_000) })];
    const result = calc({ transactions: rows });
    assert.ok(result.safeAmount < 0);
    assert.ok(result.isOverspent);
    assert.equal(result.dailyAllowance, 0, "no allowance when overspent");
  });
});

describe("monthlySurplus is a change, not a balance", () => {
  test("it is strictly income − invested − spent for the cycle", () => {
    const rows = [
      income({ accountId: bank.id, amount: rs(281_763), date: at("2026-07-24") }),
      investmentTxn({ accountId: bank.id, amount: rs(42_500), date: at("2026-07-25") }),
      expense({ accountId: bank.id, amount: rs(177_159), date: at("2026-07-28") }),
    ];
    const result = calc({ transactions: rows });
    assert.equal(result.monthlySurplus, rs(281_763 - 42_500 - 177_159));
  });

  test("it equals positionNow − positionAtCycleStart exactly", () => {
    // The property that makes the figure checkable against real statements.
    // "Exactly" is the point: it used to be 32 paise out.
    const rows = [
      income({ accountId: bank.id, amount: rs(281_763), date: at("2026-07-24") }),
      expense({ accountId: card.id, amount: rs(20_000), date: at("2026-07-26") }),
      expense({ accountId: bank.id, amount: rs(15_000), date: at("2026-08-01") }),
      transfer({
        accountId: bank.id,
        toAccountId: card.id,
        amount: rs(66_075),
        date: at("2026-08-02"),
      }),
      investmentTxn({ accountId: bank.id, amount: rs(42_500), date: at("2026-08-03") }),
    ];
    const result = calc({ transactions: rows });
    assert.equal(
      result.monthlySurplus,
      result.positionNow - result.positionAtCycleStart,
    );
  });

  test("the identity survives a card sitting on a credit", () => {
    // creditCardOutstanding clamps a credit away; netPosition must count it
    // in your favour or an overpaid card silently drops out of the identity.
    // This is the exact ₹0.32 hole found on the user's Axis Horizon card.
    const rows = [
      expense({ accountId: card.id, amount: rs(100), date: at("2026-06-01") }),
      transfer({
        accountId: bank.id,
        toAccountId: card.id,
        amount: rs(100.32),
        date: at("2026-07-30"),
      }),
    ];
    const result = calc({ transactions: rows });
    assert.equal(result.cardOutstanding, 0, "the card is in credit");
    assert.equal(
      result.monthlySurplus,
      result.positionNow - result.positionAtCycleStart,
    );
  });

  test("the identity holds with bills, goals and unreceived salary configured", () => {
    // The case that was silently broken before the surplus was made strictly
    // retrospective: forward-looking terms leaking into a "what happened"
    // figure made it unverifiable for anyone with commitments set up.
    const result = calc({
      transactions: [
        income({ accountId: bank.id, amount: rs(100_000), date: at("2026-07-24") }),
        expense({ accountId: bank.id, amount: rs(30_000), date: at("2026-08-01") }),
      ],
      incomeSources: [makeIncomeSource({ amount: rs(250_000) })],
      goals: [makeGoal({ monthlyContribution: rs(10_000) })],
      investments: [makeInvestment({ monthlyContribution: rs(20_000) })],
    });
    assert.equal(result.monthlySurplus, rs(70_000));
    assert.equal(
      result.monthlySurplus,
      result.positionNow - result.positionAtCycleStart,
    );
  });

  test("it can exceed the bank balance when the surplus cleared card debt", () => {
    // The user's own question: "how can my monthly surplus be more than my
    // liquid cash?" Because most of it went to paying down cards.
    const rows = [
      income({ accountId: bank.id, amount: rs(281_763), date: at("2026-07-24") }),
      expense({ accountId: card.id, amount: rs(52_953), date: at("2026-06-01") }),
      transfer({
        accountId: bank.id,
        toAccountId: card.id,
        amount: rs(52_953),
        date: at("2026-08-01"),
      }),
    ];
    const result = calc({ transactions: rows });
    assert.equal(result.cardDebtCleared, rs(52_953));
    assert.ok(result.monthlySurplus > result.bankBalance);
    assert.equal(
      result.monthlySurplus,
      result.positionNow - result.positionAtCycleStart,
    );
  });

  test("a reconciliation adjustment is the one deliberate exception", () => {
    // An adjustment says "my records were wrong", so it moves the position
    // without being cycle activity. Excluding it from income/spent is
    // correct; the identity gap is the honest consequence, not a bug.
    const rows = [
      income({
        accountId: bank.id,
        amount: rs(5000),
        categoryId: "adjustment",
        date: at("2026-08-01"),
      }),
    ];
    const result = calc({ transactions: rows });
    assert.equal(result.monthlySurplus, 0);
    assert.equal(result.positionNow - result.positionAtCycleStart, rs(5000));
  });
});

describe("carriedCardDebt is gone", () => {
  test("no breakdown line refers to carried card debt", () => {
    const rows = [expense({ accountId: card.id, amount: rs(6179), date: at("2026-06-01") })];
    const result = calc({ transactions: rows });
    const ids = [...result.breakdown, ...result.monthlySurplusBreakdown].map((l) => l.id);
    assert.ok(!ids.includes("carried-card"));
    assert.ok(!("carriedCardDebt" in result));
  });

  test("the cash breakdown leads with cash then card debt", () => {
    const result = calc({ transactions: [expense({ accountId: card.id, amount: rs(1000) })] });
    assert.equal(result.breakdown[0]?.id, "cash");
    assert.equal(result.breakdown[0]?.direction, "add");
    assert.equal(result.breakdown[1]?.id, "card-outstanding");
    assert.equal(result.breakdown[1]?.direction, "subtract");
  });

  test("each breakdown reconciles to its own total", () => {
    const result = calc({
      transactions: [expense({ accountId: card.id, amount: rs(1000) })],
      goals: [makeGoal({ monthlyContribution: rs(2000) })],
    });
    const sumOf = (lines: typeof result.breakdown) =>
      lines.reduce((acc, l) => acc + (l.direction === "add" ? l.amount : -l.amount), 0);
    assert.equal(sumOf(result.breakdown), result.safeAmount);
    assert.equal(sumOf(result.monthlySurplusBreakdown), result.monthlySurplus);
  });
});

describe("dailyAllowance", () => {
  test("spreads what's safe over the days that remain, including today", () => {
    const result = calc();
    assert.equal(result.remainingDays, 14); // 10 Aug within 24 Jul–23 Aug
    assert.equal(result.dailyAllowance, Math.floor(rs(26_231) / 14));
  });
});

describe("expectedMonthlyIncome", () => {
  test("nets deductions off the gross", () => {
    const sources = [makeIncomeSource({ amount: rs(300_000), deductions: rs(50_000) })];
    assert.equal(expectedMonthlyIncome(sources), rs(250_000));
  });

  test("ignores one-off and inactive sources", () => {
    const sources = [
      makeIncomeSource({ amount: rs(100_000), recurring: false }),
      makeIncomeSource({ amount: rs(100_000), isActive: false }),
    ];
    assert.equal(expectedMonthlyIncome(sources), 0);
  });

  test("never goes negative when deductions exceed the gross", () => {
    const sources = [makeIncomeSource({ amount: rs(1000), deductions: rs(5000) })];
    assert.equal(expectedMonthlyIncome(sources), 0);
  });
});

describe("remainingPlannedInvestments", () => {
  test("counts only what has not been contributed this cycle", () => {
    const inv = makeInvestment({ monthlyContribution: rs(30_000) });
    const rows = [
      investmentTxn({
        investmentId: inv.id,
        amount: rs(10_000),
        date: at("2026-07-30"),
      }),
    ];
    assert.equal(remainingPlannedInvestments([inv], rows, MONTH, PAYDAY), rs(20_000));
  });

  test("over-contributing does not create a negative reserve", () => {
    const inv = makeInvestment({ monthlyContribution: rs(10_000) });
    const rows = [
      investmentTxn({ investmentId: inv.id, amount: rs(25_000), date: at("2026-07-30") }),
    ];
    assert.equal(remainingPlannedInvestments([inv], rows, MONTH, PAYDAY), 0);
  });

  test("a contribution in another cycle does not count", () => {
    const inv = makeInvestment({ monthlyContribution: rs(10_000) });
    const rows = [
      investmentTxn({ investmentId: inv.id, amount: rs(10_000), date: at("2026-06-30") }),
    ];
    assert.equal(remainingPlannedInvestments([inv], rows, MONTH, PAYDAY), rs(10_000));
  });
});

describe("goalAllocations", () => {
  test("nets off contributions already made to that goal", () => {
    const goal = makeGoal({ monthlyContribution: rs(10_000) });
    const rows = [
      transfer({ goalId: goal.id, amount: rs(4000), date: at("2026-07-30") }),
    ];
    assert.equal(goalAllocations([goal], rows, MONTH, PAYDAY), rs(6000));
  });

  test("a fully funded goal reserves nothing", () => {
    const goal = makeGoal({
      monthlyContribution: rs(10_000),
      currentAmount: rs(500_000),
      targetAmount: rs(500_000),
    });
    assert.equal(goalAllocations([goal], [], MONTH, PAYDAY), 0);
  });
});
