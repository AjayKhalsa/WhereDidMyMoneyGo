import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { calculateFinancialScore, type ScoreInput } from "@/lib/engine/insights";
import { spendingConsistency } from "@/lib/engine/analytics";
import type { Transaction } from "@/lib/domain/types";

import {
  at,
  expense,
  income,
  investmentTxn,
  makeAccount,
  makeCard,
  makeCardDetail,
  makeGoal,
  rs,
  transfer,
} from "../helpers/factories";

/**
 * The financial score.
 *
 * Every test here pins a defect the score actually had. It was a single-cycle
 * snapshot that divided by income which may not have arrived, counted the
 * same invested rupee twice across two factors weighted 40% between them,
 * treated ordinary credit-card use as debt, and dropped when you set a goal.
 */

const PAYDAY = 24;
const MONTH = "2026-07-24";
const NOW = new Date(2026, 7, 10); // 10 Aug, 18 days into the cycle
const SALARY = rs(250_000);

const bank = makeAccount({ openingBalance: rs(50_000) });

function scoreFor(overrides: Partial<ScoreInput> = {}) {
  const transactions = overrides.transactions ?? [];
  return calculateFinancialScore({
    transactions,
    accounts: [bank],
    creditCards: [],
    goals: [],
    month: MONTH,
    now: NOW,
    cycleStartDay: PAYDAY,
    consistency: spendingConsistency(transactions, MONTH, NOW, PAYDAY),
    incomeBasis: SALARY,
    netWorthNow: rs(100_000),
    netWorthAtCycleStart: rs(100_000),
    ...overrides,
  });
}

const factor = (result: ReturnType<typeof scoreFor>, id: string) =>
  result.factors.find((f) => f.id === id);

describe("bounds and structure", () => {
  test("stays within 0–100 on an empty ledger", () => {
    const result = scoreFor();
    assert.ok(result.score >= 0 && result.score <= 100, `score was ${result.score}`);
    assert.ok(Number.isFinite(result.score));
  });

  test("stays within 0–100 for a month that overspent badly", () => {
    const result = scoreFor({
      transactions: [
        income({ amount: rs(50_000), date: at("2026-07-24") }),
        expense({ amount: rs(400_000), date: at("2026-08-01") }),
      ],
      incomeBasis: rs(50_000),
      netWorthNow: rs(-200_000),
      netWorthAtCycleStart: rs(100_000),
    });
    assert.ok(result.score >= 0 && result.score <= 100, `score was ${result.score}`);
  });

  test("weights sum to exactly 1", () => {
    const total = scoreFor().factors.reduce((acc, f) => acc + f.weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `weights summed to ${total}`);
  });

  test("every factor is explained and in range", () => {
    const result = scoreFor({
      transactions: [income({ amount: SALARY, date: at("2026-07-24") })],
    });
    assert.ok(result.factors.length > 0);
    for (const f of result.factors) {
      assert.ok(f.label.length > 0, `${f.id} has no label`);
      assert.ok(f.detail.length > 0, `${f.id} has no detail`);
      assert.ok(f.score >= 0 && f.score <= 100, `${f.id}: ${f.score}`);
      assert.ok(["Excellent", "Good", "Fair", "Needs attention"].includes(f.rating));
    }
    assert.ok(result.summary.length > 0);
  });

  test("a good month beats a bad one", () => {
    const good = scoreFor({
      transactions: [
        income({ amount: SALARY, date: at("2026-07-24") }),
        investmentTxn({ amount: rs(75_000), date: at("2026-07-25") }),
        expense({ amount: rs(50_000), date: at("2026-08-01") }),
      ],
      netWorthNow: rs(150_000),
      netWorthAtCycleStart: rs(100_000),
    });
    const bad = scoreFor({
      transactions: [
        income({ amount: SALARY, date: at("2026-07-24") }),
        expense({ amount: rs(245_000), date: at("2026-08-01") }),
      ],
      netWorthNow: rs(95_000),
      netWorthAtCycleStart: rs(100_000),
    });
    assert.ok(good.score > bad.score, `${good.score} should beat ${bad.score}`);
  });
});

