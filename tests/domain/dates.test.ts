import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  addMonths,
  clampToMonth,
  daysBetween,
  daysInCalendarMonth,
  daysInMonth,
  elapsedDaysInMonth,
  endOfMonth,
  isSameMonth,
  isWeekend,
  monthKey,
  monthKeyToDate,
  nextDayOnOrAfter,
  previousMonths,
  remainingDaysInMonth,
  toDateInputValue,
  toLocalISO,
} from "@/lib/domain/dates";

/**
 * Cycle arithmetic is the foundation every money figure in the app sits on:
 * which cycle a transaction belongs to decides which totals it lands in, and
 * a card's billing window is built from the same primitives. The user's own
 * cycle starts on the 24th (payday), so that is the case exercised throughout
 * rather than the trivial `cycleStartDay = 1`.
 */

const PAYDAY = 24;

describe("clampToMonth", () => {
  test("clamps a day past the end of a short month", () => {
    // Day 31 in February must not silently roll into March.
    const d = clampToMonth(2026, 1, 31);
    assert.equal(d.getMonth(), 1);
    assert.equal(d.getDate(), 28);
  });

  test("clamps a day below 1", () => {
    assert.equal(clampToMonth(2026, 7, 0).getDate(), 1);
  });

  test("leaves a valid day untouched", () => {
    const d = clampToMonth(2026, 7, 24);
    assert.equal(d.getDate(), 24);
    assert.equal(d.getMonth(), 7);
  });

  test("knows February 2028 is a leap month", () => {
    assert.equal(daysInCalendarMonth(2028, 1), 29);
    assert.equal(clampToMonth(2028, 1, 31).getDate(), 29);
  });
});

describe("monthKey", () => {
  test("a date on the cycle start day opens the new cycle", () => {
    assert.equal(monthKey(new Date(2026, 6, 24), PAYDAY), "2026-07-24");
  });

  test("a date after the cycle start day stays in that cycle", () => {
    assert.equal(monthKey(new Date(2026, 7, 10), PAYDAY), "2026-07-24");
  });

  test("a date before the cycle start day belongs to the previous cycle", () => {
    assert.equal(monthKey(new Date(2026, 7, 23), PAYDAY), "2026-07-24");
    assert.equal(monthKey(new Date(2026, 6, 23), PAYDAY), "2026-06-24");
  });

  test("rolls back across a year boundary", () => {
    assert.equal(monthKey(new Date(2026, 0, 3), PAYDAY), "2025-12-24");
  });

  test("clamps a cycle start day longer than the month it lands in", () => {
    // A day-31 cycle in February starts on the 28th, not in March.
    assert.equal(monthKey(new Date(2026, 1, 28), 31), "2026-02-28");
  });

  test("defaults to plain calendar months", () => {
    assert.equal(monthKey(new Date(2026, 7, 9)), "2026-08-01");
  });
});

describe("addMonths", () => {
  test("shifts forward and back", () => {
    assert.equal(addMonths("2026-07-24", 1, PAYDAY), "2026-08-24");
    assert.equal(addMonths("2026-07-24", -1, PAYDAY), "2026-06-24");
  });

  test("crosses a year boundary in both directions", () => {
    assert.equal(addMonths("2026-12-24", 1, PAYDAY), "2027-01-24");
    assert.equal(addMonths("2026-01-24", -1, PAYDAY), "2025-12-24");
  });

  test("restores the intended day after passing through a short month", () => {
    // The documented reason addMonths re-clamps from cycleStartDay rather
    // than from the key's own (already-clamped) day: a day-30 cycle must not
    // stay stuck on the 28th once it reaches a 31-day month.
    const feb = addMonths("2026-01-30", 1, 30);
    assert.equal(feb, "2026-02-28");
    assert.equal(addMonths(feb, 1, 30), "2026-03-30");
  });
});

describe("endOfMonth", () => {
  test("ends the day before the next cycle begins", () => {
    const end = endOfMonth("2026-07-24", PAYDAY);
    assert.equal(end.getMonth(), 7);
    assert.equal(end.getDate(), 23);
  });

  test("carries end-of-day time so a same-day transaction is inside", () => {
    const end = endOfMonth("2026-07-24", PAYDAY);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMilliseconds(), 999);
    assert.ok(new Date(2026, 7, 23, 22, 0) <= end);
  });

  test("adjacent cycles are contiguous — no gap, no overlap", () => {
    const end = endOfMonth("2026-07-24", PAYDAY);
    const nextStart = monthKeyToDate(addMonths("2026-07-24", 1, PAYDAY));
    assert.equal(daysBetween(end, nextStart), 1);
    assert.ok(end < nextStart);
  });
});

