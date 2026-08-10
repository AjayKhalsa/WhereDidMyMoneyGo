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
 * `monthlySurplus` — *cash flow*. This cycle's income minus this cycle's
 * outgoings. A budgeting view: "how much of what I earned is unallocated".
 * Useful, but not spendable-cash — an income-minus-expenses figure ignores
 * that card bills paid this cycle settled *last* cycle's spending, so it runs
 * systematically optimistic. It is never the headline.
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
   * This cycle's income minus its outgoings. A budgeting metric, NOT
   * spendable cash — see the module comment. Never render this as
   * "safe to spend".
   */
  monthlySurplus: Paise;
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
 * Recurring charges still to come this cycle.
 *
 * A bill is treated as already handled once a transaction from the same
 * recurring rule exists in this cycle, so the same ₹649 is never held back
 * twice.
 *
 * The same `dayOfPeriod` can land in either the cycle's start month or its
 * end month depending on how it compares to `cycleStartDay` (e.g. a Jul24 →
 * Aug23 cycle: a bill due on day 5 occurs in August, one due on day 28
 * occurs in July) — so each rule's due date is resolved by trying the day
 * clamped into both months and keeping whichever candidate actually falls
 * inside the cycle, rather than comparing raw day-of-month integers.
 */
export function upcomingRecurring(
  recurring: RecurringTransaction[],
  transactions: Transaction[],
  month: MonthKey,
  now: Date,
  cycleStartDay = 1,
): { rule: RecurringTransaction; dueDate: Date; amount: Paise }[] {
  const paidRuleIds = new Set(
    monthTransactions(transactions, month, cycleStartDay)
      .map((t) => t.recurringId)
      .filter((id): id is string => Boolean(id)),
  );

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
    if (paidRuleIds.has(rule.id)) continue;
    if (rule.frequency !== "MONTHLY") continue;

    const candidates = [
      clampToMonth(cycleStart.getFullYear(), cycleStart.getMonth(), rule.dayOfPeriod),
      clampToMonth(cycleEnd.getFullYear(), cycleEnd.getMonth(), rule.dayOfPeriod),
    ];
    const dueDate = candidates.find(
      (d) => daysBetween(cycleStart, d) >= 0 && daysBetween(d, cycleEnd) >= 0,
    );
    if (!dueDate) continue; // shouldn't happen for a MONTHLY rule in a <=31-day cycle
    if (daysBetween(cutoff, dueDate) < 0) continue; // already passed

    out.push({ rule, dueDate, amount: rule.amount });
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

export function calculateSafeToSpend(
  input: SafeToSpendInput,
): SafeToSpendResult {
  const { transactions, accounts, month, now, cycleStartDay } = input;

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
  // Salary due this cycle that hasn't landed yet. Without this, opening the
  // app on payday morning — before the credit posts — would show a near-zero
  // safe-to-spend that jumps hours later. Zero once pay has arrived, so it
  // never inflates the figure mid-cycle.
  const expectedNotYetReceived = Math.max(0, expected - totals.income);

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
    cardOutstanding +
    expectedNotYetReceived -
    upcomingTotal -
    plannedInvestmentsLeft -
    goalMoney;

  // The budgeting view, kept deliberately separate. No card term at all:
  // what's owed on a card was already counted as spending the day it was
  // charged, and settling an older bill isn't this cycle's outgoing.
  const monthlySurplus =
    incomeBasis -
    totals.invested -
    plannedInvestmentsLeft -
    totals.spent -
    upcomingTotal -
    goalMoney;

  const remainingDays = remainingDaysInMonth(now, month, cycleStartDay);
  const dailyAllowance =
    safeAmount > 0 ? Math.floor(safeAmount / remainingDays) : 0;

  const velocity = spendingVelocity(transactions, month, now, cycleStartDay);
  const projectedRemainingSpend = velocity.perDay * Math.max(0, remainingDays - 1);
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

  if (expectedNotYetReceived > 0) {
    breakdown.push({
      id: "expected-income",
      label: "Salary still to land",
      amount: expectedNotYetReceived,
      direction: "add",
      hint: "Expected this cycle but not yet credited",
    });
  }

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

  const monthlySurplusBreakdown: BreakdownLine[] = [
    {
      id: "income",
      label: totals.income > expected ? "Income this month" : "Expected income",
      amount: incomeBasis,
      direction: "add",
      hint:
        totals.income > expected
          ? "What has actually landed, including one-offs"
          : "Your recurring salary, after deductions",
    },
    {
      id: "invested",
      label: "Already invested",
      amount: totals.invested,
      direction: "subtract",
      hint: "Moved into PPF, funds and deposits — not spending",
    },
  ];

  if (plannedInvestmentsLeft > 0) {
    monthlySurplusBreakdown.push({
      id: "planned-investments",
      label: "Investments still due",
      amount: plannedInvestmentsLeft,
      direction: "subtract",
      hint: "Held back so your monthly contributions stay on track",
    });
  }

  monthlySurplusBreakdown.push({
    id: "spent",
    label: "Spent so far",
    amount: totals.spent,
    direction: "subtract",
    hint: `${totals.expenseCount} ${totals.expenseCount === 1 ? "expense" : "expenses"} this month, across every payment method`,
  });

  if (upcomingTotal > 0) {
    monthlySurplusBreakdown.push({
      id: "upcoming",
      label: "Bills still to come",
      amount: upcomingTotal,
      direction: "subtract",
      hint: `${upcoming.length} recurring ${upcoming.length === 1 ? "charge" : "charges"} due before this cycle ends`,
    });
  }

  if (goalMoney > 0) {
    monthlySurplusBreakdown.push({
      id: "goals",
      label: "Set aside for goals",
      amount: goalMoney,
      direction: "subtract",
      hint: "Your monthly goal contributions",
    });
  }

  return {
    safeAmount,
    monthlySurplus,
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
