import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  monthlyEquivalent,
  monthlyRecurringTotal,
  nextOccurrence,
  priceDrift,
  recurringStatuses,
} from "@/lib/engine/recurring";
import { upcomingRecurring } from "@/lib/engine/safe-to-spend";

import { at, expense, makeRecurring, rs } from "../helpers/factories";

/**
 * Recurring bills reserve money out of Safe to spend. Until recently only
 * MONTHLY rules did — a yearly insurance premium was displayed as a
 * commitment on the Money page but never actually held back, and a weekly
 * bill was reserved once instead of four or five times.
 */

const PAYDAY = 24;
const MONTH = "2026-07-24"; // 24 Jul – 23 Aug 2026
const NOW = new Date(2026, 6, 24); // the first day of the cycle

describe("monthlyEquivalent", () => {
  test("a weekly bill uses 52/12, not 4 weeks", () => {
    // Four weeks is not a month; assuming it understates a ₹1,000 weekly bill
    // by ₹4,333 a year — exactly the quiet inaccuracy that erodes trust.
    const rule = makeRecurring({ frequency: "WEEKLY", amount: rs(1000) });
    assert.equal(monthlyEquivalent(rule), rs(4333.33));
  });

  test("a yearly bill is spread over twelve months", () => {
    const rule = makeRecurring({ frequency: "YEARLY", amount: rs(12_000) });
    assert.equal(monthlyEquivalent(rule), rs(1000));
  });

  test("a monthly bill is itself", () => {
    const rule = makeRecurring({ frequency: "MONTHLY", amount: rs(30_000) });
    assert.equal(monthlyEquivalent(rule), rs(30_000));
  });

  test("monthlyRecurringTotal skips inactive rules", () => {
    const rules = [
      makeRecurring({ amount: rs(30_000) }),
      makeRecurring({ amount: rs(99_000), isActive: false }),
    ];
    assert.equal(monthlyRecurringTotal(rules), rs(30_000));
  });
});

describe("nextOccurrence", () => {
  test("monthly: today counts as due", () => {
    const rule = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 5 });
    const next = nextOccurrence(rule, new Date(2026, 7, 5));
    assert.equal(next.getDate(), 5);
    assert.equal(next.getMonth(), 7);
  });

  test("monthly: rolls to next month once the day has passed", () => {
    const rule = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 5 });
    const next = nextOccurrence(rule, new Date(2026, 7, 6));
    assert.equal(next.getMonth(), 8);
  });

  test("monthly: a day-31 rule clamps inside February", () => {
    const rule = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 31 });
    const next = nextOccurrence(rule, new Date(2026, 1, 1));
    assert.equal(next.getMonth(), 1);
    assert.equal(next.getDate(), 28);
  });

  test("weekly: finds the next matching weekday", () => {
    const rule = makeRecurring({ frequency: "WEEKLY", dayOfPeriod: 1 }); // Monday
    const next = nextOccurrence(rule, new Date(2026, 7, 5)); // a Wednesday
    assert.equal(next.getDay(), 1);
    assert.equal(next.getDate(), 10);
  });

  test("weekly: today counts when it is the matching weekday", () => {
    const rule = makeRecurring({ frequency: "WEEKLY", dayOfPeriod: 1 });
    const monday = new Date(2026, 7, 10);
    assert.equal(nextOccurrence(rule, monday).getDate(), 10);
  });

  test("yearly: takes its anniversary month from createdAt", () => {
    const rule = makeRecurring({
      frequency: "YEARLY",
      dayOfPeriod: 15,
      createdAt: at("2024-11-15"),
    });
    const next = nextOccurrence(rule, new Date(2026, 7, 1));
    assert.equal(next.getMonth(), 10); // November
    assert.equal(next.getDate(), 15);
    assert.equal(next.getFullYear(), 2026);
  });

  test("yearly: rolls into next year once the anniversary has passed", () => {
    const rule = makeRecurring({
      frequency: "YEARLY",
      dayOfPeriod: 15,
      createdAt: at("2024-03-15"),
    });
    const next = nextOccurrence(rule, new Date(2026, 7, 1));
    assert.equal(next.getFullYear(), 2027);
    assert.equal(next.getMonth(), 2);
  });
});