describe("payday morning", () => {
  test("an income basis with nothing received yet does not collapse the score", () => {
    // The original bug: every ratio divided by *actual* income, so at 00:01
    // on payday `commitmentScore` fell to 0 and investment and savings with
    // it — a score that cratered and recovered hours later, unprompted.
    const result = scoreFor({ transactions: [], incomeBasis: SALARY });
    assert.ok(result.score > 40, `score was ${result.score} before salary landed`);
    assert.ok((factor(result, "commitments")?.score ?? 0) > 90);
  });

  test("the score barely moves when the same salary actually lands", () => {
    const before = scoreFor({ transactions: [] });
    const after = scoreFor({
      transactions: [income({ amount: SALARY, date: at("2026-07-24") })],
    });
    assert.ok(
      Math.abs(after.score - before.score) < 10,
      `moved ${before.score} → ${after.score} on pay arriving alone`,
    );
  });

  test("with no income basis at all it still returns a usable number", () => {
    const result = scoreFor({ incomeBasis: 0, transactions: [] });
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.ok(Number.isFinite(result.score));
  });
});

describe("investing counts once, not twice", () => {
  test("savings measures what was kept beyond what was invested", () => {
    // `spent` already excludes investments, so the old
    // `(income − spent) / income` let one invested rupee lift both the
    // investment and savings factors — 40% of the score, doubled.
    // Spending enough to keep both rates below their ceilings, so the
    // comparison isn't hidden by clamping at 100.
    const invested = scoreFor({
      transactions: [
        income({ amount: SALARY, date: at("2026-07-24") }),
        expense({ amount: rs(150_000), date: at("2026-07-26") }),
        investmentTxn({ amount: rs(50_000), date: at("2026-07-25") }),
      ],
    });
    const hoarded = scoreFor({
      transactions: [
        income({ amount: SALARY, date: at("2026-07-24") }),
        expense({ amount: rs(150_000), date: at("2026-07-26") }),
      ],
    });
    // Investing lifts the investment factor...
    assert.ok(
      (factor(invested, "investment")?.score ?? 0) >
        (factor(hoarded, "investment")?.score ?? 0),
    );
    // ...and must *not* also lift savings, which now nets it off.
    assert.ok(
      (factor(invested, "savings")?.score ?? 0) <
        (factor(hoarded, "savings")?.score ?? 0),
    );
  });
});

describe("smoothing over recent cycles", () => {
  const steady = (key: string) => [
    income({ amount: SALARY, date: at(`${key}-24`) }),
    investmentTxn({ amount: rs(50_000), date: at(`${key}-25`) }),
    expense({ amount: rs(80_000), date: at(`${key}-26`) }),
  ];

  test("one anomalous cycle moves a smoothed score less than an isolated one", () => {
    const history: Transaction[] = [...steady("2026-05"), ...steady("2026-06")];

    // A big one-off purchase inside the current cycle.
    const anomalous = [
      ...history,
      income({ amount: SALARY, date: at("2026-07-24") }),
      expense({ amount: rs(220_000), date: at("2026-08-01") }),
    ];
    const withHistory = scoreFor({ transactions: anomalous });
    // The same anomalous cycle with no prior cycles to average against.
    const withoutHistory = scoreFor({
      transactions: [
        income({ amount: SALARY, date: at("2026-07-24") }),
        expense({ amount: rs(220_000), date: at("2026-08-01") }),
      ],
    });
    assert.ok(
      withHistory.score > withoutHistory.score,
      `history should cushion the blow: ${withHistory.score} vs ${withoutHistory.score}`,
    );
  });

  test("the detail says how many cycles were averaged", () => {
    const result = scoreFor({
      transactions: [...steady("2026-06"), ...steady("2026-07")],
    });
    assert.match(factor(result, "investment")?.detail ?? "", /cycles?/);
  });
});

describe("card debt is what you carry, not what you charge", () => {
  const card = makeCard({ name: "HSBC" });
  const detail = makeCardDetail({ accountId: card.id, statementDay: 25, dueDay: 9 });

  test("charging a card and clearing the statement scores well", () => {
    // The old measure used lifetime outstanding against one month's income at
    // ×250, so paying in full every month still scored zero.
    const rows = [
      income({ amount: SALARY, date: at("2026-07-24") }),
      expense({ accountId: card.id, amount: rs(60_000), date: at("2026-07-01") }),
      transfer({
        accountId: bank.id,
        toAccountId: card.id,
        amount: rs(60_000),
        date: at("2026-07-27"),
      }),
    ];
    const result = scoreFor({
      transactions: rows,
      accounts: [bank, card],
      creditCards: [detail],
    });
    assert.ok(
      (factor(result, "commitments")?.score ?? 0) > 90,
      "a statement paid in full is not debt",
    );
  });

  test("a genuinely unpaid statement is penalised", () => {
    const rows = [
      income({ amount: SALARY, date: at("2026-07-24") }),
      expense({ accountId: card.id, amount: rs(150_000), date: at("2026-07-01") }),
    ];
    const result = scoreFor({
      transactions: rows,
      accounts: [bank, card],
      creditCards: [detail],
    });
    assert.ok(
      (factor(result, "commitments")?.score ?? 100) < 40,
      "carrying most of a month's income on a card should hurt",
    );
  });

  test("this cycle's un-billed spending is not counted as carried debt", () => {
    // Charges since the last statement closed aren't owed yet.
    const rows = [
      income({ amount: SALARY, date: at("2026-07-24") }),
      expense({ accountId: card.id, amount: rs(40_000), date: at("2026-08-05") }),
    ];
    const result = scoreFor({
      transactions: rows,
      accounts: [bank, card],
      creditCards: [detail],
    });
    assert.ok((factor(result, "commitments")?.score ?? 0) > 90);
  });
});

