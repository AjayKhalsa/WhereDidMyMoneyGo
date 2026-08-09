import {
  daysInMonth,
  monthKey,
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
  isExpense,
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
 * The subtle part is credit cards. A naive implementation subtracts both
 * "spent this month" and "card outstanding", which double-counts every meal
 * you put on the card: the expense is already recorded, and the outstanding
 * balance is just the unpaid tail of those same expenses. So we subtract
 * spending in full, and then add back only the portion of card debt that was
 * *carried in from previous months*, since this month's income has to cover
 * that too but no expense row in this month represents it.
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
  /** Discretionary money left for the rest of the month. */
  safeAmount: Paise;
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

  breakdown: BreakdownLine[];
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
}

/** Net expected pay: gross minus the deductions that never reach the bank. */
export function expectedMonthlyIncome(sources: IncomeSource[]): Paise {
  return sources
    .filter((s) => s.isActive && s.recurring)
    .reduce((acc, s) => acc + Math.max(0, s.amount - s.deductions), 0);
}

/**
 * Recurring charges still to come this month.
 *
 * A bill is treated as already handled once a transaction from the same
 * recurring rule exists in this month, so the same ₹649 is never held back
 * twice.
 */
export function upcomingRecurring(
  recurring: RecurringTransaction[],
  transactions: Transaction[],
  month: MonthKey,
  now: Date,
): { rule: RecurringTransaction; dueDate: Date; amount: Paise }[] {
  const paidRuleIds = new Set(
    monthTransactions(transactions, month)
      .map((t) => t.recurringId)
      .filter((id): id is string => Boolean(id)),
  );
  const isCurrentMonth = monthKey(now) === month;
  const today = isCurrentMonth ? now.getDate() : 0;
  const lastDay = daysInMonth(month);

  const out: { rule: RecurringTransaction; dueDate: Date; amount: Paise }[] = [];
  for (const rule of recurring) {
    if (!rule.isActive) continue;
    if (paidRuleIds.has(rule.id)) continue;
    if (rule.frequency !== "MONTHLY") continue;

    const day = Math.min(Math.max(1, rule.dayOfPeriod), lastDay);
    if (day < today) continue; // already passed without being charged

    const [year, monthNumber] = month.split("-").map(Number);
    out.push({
      rule,
      dueDate: new Date(year ?? 1970, (monthNumber ?? 1) - 1, day),
      amount: rule.amount,
    });
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/** Planned investment contributions not yet made this month. */
export function remainingPlannedInvestments(
  investments: Investment[],
  transactions: Transaction[],
  month: MonthKey,
): Paise {
  const monthly = monthTransactions(transactions, month).filter(
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

/** Goal money earmarked out of this month's income and not yet set aside. */
export function goalAllocations(goals: Goal[]): Paise {
  return goals.reduce((acc, g) => {
    if (g.currentAmount >= g.targetAmount) return acc; // already funded
    return acc + Math.max(0, g.monthlyContribution);
  }, 0);
}

export function calculateSafeToSpend(
  input: SafeToSpendInput,
): SafeToSpendResult {
  const { transactions, accounts, month, now } = input;

  const totals = monthTotals(transactions, month);

  // --- Income basis -------------------------------------------------------
  // Plan against expected salary even before it lands, but if actual income
  // is higher (a bonus arrived) use the real figure.
  const expected = expectedMonthlyIncome(input.incomeSources);
  const incomeBasis = Math.max(expected, totals.income);

  // --- Card debt carried in from previous months --------------------------
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD" && a.isActive);
  const cardOutstanding = cards.reduce(
    (acc, card) => acc + creditCardOutstanding(transactions, card.id),
    0,
  );
  const cardSpendThisMonth = total(
    monthTransactions(transactions, month).filter(
      (t) => isExpense(t) && t.accountId && cards.some((c) => c.id === t.accountId),
    ),
  );
  // Anything owed beyond what was charged this month predates the month, so
  // it is a real claim on this month's income that no expense row covers.
  const carriedCardDebt = Math.max(0, cardOutstanding - cardSpendThisMonth);

  // --- Other commitments --------------------------------------------------
  const upcoming = upcomingRecurring(input.recurring, transactions, month, now);
  const upcomingTotal = upcoming.reduce((acc, u) => acc + u.amount, 0);
  const plannedInvestmentsLeft = remainingPlannedInvestments(
    input.investments,
    transactions,
    month,
  );
  const goalMoney = goalAllocations(input.goals);

  // --- The calculation ----------------------------------------------------
  const safeAmount =
    incomeBasis -
    totals.invested -
    plannedInvestmentsLeft -
    totals.spent -
    upcomingTotal -
    carriedCardDebt -
    goalMoney;

  const remainingDays = remainingDaysInMonth(now, month);
  const dailyAllowance =
    safeAmount > 0 ? Math.floor(safeAmount / remainingDays) : 0;

  const velocity = spendingVelocity(transactions, month, now);
  const projectedRemainingSpend = velocity.perDay * Math.max(0, remainingDays - 1);
  const projectedSurplus = safeAmount - projectedRemainingSpend;

  const bankBalance = liquidBalance(accounts, transactions);

  const breakdown: BreakdownLine[] = [
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
    breakdown.push({
      id: "planned-investments",
      label: "Investments still due",
      amount: plannedInvestmentsLeft,
      direction: "subtract",
      hint: "Held back so your monthly contributions stay on track",
    });
  }

  breakdown.push({
    id: "spent",
    label: "Spent so far",
    amount: totals.spent,
    direction: "subtract",
    hint: `${totals.expenseCount} ${totals.expenseCount === 1 ? "expense" : "expenses"} this month, across every payment method`,
  });

  if (upcomingTotal > 0) {
    breakdown.push({
      id: "upcoming",
      label: "Bills still to come",
      amount: upcomingTotal,
      direction: "subtract",
      hint: `${upcoming.length} recurring ${upcoming.length === 1 ? "charge" : "charges"} due before month end`,
    });
  }

  if (carriedCardDebt > 0) {
    breakdown.push({
      id: "carried-card",
      label: "Card debt carried over",
      amount: carriedCardDebt,
      direction: "subtract",
      hint: "Last month's balance — this month's spending is already counted above",
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

  return {
    safeAmount,
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
  };
}
