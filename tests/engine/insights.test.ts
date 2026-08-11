import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  calculateFinancialScore,
  generateInsights,
  headlineInsight,
  type InsightInput,
} from "@/lib/engine/insights";
import { detectRecurringCandidates } from "@/lib/engine/recurring-detection";
import { spendingConsistency } from "@/lib/engine/analytics";
import { makeContext } from "@/lib/domain/contexts";

import {
  at,
  expense,
  income,
  investmentTxn,
  makeAccount,
  makeCard,
  makeGoal,
  makeInvestment,
  makeRecurring,
  rs,
} from "../helpers/factories";

/**
 * Insights make claims about someone's money. The rule that governs them is
 * the same one that governs goal projections: only say something the data
 * actually supports. So the tests that matter most are the negative ones —
 * that an empty or thin ledger produces silence rather than invented advice.
 */

const PAYDAY = 24;
const MONTH = "2026-07-24";
const NOW = new Date(2026, 7, 10);
const bank = makeAccount({ openingBalance: rs(50_000) });

function insightsFor(overrides: Partial<InsightInput> = {}) {
  return generateInsights({
    transactions: [],
    accounts: [bank],
    goals: [],
    investments: [],
    month: MONTH,
    now: NOW,
    cycleStartDay: PAYDAY,
    groupLabel: (id) => id,
    ...overrides,
  });
}

describe("generateInsights", () => {
  test("an empty ledger produces no insights rather than throwing", () => {
    assert.deepEqual(insightsFor(), []);
  });

  test("a single small transaction is not enough to claim anything", () => {
    const out = insightsFor({ transactions: [expense({ amount: rs(50), date: at("2026-08-01") })] });
    assert.deepEqual(out, []);
  });

  test("every insight is drillable and self-explanatory", () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) =>
        expense({
          amount: rs(400),
          merchant: "Starbucks",
          categoryId: "dining.coffee",
          date: at("2026-08-01", 9 + (i % 8)),
        }),
      ),
      income({ amount: rs(250_000), date: at("2026-07-24") }),
    ];
    const out = insightsFor({ transactions: rows });
    for (const insight of out) {
      assert.ok(insight.title.length > 0, `${insight.kind} has no title`);
      assert.ok(insight.body.length > 0, `${insight.kind} has no body`);
      assert.ok(insight.eyebrow.length > 0, `${insight.kind} has no eyebrow`);
      assert.ok(Array.isArray(insight.transactions));
    }
  });

  test("insight ids are unique so React keys never collide", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      expense({
        amount: rs(500),
        merchant: i % 2 ? "Swiggy" : "Uber",
        categoryId: i % 2 ? "dining" : "transport",
        date: at("2026-08-0" + ((i % 8) + 1), 23),
        contexts: [makeContext("friends")],
      }),
    );
    const out = insightsFor({ transactions: rows });
    const ids = out.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("a frequency leak is spotted from many small repeats", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      expense({
        amount: rs(300),
        merchant: "Starbucks",
        categoryId: "dining.coffee",
        date: at(`2026-08-${String((i % 9) + 1).padStart(2, "0")}`),
      }),
    );
    const out = insightsFor({ transactions: rows });
    assert.ok(
      out.some((i) => i.kind === "frequency" || i.kind === "merchant"),
      "15 coffees should surface as a pattern",
    );
  });

  test("a large card balance surfaces as a commitment", () => {
    const card = makeCard();
    const rows = [expense({ accountId: card.id, amount: rs(80_000), date: at("2026-08-01") })];
    const out = insightsFor({ transactions: rows, accounts: [bank, card] });
    assert.ok(out.some((i) => i.kind === "credit-commitment"));
  });

  test("headlineInsight picks the highest priority", () => {
    const rows = Array.from({ length: 15 }, () =>
      expense({ amount: rs(2000), merchant: "Swiggy", categoryId: "dining", date: at("2026-08-01", 23) }),
    );
    const out = insightsFor({ transactions: rows });
    const headline = headlineInsight(out);
    if (out.length > 0) {
      assert.ok(headline);
      assert.equal(headline.priority, Math.max(...out.map((i) => i.priority)));
    }
  });

  test("headlineInsight of nothing is undefined, not a crash", () => {
    assert.equal(headlineInsight([]), undefined);
  });
});