describe("upcomingRecurring", () => {
  test("a monthly bill is reserved once", () => {
    const rule = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 1, amount: rs(30_000) });
    const out = upcomingRecurring([rule], [], MONTH, NOW, PAYDAY);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.dueDate.getMonth(), 7); // 1 Aug, inside 24 Jul–23 Aug
  });

  test("a monthly bill falling in the cycle's start month is found too", () => {
    // A 24 Jul–23 Aug cycle contains day 28 in July and day 5 in August;
    // comparing raw day-of-month integers would miss one of them.
    const rule = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 28 });
    const out = upcomingRecurring([rule], [], MONTH, NOW, PAYDAY);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.dueDate.getMonth(), 6);
  });

  test("a weekly bill is reserved for every occurrence in the cycle", () => {
    // Reserving it once understates the commitment fourfold.
    const rule = makeRecurring({
      frequency: "WEEKLY",
      dayOfPeriod: 1, // Monday
      amount: rs(1000),
    });
    const out = upcomingRecurring([rule], [], MONTH, NOW, PAYDAY);
    assert.ok(out.length >= 4 && out.length <= 5, `got ${out.length} occurrences`);
    assert.ok(out.every((o) => o.dueDate.getDay() === 1));
  });

  test("a yearly bill is reserved only in its anniversary cycle", () => {
    const august = makeRecurring({
      frequency: "YEARLY",
      dayOfPeriod: 10,
      createdAt: at("2024-08-10"),
      amount: rs(24_000),
    });
    const december = makeRecurring({
      frequency: "YEARLY",
      dayOfPeriod: 10,
      createdAt: at("2024-12-10"),
      amount: rs(24_000),
    });
    const out = upcomingRecurring([august, december], [], MONTH, NOW, PAYDAY);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.rule.id, august.id);
    assert.equal(out[0]?.amount, rs(24_000), "reserved in full, not 1/12th");
  });

  test("a partly paid weekly bill drops exactly the paid count", () => {
    // Two of four payments recorded means two still to come — not none, which
    // is what suppressing the whole rule used to produce.
    const rule = makeRecurring({ frequency: "WEEKLY", dayOfPeriod: 1, amount: rs(1000) });
    const unpaid = upcomingRecurring([rule], [], MONTH, NOW, PAYDAY).length;
    const paid = [
      expense({ recurringId: rule.id, amount: rs(1000), date: at("2026-07-27") }),
      expense({ recurringId: rule.id, amount: rs(1000), date: at("2026-08-03") }),
    ];
    const out = upcomingRecurring([rule], paid, MONTH, NOW, PAYDAY);
    assert.equal(out.length, unpaid - 2);
  });

  test("a paid monthly bill stops being reserved", () => {
    const rule = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 1, amount: rs(30_000) });
    const paid = [expense({ recurringId: rule.id, amount: rs(30_000), date: at("2026-08-01") })];
    assert.deepEqual(upcomingRecurring([rule], paid, MONTH, NOW, PAYDAY), []);
  });

  test("inactive rules reserve nothing", () => {
    const rule = makeRecurring({ dayOfPeriod: 1, isActive: false });
    assert.deepEqual(upcomingRecurring([rule], [], MONTH, NOW, PAYDAY), []);
  });

  test("in the live cycle, a date already passed is not still 'upcoming'", () => {
    const rule = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 1, amount: rs(30_000) });
    const later = new Date(2026, 7, 10); // past 1 Aug
    assert.deepEqual(upcomingRecurring([rule], [], MONTH, later, PAYDAY), []);
  });

  test("occurrences are returned in date order", () => {
    const weekly = makeRecurring({ frequency: "WEEKLY", dayOfPeriod: 3, amount: rs(500) });
    const monthly = makeRecurring({ frequency: "MONTHLY", dayOfPeriod: 1, amount: rs(30_000) });
    const out = upcomingRecurring([weekly, monthly], [], MONTH, NOW, PAYDAY);
    const times = out.map((o) => o.dueDate.getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  test("every emitted date agrees with nextOccurrence", () => {
    // The two must never disagree about when a bill lands.
    for (const frequency of ["MONTHLY", "WEEKLY", "YEARLY"] as const) {
      const rule = makeRecurring({
        frequency,
        dayOfPeriod: frequency === "WEEKLY" ? 2 : 10,
        createdAt: at("2024-08-10"),
      });
      for (const { dueDate } of upcomingRecurring([rule], [], MONTH, NOW, PAYDAY)) {
        assert.equal(
          nextOccurrence(rule, dueDate).getTime(),
          dueDate.getTime(),
          `${frequency}: ${dueDate.toDateString()} is not an occurrence`,
        );
      }
    }
  });
});

describe("recurringStatuses", () => {
  test("marks a rule paid once a charge exists this cycle", () => {
    const rule = makeRecurring({ dayOfPeriod: 1, amount: rs(30_000) });
    const rows = [expense({ recurringId: rule.id, amount: rs(30_000), date: at("2026-08-01") })];
    const [status] = recurringStatuses([rule], rows, MONTH, NOW, PAYDAY);
    assert.ok(status?.paidThisMonth);
    assert.equal(status?.lastCharge?.amount, rs(30_000));
  });

  test("an unpaid rule reports no charge and its monthly cost", () => {
    const rule = makeRecurring({ frequency: "WEEKLY", dayOfPeriod: 1, amount: rs(1000) });
    const [status] = recurringStatuses([rule], [], MONTH, NOW, PAYDAY);
    assert.equal(status?.paidThisMonth, false);
    assert.equal(status?.lastCharge, undefined);
    assert.equal(status?.monthlyCost, rs(4333.33));
  });
});

describe("priceDrift", () => {
  /** priceDrift compares a rule's expected amount against its last charge. */
  const statusFor = (ruleAmount: number, chargedAmounts: number[]) => {
    const rule = makeRecurring({ dayOfPeriod: 1, amount: rs(ruleAmount) });
    const charges = chargedAmounts.map((amount, i) =>
      expense({
        recurringId: rule.id,
        amount: rs(amount),
        date: at(`2026-0${5 + i}-01`),
      }),
    );
    return recurringStatuses([rule], charges, MONTH, NOW, PAYDAY)[0]!;
  };

  test("reports nothing when the rule has never been charged", () => {
    assert.equal(priceDrift(statusFor(500, [])), null);
  });

  test("reports nothing when the charge matches the expected amount", () => {
    assert.equal(priceDrift(statusFor(500, [500])), null);
  });

  test("spots a subscription whose price moved", () => {
    // ₹499 quietly becoming ₹649 is the most common way a budget drifts.
    const drift = priceDrift(statusFor(649, [499]));
    assert.deepEqual(drift, { previous: rs(499), current: rs(649) });
  });
});
