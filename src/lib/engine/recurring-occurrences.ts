import {clampToMonth,daysBetween} from '@/lib/domain/dates';
import type {RecurringTransaction} from '@/lib/domain/types';
import {indiaNow} from '@/lib/domain/transaction-time';

/** Date-only creation metadata is a wall date; timestamp metadata uses IST. */
export function anniversaryMonth(createdAt:string):number{
 const hasOffset=/(?:Z|[+-]\d{2}:\d{2})$/i.test(createdAt);
 const date=hasOffset&&Number.isFinite(Date.parse(createdAt))?indiaNow(new Date(createdAt)):createdAt;
 return Number(date.slice(5,7))-1;
}

/**
 * Every date a rule is due inside `[cycleStart, cycleEnd]`.
 *
 * Mirrors `nextOccurrence`'s reading of `dayOfPeriod` exactly (day-of-month
 * for MONTHLY/YEARLY, day-of-week 0-6 for WEEKLY, yearly anniversary month
 * taken from `createdAt`) so the two can never disagree about when a bill
 * lands. Weekly rules legitimately return several dates — that is the whole
 * reason this returns a list rather than one date.
 */
export function occurrencesInCycle(
  rule: RecurringTransaction,
  cycleStart: Date,
  cycleEnd: Date,
): Date[] {
  const inWindow = (d: Date) =>
    daysBetween(cycleStart, d) >= 0 && daysBetween(d, cycleEnd) >= 0;

  if (rule.frequency === "WEEKLY") {
    const target = ((rule.dayOfPeriod % 7) + 7) % 7;
    const first = new Date(cycleStart);
    first.setDate(first.getDate() + ((target - cycleStart.getDay() + 7) % 7));
    const out: Date[] = [];
    for (let d = first; inWindow(d); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
      out.push(d);
    }
    return out;
  }

  if (rule.frequency === "YEARLY") {
    const month = anniversaryMonth(rule.createdAt);
    // A cycle can straddle a year boundary, so test both candidate years.
    return [cycleStart.getFullYear(), cycleEnd.getFullYear()]
      .map((year) => clampToMonth(year, month, rule.dayOfPeriod))
      .filter((d, i, all) => inWindow(d) && all.findIndex((x) => x.getTime() === d.getTime()) === i);
  }

  // MONTHLY. The same `dayOfPeriod` can land in either the cycle's start
  // month or its end month depending on how it compares to `cycleStartDay`
  // (a Jul24 → Aug23 cycle: day 5 occurs in August, day 28 in July), so try
  // both rather than comparing raw day-of-month integers.
  return [
    clampToMonth(cycleStart.getFullYear(), cycleStart.getMonth(), rule.dayOfPeriod),
    clampToMonth(cycleEnd.getFullYear(), cycleEnd.getMonth(), rule.dayOfPeriod),
  ].filter((d, i, all) => inWindow(d) && all.findIndex((x) => x.getTime() === d.getTime()) === i);
}