describe("calculateFinancialScore", () => {
  function scoreFor(transactions = [] as ReturnType<typeof expense>[]) {
    return calculateFinancialScore({
      transactions,
      accounts: [bank],
      goals: [],
      month: MONTH,
      now: NOW,
      cycleStartDay: PAYDAY,
      consistency: spendingConsistency(transactions, MONTH, NOW, PAYDAY),
    });
  }

  test("stays within 0–100 for an empty ledger", () => {
    const result = scoreFor();
    assert.ok(result.score >= 0 && result.score <= 100, `score was ${result.score}`);
    assert.ok(Number.isFinite(result.score));
  });

  test("stays within 0–100 for a healthy month", () => {
    const rows = [
      income({ amount: rs(250_000), date: at("2026-07-24") }),
      investmentTxn({ amount: rs(75_000), date: at("2026-07-25") }),
      expense({ amount: rs(50_000), date: at("2026-08-01") }),
    ];
    const result = scoreFor(rows);
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  test("stays within 0–100 for a month that overspent badly", () => {
    const rows = [
      income({ amount: rs(50_000), date: at("2026-07-24") }),
      expense({ amount: rs(400_000), date: at("2026-08-01") }),
    ];
    const result = scoreFor(rows);
    assert.ok(result.score >= 0 && result.score <= 100, `score was ${result.score}`);
  });

  test("a better month scores at least as well as a worse one", () => {
    const good = scoreFor([
      income({ amount: rs(250_000), date: at("2026-07-24") }),
      investmentTxn({ amount: rs(75_000), date: at("2026-07-25") }),
      expense({ amount: rs(50_000), date: at("2026-08-01") }),
    ]);
    const bad = scoreFor([
      income({ amount: rs(250_000), date: at("2026-07-24") }),
      expense({ amount: rs(245_000), date: at("2026-08-01") }),
    ]);
    assert.ok(good.score >= bad.score, `${good.score} should beat ${bad.score}`);
  });

  test("the score is never a black box — every factor is explained", () => {
    const result = scoreFor([income({ amount: rs(250_000), date: at("2026-07-24") })]);
    assert.ok(result.factors.length > 0);
    for (const factor of result.factors) {
      assert.ok(factor.label.length > 0);
      assert.ok(factor.detail.length > 0);
      assert.ok(factor.score >= 0 && factor.score <= 100, `${factor.id}: ${factor.score}`);
      assert.ok(["Excellent", "Good", "Fair", "Needs attention"].includes(factor.rating));
    }
    assert.ok(result.summary.length > 0);
  });
});

describe("detectRecurringCandidates", () => {
  const monthly = (month: number, amount: number) =>
    expense({
      merchant: "Netflix",
      categoryId: "bills",
      amount: rs(amount),
      date: at(`2026-0${month}-05`),
    });

  test("three months of the same charge is a candidate", () => {
    const rows = [monthly(6, 649), monthly(7, 649), monthly(8, 649)];
    const out = detectRecurringCandidates(rows, [], NOW);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.merchant, "Netflix");
    assert.equal(out[0]?.suggestedFrequency, "MONTHLY");
    assert.equal(out[0]?.suggestedAmount, rs(649));
  });

  test("two occurrences are not yet a pattern", () => {
    const out = detectRecurringCandidates([monthly(7, 649), monthly(8, 649)], [], NOW);
    assert.deepEqual(out, []);
  });

  test("a small price rise is tolerated and the latest amount suggested", () => {
    // What you'd actually be charged next, not an average of history.
    const rows = [monthly(6, 649), monthly(7, 649), monthly(8, 699)];
    const out = detectRecurringCandidates(rows, [], NOW);
    assert.equal(out[0]?.suggestedAmount, rs(699));
  });

  test("wildly different amounts are not a subscription", () => {
    const rows = [monthly(6, 200), monthly(7, 4000), monthly(8, 900)];
    assert.deepEqual(detectRecurringCandidates(rows, [], NOW), []);
  });

  test("an existing rule stops the same charge being suggested again", () => {
    const rows = [monthly(6, 649), monthly(7, 649), monthly(8, 649)];
    const rule = makeRecurring({ description: "Netflix", merchant: "Netflix", amount: rs(649) });
    assert.deepEqual(detectRecurringCandidates(rows, [rule], NOW), []);
  });

  test("a description-grouped candidate is also excluded once promoted", () => {
    // Without matching on description too, "Add as recurring" never stopped
    // a merchant-less candidate being suggested again.
    const rows = [6, 7, 8].map((m) =>
      expense({
        description: "Gym membership",
        merchant: undefined,
        amount: rs(2000),
        date: at(`2026-0${m}-05`),
      }),
    );
    const found = detectRecurringCandidates(rows, [], NOW);
    assert.equal(found.length, 1);
    const rule = makeRecurring({ description: "Gym membership", merchant: undefined });
    assert.deepEqual(detectRecurringCandidates(rows, [rule], NOW), []);
  });

  test("an empty ledger yields no candidates", () => {
    assert.deepEqual(detectRecurringCandidates([], [], NOW), []);
  });

  test("weekly charges are detected as weekly", () => {
    const rows = [1, 8, 15, 22].map((day) =>
      expense({
        merchant: "Laundry",
        amount: rs(500),
        date: at(`2026-07-${String(day).padStart(2, "0")}`),
      }),
    );
    const out = detectRecurringCandidates(rows, [], NOW);
    assert.equal(out[0]?.suggestedFrequency, "WEEKLY");
  });
});
