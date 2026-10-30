import { transactionOccurredBy } from "@/lib/domain/transaction-time";
import {
  clampToMonth,
  daysBetween,
  endOfMonth,
  monthKey,
  monthKeyToDate,
  remainingDaysInMonth,
  type MonthKey,
} from "@/lib/domain/dates";
import type {
  Account,
  Goal,
  IncomeSource,
  Investment,
  Paise,
  RecurringTransaction,
  Transaction,
} from "@/lib/domain/types";
import {
  creditCardCreditBalance,
  creditCardOutstanding,
  liquidBalance,
  monthTotals,
  monthTransactions,
  spendingVelocity,
  total,
} from "./analytics";

/**
 * The safe-to-spend engine (spec §7, §33).
 *
 * This is the single most important number in the product, so it is computed
 * in exactly one place and it explains itself. Every line the user sees in
 * the "how is this calculated?" panel comes from the `breakdown` array below
 * — there is no second, prettier version of this maths in the UI.
 *
 * Two different questions live here, and conflating them is what this module
 * exists to prevent:
 *
 * `safeAmount` — *cash position*. What is actually yours to spend right now:
 * money sitting in bank/cash accounts, minus every rupee already promised to
 * a credit card, minus commitments still to come this cycle. Grounded in
 * real balances, so it can never claim you can spend money you don't have.
 *
 * `monthlySurplus` — *change over the cycle*. Income received minus what was
 * spent and invested. Crucially this is a delta, not a balance: it equals
 * the operating change in `position` (cash plus card credits minus card debt),
 * including explicitly linked investment redemptions. This is not a wealth
 * change: selling an asset moves existing wealth into cash, while paying a
 * card reduces cash and debt together.
 * `positionAtCycleStart`/`positionNow` are surfaced alongside it so the UI can
 * compare the ledger's actual position change rather than present a delta as
 * money. Strictly retrospective: no expected-but-unreceived income, no
 * not-yet-paid commitments, or the identity breaks and the figure stops being
 * checkable against real accounts.
 *
 * Credit cards are the subtle part, and the cash formulation handles them
 * without any double-counting: charging a card raises `cardOutstanding` and
 * so lowers `safeAmount` exactly once, on the day of the purchase. Paying the
 * card lowers cash and `cardOutstanding` by the same amount, leaving
 * `safeAmount` untouched — because that money stopped being yours when you
 * spent it, not when the payment cleared.
 */

export type BreakdownDirection = "add" | "subtract";

export interface BreakdownLine {
  id: string;
  label: string;
  amount: Paise;
  direction: BreakdownDirection;
  /** Plain-language reason, shown under the label. */
  hint: string;
}

export interface SafeToSpendResult {
  /**
   * Uncommitted cash: what's in your accounts, less card debt and what's
   * already promised this cycle. The headline figure.
   */
  safeAmount: Paise;
  /**
   * How much better (or worse) off this cycle left you: income received,
   * less what was spent and invested. A *change*, not a balance — it equals
   * `positionNow − positionAtCycleStart` when all cash/card movements are
   * covered. Adjustments, excluded accounts and missing history require
   * reconciliation. Never render this operating delta as "safe to spend".
   */
  monthlySurplus: Paise;
  /** Cash − card debt at the moment this cycle began. */
  positionAtCycleStart: Paise;
  /** Cash − card debt right now. `monthlySurplus` is the difference. */
  positionNow: Paise;
  /** Nonzero when operating flows do not explain the recorded cash/card change. */
  positionDifference: Paise;
  /** Reduction in outstanding card debt during the selected cycle, independent of surplus. */
  cardDebtCleared: Paise;
  /** `safeAmount` spread over the days that remain, including today. */
  dailyAllowance: Paise;
  remainingDays: number;

  incomeBasis: Paise;
  spentSoFar: Paise;
  investedSoFar: Paise;
  committed: Paise;

  /** Where the month lands if spending continues at the current pace. */
  projectedMonthEndSpend: Paise;
  /** Positive: money left over at month end. Negative: heading for a shortfall. */
  projectedSurplus: Paise;

  /** True when there is genuinely nothing discretionary left. */
  isOverspent: boolean;