describe("nextDayOnOrAfter", () => {
  test("returns the same month when the day is still ahead", () => {
    const d = nextDayOnOrAfter(9, new Date(2026, 7, 1));
    assert.equal(d.getMonth(), 7);
    assert.equal(d.getDate(), 9);
  });

  test("rolls into the next month when the day has passed", () => {
    const d = nextDayOnOrAfter(9, new Date(2026, 7, 20));
    assert.equal(d.getMonth(), 8);
    assert.equal(d.getDate(), 9);
  });

  test("is inclusive of the day itself", () => {
    assert.equal(nextDayOnOrAfter(9, new Date(2026, 7, 9)).getDate(), 9);
  });

  test("ignores the 23:59:59.999 an endOfMonth Date carries", () => {
    // The exact case this helper's doc comment exists for: a card due date is
    // computed from a statement's close, which is an endOfMonth-shaped Date.
    // Without normalising, that time-of-day pushes the answer out a month.
    const statementClose = endOfMonth("2026-06-25", 25);
    assert.equal(statementClose.getDate(), 24);
    const due = nextDayOnOrAfter(9, statementClose);
    assert.equal(due.getMonth(), 7, "due date must land in August");
    assert.equal(due.getDate(), 9);
  });
});

describe("cycle length and progress", () => {
  test("daysInMonth spans the whole cycle", () => {
    assert.equal(daysInMonth("2026-07-24", PAYDAY), 31); // 24 Jul – 23 Aug
    assert.equal(daysInMonth("2026-02-24", PAYDAY), 28); // 24 Feb – 23 Mar
  });

  test("remaining days include today", () => {
    // Today's allowance has not been spent yet at the moment we compute it.
    const remaining = remainingDaysInMonth(
      new Date(2026, 7, 23),
      "2026-07-24",
      PAYDAY,
    );
    assert.equal(remaining, 1);
  });

  test("a finished cycle has nothing remaining, a future one has all of it", () => {
    assert.equal(
      remainingDaysInMonth(new Date(2026, 8, 1), "2026-07-24", PAYDAY),
      0,
    );
    assert.equal(
      remainingDaysInMonth(new Date(2026, 5, 1), "2026-07-24", PAYDAY),
      31,
    );
  });

  test("elapsed and remaining both include today, overlapping by exactly one day", () => {
    // Deliberate, and relied on by different callers: the daily allowance
    // divides by `remaining` because today is still spendable, while velocity
    // divides by `elapsed` because part of today is already spent. They are
    // never summed, so the shared day is not double-counted anywhere — but
    // pin the relationship so a "tidy-up" of either doesn't shift a figure.
    const now = new Date(2026, 7, 10);
    const key = "2026-07-24";
    assert.equal(elapsedDaysInMonth(now, key, PAYDAY), 18);
    assert.equal(remainingDaysInMonth(now, key, PAYDAY), 14);
    assert.equal(
      elapsedDaysInMonth(now, key, PAYDAY) + remainingDaysInMonth(now, key, PAYDAY),
      daysInMonth(key, PAYDAY) + 1,
    );
  });
});

describe("previousMonths", () => {
  test("returns oldest first and excludes the key itself", () => {
    assert.deepEqual(previousMonths("2026-07-24", 3, PAYDAY), [
      "2026-04-24",
      "2026-05-24",
      "2026-06-24",
    ]);
  });
});

describe("isSameMonth", () => {
  test("agrees with monthKey for the payday cycle", () => {
    assert.ok(isSameMonth(new Date(2026, 7, 10), "2026-07-24", PAYDAY));
    assert.ok(!isSameMonth(new Date(2026, 7, 24), "2026-07-24", PAYDAY));
  });
});

describe("local wall-clock formatting", () => {
  test("toLocalISO does not shift the date across a timezone", () => {
    // Late-evening local times are exactly where a UTC conversion would move
    // the row into the next day — and so into the wrong cycle.
    assert.equal(toLocalISO(new Date(2026, 7, 9, 23, 30, 15)), "2026-08-09T23:30:15");
    assert.equal(toLocalISO(new Date(2026, 7, 9, 0, 5, 0)), "2026-08-09T00:05:00");
  });

  test("toDateInputValue round-trips a stored stamp", () => {
    assert.equal(toDateInputValue("2026-08-09T20:15:00"), "2026-08-09");
  });
});

describe("daysBetween", () => {
  test("counts whole days and ignores time of day", () => {
    assert.equal(
      daysBetween(new Date(2026, 7, 1, 23, 0), new Date(2026, 7, 4, 1, 0)),
      3,
    );
  });

  test("is negative when the target is in the past", () => {
    assert.equal(daysBetween(new Date(2026, 7, 4), new Date(2026, 7, 1)), -3);
  });

  test("crosses a DST-free month boundary correctly", () => {
    assert.equal(daysBetween(new Date(2026, 6, 24), new Date(2026, 7, 24)), 31);
  });
});

describe("isWeekend", () => {
  test("Saturday and Sunday only", () => {
    assert.ok(isWeekend(new Date(2026, 7, 8)));  // Saturday
    assert.ok(isWeekend(new Date(2026, 7, 9)));  // Sunday
    assert.ok(!isWeekend(new Date(2026, 7, 10))); // Monday
  });
});