describe("goals", () => {
  test("adding a goal does not lower the score", () => {
    // `goalScore` used to average absolute % funded, so a fresh 0%-funded
    // goal dragged the average down — punishing the exact behaviour the
    // feature exists to encourage.
    const rows = [income({ amount: SALARY, date: at("2026-07-24") })];
    const without = scoreFor({ transactions: rows });
    const withGoal = scoreFor({
      transactions: rows,
      goals: [makeGoal({ targetAmount: rs(500_000), currentAmount: 0 })],
    });
    assert.ok(
      withGoal.score >= without.score,
      `${without.score} → ${withGoal.score} after adding a goal`,
    );
  });

  test("funding a goal this cycle scores well", () => {
    const goal = makeGoal({ targetAmount: rs(500_000), monthlyContribution: rs(10_000) });
    const result = scoreFor({
      transactions: [
        income({ amount: SALARY, date: at("2026-07-24") }),
        transfer({ goalId: goal.id, amount: rs(10_000), date: at("2026-07-30") }),
      ],
      goals: [goal],
    });
    assert.equal(factor(result, "goals")?.score, 100);
  });

  test("a planned contribution left unfunded scores zero", () => {
    const goal = makeGoal({ targetAmount: rs(500_000), monthlyContribution: rs(10_000) });
    const result = scoreFor({
      transactions: [income({ amount: SALARY, date: at("2026-07-24") })],
      goals: [goal],
    });
    assert.equal(factor(result, "goals")?.score, 0);
  });

  test("a goal with no monthly amount is neutral rather than a failure", () => {
    const result = scoreFor({
      transactions: [income({ amount: SALARY, date: at("2026-07-24") })],
      goals: [makeGoal({ targetAmount: rs(500_000), monthlyContribution: 0 })],
    });
    assert.match(factor(result, "goals")?.detail ?? "", /No monthly goal amount/);
  });
});

describe("net worth trend", () => {
  test("growing net worth scores above flat, which scores above shrinking", () => {
    const rows = [income({ amount: SALARY, date: at("2026-07-24") })];
    const up = scoreFor({
      transactions: rows,
      netWorthNow: rs(200_000),
      netWorthAtCycleStart: rs(100_000),
    });
    const flat = scoreFor({ transactions: rows });
    const down = scoreFor({
      transactions: rows,
      netWorthNow: rs(50_000),
      netWorthAtCycleStart: rs(100_000),
    });
    assert.ok((factor(up, "net-worth")?.score ?? 0) > (factor(flat, "net-worth")?.score ?? 0));
    assert.ok((factor(flat, "net-worth")?.score ?? 0) > (factor(down, "net-worth")?.score ?? 0));
  });

  test("flat net worth sits in the middle rather than reading as failure", () => {
    assert.equal(factor(scoreFor(), "net-worth")?.score, 50);
  });
});

describe("pace", () => {
  test("it is neutral in the first days of a cycle", () => {
    // A month-end projection from two days of data is noise.
    const dayTwo = new Date(2026, 6, 25);
    const result = scoreFor({
      transactions: [expense({ amount: rs(5000), date: at("2026-07-25") })],
      now: dayTwo,
      consistency: 50,
    });
    assert.match(factor(result, "pace")?.detail ?? "", /Too early/);
  });

  test("it reports a projection once the cycle is under way", () => {
    const result = scoreFor({
      transactions: [
        income({ amount: SALARY, date: at("2026-07-24") }),
        expense({ amount: rs(20_000), date: at("2026-07-26") }),
      ],
    });
    assert.match(factor(result, "pace")?.detail ?? "", /On track for/);
  });
});
