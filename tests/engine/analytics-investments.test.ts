import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  investmentContributions,
  netWorth,
  portfolioValue,
  valueInvestments,
} from "@/lib/engine/analytics";

import {
  at,
  expense,
  investmentTxn,
  makeAccount,
  makeCard,
  makeInvestment,
  rs,
} from "../helpers/factories";

/**
 * The app has no price feed, so an investment's value is whatever the user
 * last typed in. The design that keeps that honest: value is *derived* from
 * the stamp plus later contributions, never mutated on write. A SIP therefore
 * raises value and cost equally and gain stays put — no re-stamping, and no
 * drift when a transaction is later edited or deleted.
 */

const NOW = new Date(2026, 7, 10);

describe("valueInvestments", () => {
  test("a never-valued investment is worth what was put in", () => {
    // Strictly no worse than the contribution-only behaviour that preceded it.
    const inv = makeInvestment();
    const rows = [investmentTxn({ investmentId: inv.id, amount: rs(50_000) })];
    const [v] = valueInvestments([inv], rows, NOW);
    assert.ok(v);
    assert.equal(v.contributed, rs(50_000));
    assert.equal(v.value, rs(50_000));
    assert.equal(v.gain, 0);
    assert.equal(v.valuedAt, null);
    assert.equal(v.daysSinceValued, null);
  });

  test("a stamped value produces a gain against contributions", () => {
    const inv = makeInvestment({
      currentValue: rs(60_000),
      valuedAt: at("2026-08-01"),
    });
    const rows = [
      investmentTxn({ investmentId: inv.id, amount: rs(50_000), date: at("2026-01-15") }),
    ];
    const [v] = valueInvestments([inv], rows, NOW);
    assert.ok(v);
    assert.equal(v.value, rs(60_000));
    assert.equal(v.gain, rs(10_000));
    assert.equal(v.daysSinceValued, 9);
  });

  test("a contribution after the stamp raises value and cost equally, leaving gain unchanged", () => {
    // The property that means you never have to re-stamp after a SIP.
    const inv = makeInvestment({
      currentValue: rs(60_000),
      valuedAt: at("2026-08-01"),
    });
    const rows = [
      investmentTxn({ investmentId: inv.id, amount: rs(50_000), date: at("2026-01-15") }),
      investmentTxn({ investmentId: inv.id, amount: rs(5000), date: at("2026-08-05") }),
    ];
    const [v] = valueInvestments([inv], rows, NOW);
    assert.ok(v);
    assert.equal(v.contributed, rs(55_000));
    assert.equal(v.value, rs(65_000));
    assert.equal(v.gain, rs(10_000), "gain must not move when money is added");
  });

  test("a contribution before the stamp is already inside the stamped value", () => {
    // Counting it again would double it — the stamp was made after the money
    // had already landed.
    const inv = makeInvestment({
      currentValue: rs(60_000),
      valuedAt: at("2026-08-01"),
    });
    const rows = [
      investmentTxn({ investmentId: inv.id, amount: rs(50_000), date: at("2026-07-20") }),
    ];
    const [v] = valueInvestments([inv], rows, NOW);
    assert.ok(v);
    assert.equal(v.value, rs(60_000));
    assert.equal(v.gain, rs(10_000));
  });

  test("a loss is reported as a negative gain rather than being hidden", () => {
    const inv = makeInvestment({
      currentValue: rs(40_000),
      valuedAt: at("2026-08-01"),
    });
    const rows = [
      investmentTxn({ investmentId: inv.id, amount: rs(50_000), date: at("2026-01-15") }),
    ];
    const [v] = valueInvestments([inv], rows, NOW);
    assert.equal(v?.gain, rs(-10_000));
  });

  test("a value with no stamp date falls back to contributions", () => {
    // Without `valuedAt` the figure has no meaning — there is no way to know
    // which contributions it already includes.
    const inv = makeInvestment({ currentValue: rs(99_999) });
    const rows = [investmentTxn({ investmentId: inv.id, amount: rs(50_000) })];
    assert.equal(valueInvestments([inv], rows, NOW)[0]?.value, rs(50_000));
  });

  test("contributions to another investment are not counted", () => {
    const a = makeInvestment({ name: "FD" });
    const b = makeInvestment({ name: "Index" });
    const rows = [investmentTxn({ investmentId: b.id, amount: rs(50_000) })];
    assert.equal(valueInvestments([a], rows, NOW)[0]?.contributed, 0);
  });

  test("an expense is never mistaken for a contribution", () => {
    const inv = makeInvestment();
    const rows = [expense({ investmentId: inv.id, amount: rs(50_000) })];
    assert.equal(valueInvestments([inv], rows, NOW)[0]?.contributed, 0);
  });
});

