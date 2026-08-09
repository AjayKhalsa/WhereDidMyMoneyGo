import { clampToMonth, daysBetween, monthKey, type MonthKey } from "@/lib/domain/dates";
import type { Paise, RecurringTransaction, Transaction } from "@/lib/domain/types";
import { monthTransactions } from "./analytics";

/**
 * Recurring schedule maths (spec §18).
 *
 * `upcomingRecurring` in the safe-to-spend engine answers a narrower question —
 * "what is still due before this cycle ends?" — because that is all the
 * calculation needs. The Money screen has to show the whole standing
 * arrangement: when each charge lands next, whether this period is already
 * handled, and what the lot costs per month once weekly and yearly bills are
 * put on the same footing.
 *
 * Kept out of the component so a subscription's next date is computed the same
 * way wherever it is shown.
 */

/**
 * The next date this rule is expected to charge, on or after `from`.
 *
 * YEARLY rules only carry a day in the model, so the anniversary month is
 * taken from when the rule was created. That is a guess, but a stable and
 * explainable one — better than silently treating a yearly bill as monthly.
 */
export function nextOccurrence(
  rule: RecurringTransaction,
  from: Date = new Date(),
): Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());

  if (rule.frequency === "WEEKLY") {
    const target = ((rule.dayOfPeriod % 7) + 7) % 7;
    const delta = (target - today.getDay() + 7) % 7;
    const next = new Date(today);
    next.setDate(next.getDate() + delta);
    return next;
  }

  if (rule.frequency === "YEARLY") {
    const anniversaryMonth = new Date(rule.createdAt).getMonth();
    const thisYear = clampToMonth(
      today.getFullYear(),
      anniversaryMonth,
      rule.dayOfPeriod,
    );
    if (thisYear >= today) return thisYear;
    return clampToMonth(
      today.getFullYear() + 1,
      anniversaryMonth,
      rule.dayOfPeriod,
    );
  }

  const thisMonth = clampToMonth(
    today.getFullYear(),
    today.getMonth(),
    rule.dayOfPeriod,
  );
  if (thisMonth >= today) return thisMonth;
  return clampToMonth(today.getFullYear(), today.getMonth() + 1, rule.dayOfPeriod);
}

/**
 * What one rule costs per month.
 *
 * Weekly bills use 52/12 rather than 4, because four weeks is not a month and
 * the ₹400 error that assumption introduces over a year is exactly the kind of
 * quiet inaccuracy that makes people stop trusting the total.
 */
export function monthlyEquivalent(rule: RecurringTransaction): Paise {
  switch (rule.frequency) {
    case "WEEKLY":
      return Math.round((rule.amount * 52) / 12);
    case "YEARLY":
      return Math.round(rule.amount / 12);
    default:
      return rule.amount;
  }
}

export function monthlyRecurringTotal(rules: RecurringTransaction[]): Paise {
  return rules
    .filter((r) => r.isActive)
    .reduce((acc, r) => acc + monthlyEquivalent(r), 0);
}

export interface RecurringStatus {
  rule: RecurringTransaction;
  /** When it is next expected to charge. */
  nextDate: Date;
  /** Whole days until `nextDate`; negative once it is overdue. */
  daysUntil: number;
  /** True once a transaction from this rule exists in the selected month. */
  paidThisMonth: boolean;
  /** The most recent charge this rule produced, if any. */
  lastCharge: Transaction | undefined;
  monthlyCost: Paise;
}

/**
 * Status for every rule, ordered by what needs attention soonest.
 *
 * Anything already handled this month drops to the bottom — a paid bill is
 * information, not a prompt.
 */
export function recurringStatuses(
  rules: RecurringTransaction[],
  transactions: Transaction[],
  month: MonthKey,
  now: Date = new Date(),
  cycleStartDay = 1,
): RecurringStatus[] {
  const paidRuleIds = new Set(
    monthTransactions(transactions, month, cycleStartDay)
      .map((t) => t.recurringId)
      .filter((id): id is string => Boolean(id)),
  );

  const lastByRule = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.recurringId) continue;
    const current = lastByRule.get(t.recurringId);
    if (!current || t.date > current.date) lastByRule.set(t.recurringId, t);
  }

  return rules
    .map((rule) => {
      const nextDate = nextOccurrence(rule, now);
      return {
        rule,
        nextDate,
        daysUntil: daysBetween(now, nextDate),
        paidThisMonth: paidRuleIds.has(rule.id),
        lastCharge: lastByRule.get(rule.id),
        monthlyCost: monthlyEquivalent(rule),
      };
    })
    .sort((a, b) => {
      if (a.rule.isActive !== b.rule.isActive) return a.rule.isActive ? -1 : 1;
      if (a.paidThisMonth !== b.paidThisMonth) return a.paidThisMonth ? 1 : -1;
      return a.nextDate.getTime() - b.nextDate.getTime();
    });
}

/**
 * Bills that have quietly grown.
 *
 * Compares the rule's stated amount against what it actually charged last
 * time. A subscription that went from ₹499 to ₹649 without anyone noticing is
 * the single most common way a budget drifts.
 */
export function priceDrift(
  status: RecurringStatus,
): { previous: Paise; current: Paise } | null {
  const charged = status.lastCharge?.amount;
  if (!charged || charged === status.rule.amount) return null;
  return { previous: charged, current: status.rule.amount };
}

/** True when the selected month is the one the user is actually living in. */
export function isLiveMonth(month: MonthKey, now: Date, cycleStartDay = 1): boolean {
  return monthKey(now, cycleStartDay) === month;
}
