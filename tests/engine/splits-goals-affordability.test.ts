import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { personBalances } from "@/lib/engine/splits";
import { monthsToGoal, projectGoal } from "@/lib/engine/goals";
import { evaluateAffordability } from "@/lib/engine/affordability";
import { calculateSafeToSpend } from "@/lib/engine/safe-to-spend";

import {
  expense,
  makeAccount,
  makeGoal,
  makePerson,
  makeSplit,
  rs,
} from "../helpers/factories";

const PAYDAY = 24;
const MONTH = "2026-07-24";
const NOW = new Date(2026, 7, 10);

describe("personBalances", () => {
  test("nets what they owe you against what you owe them", () => {
    const person = makePerson();
    const splits = [
      makeSplit({ personId: person.id, direction: "OWED_TO_ME", amount: rs(1200) }),
      makeSplit({ personId: person.id, direction: "I_OWE", amount: rs(500) }),
    ];
    const [balance] = personBalances([person], splits);
    assert.equal(balance?.owedToMe, rs(1200));
    assert.equal(balance?.iOwe, rs(500));
    assert.equal(balance?.netAmount, rs(700));
  });

  test("a settled split carries no balance", () => {
    const person = makePerson();
    const splits = [
      makeSplit({ personId: person.id, amount: rs(1200), status: "SETTLED" }),
    ];
    const [balance] = personBalances([person], splits);
    assert.equal(balance?.netAmount, 0);
    assert.deepEqual(balance?.outstandingSplits, []);
  });

  test("owing more than you're owed reads as a negative net", () => {
    const person = makePerson();
    const splits = [
      makeSplit({ personId: person.id, direction: "I_OWE", amount: rs(2000) }),
    ];
    assert.equal(personBalances([person], splits)[0]?.netAmount, rs(-2000));
  });

  test("another person's splits never leak in", () => {
    const me = makePerson({ name: "Riya" });
    const other = makePerson({ name: "Sam" });
    const splits = [makeSplit({ personId: other.id, amount: rs(5000) })];
    assert.equal(personBalances([me], splits)[0]?.netAmount, 0);
  });

  test("inactive people are excluded", () => {
    const gone = makePerson({ isActive: false });
    assert.deepEqual(personBalances([gone], []), []);
  });
});

describe("monthsToGoal", () => {
  test("rounds up — a part-month still needs the whole month", () => {
    const goal = makeGoal({ targetAmount: rs(100_000), currentAmount: 0 });
    assert.equal(monthsToGoal(goal, rs(30_000)), 4);
  });

  test("an already-funded goal needs no months", () => {
    const goal = makeGoal({ targetAmount: rs(100_000), currentAmount: rs(100_000) });
    assert.equal(monthsToGoal(goal, rs(10_000)), 0);
  });

  test("no contribution means no timeline — null, never Infinity", () => {
    // Infinity leaking into the UI would render as "Infinity months".
    const goal = makeGoal({ targetAmount: rs(100_000) });
    assert.equal(monthsToGoal(goal, 0), null);
    assert.equal(monthsToGoal(goal, rs(-500)), null);
  });
});

describe("projectGoal", () => {
  test("a funded goal says so", () => {
    const goal = makeGoal({ targetAmount: rs(100_000), currentAmount: rs(100_000) });
    assert.equal(projectGoal(goal, { projectedSurplus: 0 }), "Fully funded.");
  });

  test("a real contribution produces a firm timeline", () => {
    const goal = makeGoal({ targetAmount: rs(120_000), monthlyContribution: rs(10_000) });
    const text = projectGoal(goal, { projectedSurplus: 0 });
    assert.match(text ?? "", /12 months/);
  });

  test("with no contribution and no surplus it asks rather than guesses", () => {
    // The file's governing rule: only make a recommendation the data supports.
    const goal = makeGoal({ targetAmount: rs(100_000), monthlyContribution: 0 });
    const text = projectGoal(goal, { projectedSurplus: 0 });
    assert.match(text ?? "", /Set a monthly amount/);
  });

  test("a projected surplus gives an explicitly tentative estimate", () => {
    const goal = makeGoal({ targetAmount: rs(100_000), monthlyContribution: 0 });
    const text = projectGoal(goal, { projectedSurplus: rs(20_000) });
    assert.match(text ?? "", /about 5 months/);
  });

  test("a trim is only suggested when it would genuinely help", () => {
    const goal = makeGoal({ targetAmount: rs(120_000), monthlyContribution: rs(10_000) });
    const withTiny = projectGoal(goal, {
      projectedSurplus: 0,
      topCategory: { id: "dining", label: "Dining", amount: rs(100), count: 1, share: 5 },
    });
    assert.ok(!/Trimming/.test(withTiny ?? ""), "must not suggest trimming ₹100");
  });
});

describe("evaluateAffordability", () => {
  function safeWith(openingBalance: number, spent = 0) {
    const account = makeAccount({ openingBalance: rs(openingBalance) });
    return calculateSafeToSpend({
      transactions: spent > 0 ? [expense({ accountId: account.id, amount: rs(spent) })] : [],
      accounts: [account],
      incomeSources: [],
      investments: [],
      recurring: [],
      goals: [],
      month: MONTH,
      now: NOW,
      cycleStartDay: PAYDAY,
    });
  }

  test("a small purchase against a healthy balance is comfortable", () => {
    const result = evaluateAffordability(rs(1000), safeWith(100_000));
    assert.equal(result.verdict, "yes");
    assert.equal(result.breaksCommitments, false);
  });

  test("a purchase larger than what's left is refused", () => {
    const result = evaluateAffordability(rs(200_000), safeWith(100_000));
    assert.equal(result.verdict, "no");
    assert.equal(result.breaksCommitments, true);
    assert.ok(result.safeAfter < 0);
  });

  test("already underwater refuses before even considering the amount", () => {
    const safe = calculateSafeToSpend({
      transactions: [],
      accounts: [makeAccount({ openingBalance: rs(-5000) })],
      incomeSources: [],
      investments: [],
      recurring: [],
      goals: [],
      month: MONTH,
      now: NOW,
      cycleStartDay: PAYDAY,
    });
    const result = evaluateAffordability(rs(100), safe);
    assert.equal(result.verdict, "no");
    assert.equal(result.projectedDaily, 0);
  });

  test("a purchase that guts the daily allowance is flagged as tight", () => {
    const result = evaluateAffordability(rs(19_000), safeWith(20_000));
    assert.equal(result.verdict, "tight");
    assert.equal(result.breaksCommitments, false, "tight is not the same as broken");
  });

  test("the verdict always comes with a usable explanation", () => {
    for (const amount of [rs(100), rs(19_000), rs(200_000)]) {
      const result = evaluateAffordability(amount, safeWith(20_000));
      assert.ok(result.headline.length > 0);
      assert.ok(result.explanation.length > 0);
    }
  });

  test("safeAfter is always the safe amount minus the purchase", () => {
    const safe = safeWith(100_000);
    const result = evaluateAffordability(rs(30_000), safe);
    assert.equal(result.safeAfter, safe.safeAmount - rs(30_000));
  });

  test("it inherits the cash basis rather than an income basis", () => {
    // Because it reads safeAmount, the cash-based fix carries through for
    // free — "can I afford this?" is answered against real money.
    const spent = safeWith(100_000, 40_000);
    assert.equal(spent.safeAmount, rs(60_000));
    assert.equal(evaluateAffordability(rs(60_000), spent).safeAfter, 0);
  });
});