  /** Cash view, kept separate from the budget view (spec §7). */
  bankBalance: Paise;
  cardOutstanding: Paise;
  /** bankBalance − cardOutstanding: money that is really yours. */
  unencumberedCash: Paise;

  /** The receipt behind `safeAmount`. */
  breakdown: BreakdownLine[];
  /** The receipt behind `monthlySurplus`. */
  monthlySurplusBreakdown: BreakdownLine[];
}

export interface SafeToSpendInput {
  transactions: Transaction[];
  accounts: Account[];
  incomeSources: IncomeSource[];
  investments: Investment[];
  recurring: RecurringTransaction[];
  goals: Goal[];
  month: MonthKey;
  now: Date;
  cycleStartDay: number;
}

/** Net expected pay: gross minus the deductions that never reach the bank. */
export function expectedMonthlyIncome(sources: IncomeSource[]): Paise {
  return sources
    .filter((s) => s.isActive && s.recurring)
    .reduce((acc, s) => acc + Math.max(0, s.amount - s.deductions), 0);
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
function occurrencesInCycle(
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
    const anniversaryMonth = new Date(rule.createdAt).getMonth();
    // A cycle can straddle a year boundary, so test both candidate years.
    return [cycleStart.getFullYear(), cycleEnd.getFullYear()]
      .map((year) => clampToMonth(year, anniversaryMonth, rule.dayOfPeriod))
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

/**
 * Recurring charges still to come this cycle — one entry per *occurrence*,
 * not per rule, because a weekly bill is due four or five times a cycle and
 * reserving it once would understate what's committed.
 *
 * Charges already made are netted off by count rather than by suppressing
 * the rule outright: two of a weekly bill's four payments being recorded
 * means two are still to come, not none.
 */
export function upcomingRecurring(
  recurring: RecurringTransaction[],
  transactions: Transaction[],
  month: MonthKey,
  now: Date,
  cycleStartDay = 1,
): { rule: RecurringTransaction; dueDate: Date; amount: Paise }[] {
  const paidCounts = new Map<string, number>();
  const ruleTypes = new Map(recurring.map(r => [r.id, r.type]));
  for (const t of monthTransactions(transactions, month, cycleStartDay)) {
    if (!t.recurringId || t.type !== ruleTypes.get(t.recurringId) || t.categoryId === "adjustment" || !transactionOccurredBy(t, now)) continue;
    paidCounts.set(t.recurringId, (paidCounts.get(t.recurringId) ?? 0) + 1);
  }

  const cycleStart = monthKeyToDate(month);
  const cycleEnd = endOfMonth(month, cycleStartDay);
  const isCurrentCycle = monthKey(now, cycleStartDay) === month;
  // Viewing the live cycle: anything before "now" already passed without
  // being charged. Viewing a past/future cycle: nothing is filtered out —
  // every rule "still due" inside that cycle window counts.
  const cutoff = isCurrentCycle ? now : cycleStart;

  const out: { rule: RecurringTransaction; dueDate: Date; amount: Paise }[] = [];
  for (const rule of recurring) {
    if (!rule.isActive) continue;

    const dates = occurrencesInCycle(rule, cycleStart, cycleEnd);
    // Drop the earliest N, where N is how many charges this rule already
    // produced this cycle — those are the ones that have been paid.
    const unpaid = dates.slice(paidCounts.get(rule.id) ?? 0);

    for (const dueDate of unpaid) {
      if (daysBetween(cutoff, dueDate) < 0) continue; // already passed
      out.push({ rule, dueDate, amount: rule.amount });
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Planned investment contributions not yet made this month. */
export function remainingPlannedInvestments(
  investments: Investment[],
  transactions: Transaction[],
  month: MonthKey,
  cycleStartDay = 1,
): Paise {
  const monthly = monthTransactions(transactions, month, cycleStartDay).filter(
    (t) => t.type === "INVESTMENT",
  );
  let remaining = 0;
  for (const investment of investments) {
    if (!investment.isActive) continue;
    const contributed = total(
      monthly.filter((t) => t.investmentId === investment.id),
    );
    remaining += Math.max(0, investment.monthlyContribution - contributed);
  }
  return remaining;
}

/**
 * Goal money earmarked out of this month's income and not yet set aside —
 * the monthly commitment minus whatever's already been contributed this
 * cycle, same "held back until it's actually moved" treatment as
 * `remainingPlannedInvestments`.
 */
export function goalAllocations(
  goals: Goal[],
  transactions: Transaction[],
  month: MonthKey,
  cycleStartDay = 1,
): Paise {
  const monthly = monthTransactions(transactions, month, cycleStartDay).filter(
    (t) => t.type === "TRANSFER" && t.goalId,
  );
  return goals.reduce((acc, g) => {
    if (g.currentAmount >= g.targetAmount) return acc; // already funded
    const contributed = total(monthly.filter((t) => t.goalId === g.id));
    return acc + Math.max(0, g.monthlyContribution - contributed);
  }, 0);
}

/** Total owed across active cards, for a given slice of history. */
function cardDebtOf(accounts: Account[], transactions: Transaction[]): Paise {
  return accounts
    .filter((a) => a.isActive && a.type === "CREDIT_CARD")
    .reduce((acc, c) => acc + creditCardOutstanding(transactions, c.id), 0);
}

/**
 * Cash minus card debt — "what's actually yours" — for a given slice of
 * history. Card credit counts *in your favour* rather than being clamped
 * away by `creditCardOutstanding`; without that, an overpaid card silently
 * drops out of the figure and the surplus identity fails to balance.
 */
function netPosition(accounts: Account[], transactions: Transaction[]): Paise {
  return accounts
    .filter((a) => a.isActive && a.type === "CREDIT_CARD")
    .reduce(
      (acc, c) =>
        acc +
        creditCardCreditBalance(transactions, c.id) -
        creditCardOutstanding(transactions, c.id),
      liquidBalance(accounts, transactions),
    );
}

export function calculateSafeToSpend(
  input: SafeToSpendInput,
): SafeToSpendResult {
  const { accounts, month, now, cycleStartDay } = input;
  const transactions = input.transactions.filter(t => transactionOccurredBy(t, now));

  const totals = monthTotals(transactions, month, cycleStartDay);

  // --- Income basis -------------------------------------------------------
  // Plan against expected salary even before it lands, but if actual income
  // is higher (a bonus arrived) use the real figure.
  const expected = expectedMonthlyIncome(input.incomeSources);
  const incomeBasis = Math.max(expected, totals.income);

  // --- Cash position ------------------------------------------------------
  const bankBalance = liquidBalance(accounts, transactions);
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD" && a.isActive);
  const cardOutstanding = cards.reduce(
    (acc, card) => acc + creditCardOutstanding(transactions, card.id),
    0,
  );
  // Expected salary remains a planning basis, not available cash.
  // --- Other commitments --------------------------------------------------
  const upcoming = upcomingRecurring(input.recurring, transactions, month, now, cycleStartDay);
  const upcomingTotal = upcoming.reduce((acc, u) => acc + u.amount, 0);
  const plannedInvestmentsLeft = remainingPlannedInvestments(
    input.investments,
    transactions,
    month,
    cycleStartDay,
  );
  const goalMoney = goalAllocations(input.goals, transactions, month, cycleStartDay);

  // --- The calculation ----------------------------------------------------
  // Cash you hold, less what's already promised. Card debt is subtracted in
  // full rather than netted against this cycle's card spending: every rupee
  // owed has to be paid out of this same cash, whenever it was charged.
  const safeAmount =
    bankBalance -
    cardOutstanding -
    upcomingTotal -
    plannedInvestmentsLeft -
    goalMoney;

  // Strictly what happened inside this cycle — actual income, not the
  // expected-or-actual basis, and nothing forward-looking. Linked redemptions
  // reduce net invested. Compare this operating delta with the position
  // endpoints; adjustments or incomplete account coverage can differ.
  const monthlySurplus = totals.income - totals.invested - totals.spent;

  const cycleStart = monthKeyToDate(month);
  const priorTransactions = transactions.filter(
    (t) => new Date(t.date) < cycleStart,
  );
  const positionAtCycleStart = netPosition(accounts, priorTransactions);
  const periodEnd = endOfMonth(month, cycleStartDay);
  const positionRows = transactions.filter(t => new Date(t.date) <= periodEnd);
  const positionNow = netPosition(accounts, positionRows);
  const cardDebtCleared = Math.max(
    0,
    cardDebtOf(accounts, priorTransactions) - cardDebtOf(accounts, positionRows),
  );

  const remainingDays = remainingDaysInMonth(now, month, cycleStartDay);
  const dailyAllowance =
    safeAmount > 0 ? Math.floor(safeAmount / remainingDays) : 0;

  const velocity = spendingVelocity(transactions, month, now, cycleStartDay);
  const projectedRemainingSpend = Math.max(0, velocity.perDay) * Math.max(0, remainingDays - 1);
  const projectedSurplus = safeAmount - projectedRemainingSpend;

  // Ordered so the first two lines read as the sentence the number is:
  // cash in bank, less what's owed on cards, equals what's actually yours.
  const breakdown: BreakdownLine[] = [
    {
      id: "cash",
      label: "Cash in bank",
      amount: bankBalance,
      direction: "add",
      hint: "Across your bank and cash accounts right now",
    },
    {
      id: "card-outstanding",
      label: "Already owed on cards",
      amount: cardOutstanding,
      direction: "subtract",
      hint: "You've spent this money — it just hasn't left your account yet",
    },
  ];

  if (upcomingTotal > 0) {
    breakdown.push({
      id: "upcoming",
      label: "Bills still to come",
      amount: upcomingTotal,
      direction: "subtract",
      hint: `${upcoming.length} recurring ${upcoming.length === 1 ? "charge" : "charges"} due before this cycle ends`,
    });
  }

  if (plannedInvestmentsLeft > 0) {
    breakdown.push({
      id: "planned-investments",
      label: "Investments still due",
      amount: plannedInvestmentsLeft,
      direction: "subtract",
      hint: "Held back so your monthly contributions stay on track",
    });
  }

  if (goalMoney > 0) {
    breakdown.push({
      id: "goals",
      label: "Set aside for goals",
      amount: goalMoney,
      direction: "subtract",
      hint: "Your monthly goal contributions",
    });
  }

  // Separate contributions and principal returned, mirroring `monthlySurplus`
  // term for term so the arithmetic on screen is the arithmetic in code.
  const monthlySurplusBreakdown: BreakdownLine[] = [
    {
      id: "income",
      label: "Income this month",
      amount: totals.income,
      direction: "add",
      hint: "What has actually landed, including one-offs",
    },
    {
      id: "invested",
      label: "Investment contributions",
      amount: totals.investmentContributions,
      direction: "subtract",
      hint: "Actual money invested during this cycle, before withdrawals",
    },
    ...(totals.investmentWithdrawals > 0 ? [{
      id: "investment-withdrawals",
      label: "Investment principal returned",
      amount: totals.investmentWithdrawals,
      direction: "add" as const,
      hint: "Explicitly linked withdrawals, including FD principal; not income",
    }] : []),
    {
      id: "spent",
      label: totals.spent < 0 ? "Net refunds received" : "Spent after refunds",
      amount: Math.abs(totals.spent),
      direction: totals.spent < 0 ? "add" : "subtract",
      hint: `${totals.expenseCount} ${totals.expenseCount === 1 ? "expense" : "expenses"} this month, across every payment method`,
    },
  ];

  return {
    safeAmount,
    monthlySurplus,
    positionAtCycleStart,
    positionNow,
    positionDifference: monthlySurplus - (positionNow - positionAtCycleStart),
    cardDebtCleared,
    dailyAllowance,
    remainingDays,
    incomeBasis,
    spentSoFar: totals.spent,
    investedSoFar: totals.invested,
    committed: cardOutstanding,
    projectedMonthEndSpend: totals.spent + projectedRemainingSpend,
    projectedSurplus,
    isOverspent: safeAmount <= 0,
    bankBalance,
    cardOutstanding,
    unencumberedCash: bankBalance - cardOutstanding,
    breakdown,
    monthlySurplusBreakdown,
  };
}