describe("portfolioValue", () => {
  test("sums active investments at their derived values", () => {
    const a = makeInvestment({ currentValue: rs(60_000), valuedAt: at("2026-08-01") });
    const b = makeInvestment();
    const rows = [
      investmentTxn({ investmentId: a.id, amount: rs(50_000), date: at("2026-01-01") }),
      investmentTxn({ investmentId: b.id, amount: rs(20_000), date: at("2026-01-01") }),
    ];
    assert.equal(portfolioValue([a, b], rows, NOW), rs(80_000));
  });

  test("excludes closed investments", () => {
    const closed = makeInvestment({ isActive: false });
    const rows = [investmentTxn({ investmentId: closed.id, amount: rs(50_000) })];
    assert.equal(portfolioValue([closed], rows, NOW), 0);
  });

  test("an empty portfolio is worth zero", () => {
    assert.equal(portfolioValue([], [], NOW), 0);
  });
});

describe("netWorth", () => {
  const bank = makeAccount({ openingBalance: rs(26_231) });
  const card = makeCard();

  test("counts cash plus portfolio minus card debt", () => {
    const inv = makeInvestment({ currentValue: rs(60_000), valuedAt: at("2026-08-01") });
    const rows = [
      investmentTxn({
        investmentId: inv.id,
        amount: rs(50_000),
        date: at("2026-01-01"),
        accountId: undefined,
      }),
      expense({ accountId: card.id, amount: rs(19_301) }),
    ];
    assert.equal(
      netWorth([bank, card], rows, [inv], [], NOW),
      rs(26_231) + rs(60_000) - rs(19_301),
    );
  });

  test("unrealised gain lifts net worth without touching cash", () => {
    const flat = makeInvestment();
    const grown = makeInvestment({
      id: flat.id,
      currentValue: rs(60_000),
      valuedAt: at("2026-08-01"),
    });
    const rows = [
      investmentTxn({ investmentId: flat.id, amount: rs(50_000), date: at("2026-01-01") }),
    ];
    const before = netWorth([bank], rows, [flat], [], NOW);
    const after = netWorth([bank], rows, [grown], [], NOW);
    assert.equal(after - before, rs(10_000));
  });

  test("money owed to you counts, money you owe subtracts", () => {
    const owed = netWorth([bank], [], [], [{ netAmount: rs(2000) }], NOW);
    const owing = netWorth([bank], [], [], [{ netAmount: rs(-2000) }], NOW);
    assert.equal(owed - owing, rs(4000));
  });
});

describe("investmentContributions", () => {
  test("reports this cycle's contributions and the planned amount", () => {
    const inv = makeInvestment({ monthlyContribution: rs(30_000) });
    const rows = [
      investmentTxn({ investmentId: inv.id, amount: rs(10_000), date: at("2026-07-30") }),
      investmentTxn({ investmentId: inv.id, amount: rs(90_000), date: at("2026-06-30") }),
    ];
    const [row] = investmentContributions([inv], rows, "2026-07-24", 24);
    assert.equal(row?.contributed, rs(10_000));
    assert.equal(row?.planned, rs(30_000));
  });

  test("excludes closed investments", () => {
    const closed = makeInvestment({ isActive: false });
    assert.deepEqual(investmentContributions([closed], [], "2026-07-24", 24), []);
  });
});
