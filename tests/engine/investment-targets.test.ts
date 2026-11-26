import assert from "node:assert/strict";
import test from "node:test";
import { hasCycleTarget, investmentTarget, validCycleTargets, withCycleTarget } from "@/lib/domain/investment-targets";
import { calculateSafeToSpend, remainingPlannedInvestments } from "@/lib/engine/safe-to-spend";
import { investmentContributions, portfolioValue } from "@/lib/engine/analytics";
import { budgetPerformance } from "@/lib/engine/budgets";
import { at, investmentTxn, makeAccount, makeInvestment, rs } from "../helpers/factories";
import type { Database } from "@/lib/domain/types";

const cycle = "2026-11-24";
test("a lower target affects only its salary cycle, including across calendar months", () => {
  const usual = makeInvestment({ monthlyContribution: rs(30000) });
  const custom = withCycleTarget(usual, cycle, rs(10000));
  const payment = investmentTxn({ investmentId: usual.id, amount: rs(10000), date: at("2026-12-02") });
  assert.equal(investmentTarget(custom, cycle), rs(10000));
  assert.equal(investmentTarget(custom, "2026-10-24"), rs(30000));
  assert.equal(investmentTarget(custom, "2026-12-24"), rs(30000));
  assert.equal(usual.cycleTargets, undefined);
  assert.equal(custom.monthlyContribution, rs(30000));
  assert.equal(remainingPlannedInvestments([custom], [payment], cycle, 24), 0);
  assert.equal(investmentContributions([custom], [payment], cycle, 24)[0]?.planned, rs(10000));
});

test("higher targets, pauses, overpayments and restoring the usual target preserve other months", () => {
  let investment = makeInvestment({ monthlyContribution: rs(30000) });
  investment = withCycleTarget(investment, "2026-10-24", rs(45000));
  investment = withCycleTarget(investment, cycle, 0);
  assert.equal(remainingPlannedInvestments([investment], [], "2026-10-24", 24), rs(45000));
  assert.equal(remainingPlannedInvestments([investment], [], cycle, 24), 0);
  assert.equal(hasCycleTarget(investment, cycle), true);
  const paid = investmentTxn({ investmentId: investment.id, amount: rs(40000), date: at("2026-12-01") });
  assert.equal(remainingPlannedInvestments([investment], [paid], cycle, 24), 0);
  investment = withCycleTarget(investment, cycle, null);
  assert.equal(hasCycleTarget(investment, cycle), false);
  assert.equal(investmentTarget(investment, cycle), rs(30000));
  assert.equal(investmentTarget(investment, "2026-10-24"), rs(45000));
  assert.equal(remainingPlannedInvestments([{ ...investment, isActive: false }], [], cycle, 24), 0);
});

test("only reserved cash changes: targets cannot change balances, actual investment or portfolio value", () => {
  const investment = makeInvestment({ monthlyContribution: rs(30000) });
  const payment = investmentTxn({ investmentId: investment.id, accountId: "bank", amount: rs(10000), date: at("2026-11-25") });
  const input = { accounts: [makeAccount({ id: "bank", openingBalance: rs(100000) })], transactions: [payment], investments: [investment], incomeSources: [], recurring: [], goals: [], month: cycle, now: new Date(2026,10,26), cycleStartDay: 24 };
  const before = calculateSafeToSpend(input);
  const custom = withCycleTarget(investment, cycle, rs(10000));
  const after = calculateSafeToSpend({ ...input, investments: [custom] });
  assert.equal(after.safeAmount - before.safeAmount, rs(20000));
  for (const key of ["bankBalance", "cardOutstanding", "investedSoFar", "monthlySurplus", "positionNow"] as const) assert.equal(after[key], before[key]);
  assert.equal(portfolioValue([custom], [payment], input.now), portfolioValue([investment], [payment], input.now));
  const future = { ...payment, id: "future", date: at("2026-12-10") };
  assert.equal(calculateSafeToSpend({ ...input, transactions: [future], investments: [custom] }).breakdown.find(l => l.id === "planned-investments")?.amount, rs(10000));
});

test("cycle target validation accepts exact money and rejects malformed dates and amounts", () => {
  assert.equal(validCycleTargets({ "2028-02-29": 0, "2026-11-24": 12345 }), true);
  for (const input of [[], null, { "2026-02-30": 1 }, { "2026-11-24": -1 }, { "2026-11-24": 1.2 }, { "2026-11-24": "100" }, { "2026-11-24": Number.MAX_SAFE_INTEGER + 1 }]) assert.equal(validCycleTargets(input), false);
  assert.throws(() => withCycleTarget(makeInvestment(), "2026-02-30", 100));
  assert.throws(() => withCycleTarget(makeInvestment(), cycle, -1));
});

test("Budgets shows the cycle target while retaining the usual budget allocation for future cycles", () => {
  const investments = [withCycleTarget(makeInvestment({ id: "mf", monthlyContribution: rs(30000) }), cycle, rs(10000)), makeInvestment({ id: "gold", monthlyContribution: rs(30000) })];
  const db = { profile: {}, investments, transactions: [], categories: [], goals: [], moneyLinks: [] } as unknown as Database;
  const current = budgetPerformance(db, cycle, new Date(2026,10,26), 24);
  assert.equal(current.investmentTarget, rs(40000));
  assert.equal(current.plan.investment, rs(70000));
  const next = budgetPerformance(db, "2026-12-24", new Date(2026,11,26), 24);
  assert.equal(next.investmentOverride, false);
  assert.equal(next.investmentTarget, rs(70000));
});
