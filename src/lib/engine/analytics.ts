import { groupIdOf, UNCATEGORISED_ID } from "@/lib/domain/categories";
import {
  monthKey,
  monthKeyToDate,
  previousMonths,
  type MonthKey,
  daysBetween,
  elapsedDaysInMonth,
  daysInMonth,
} from "@/lib/domain/dates";
import { percentChange, sumBy } from "@/lib/domain/money";
import { applyLens, LENSES, type Lens } from "@/lib/domain/lenses";
import type {
  Account,
  CreditCardDetail,
  Investment,
  Paise,
  Transaction,
  TransactionType,
} from "@/lib/domain/types";

/**
 * The spending analytics engine (spec §34).
 *
 * Every function here is pure and synchronous: transactions in, numbers out.
 * No component is allowed to do financial arithmetic of its own — if a screen
 * shows a figure, it came from this file. That is what keeps the Home hero,
 * the insight card and the monthly recap from ever disagreeing with each
 * other about how much was spent on dining.
 *
 * The one rule that governs everything below: only `EXPENSE` rows are
 * spending. Investments and transfers move money without consuming it.
 */

export function isExpense(t: Transaction): boolean {
  return t.type === "EXPENSE";
}

export function inMonth(t: Transaction, key: MonthKey, cycleStartDay = 1): boolean {
  return monthKey(t.date, cycleStartDay) === key;
}

export function ofType(
  transactions: Transaction[],
  type: TransactionType,
): Transaction[] {
  return transactions.filter((t) => t.type === type);
}

export function monthTransactions(
  transactions: Transaction[],
  key: MonthKey,
  cycleStartDay = 1,
): Transaction[] {
  return transactions.filter((t) => inMonth(t, key, cycleStartDay));
}

export function total(transactions: Transaction[]): Paise {
  return sumBy(transactions, (t) => t.amount);
}

// ---------------------------------------------------------------------------
// Headline monthly figures
// ---------------------------------------------------------------------------

export interface MonthTotals {
  key: MonthKey;
  income: Paise;
  spent: Paise;
  invested: Paise;
  /** Money moved between accounts. Shown nowhere as spending — by design. */
  transferred: Paise;
  expenseCount: number;
}

export function monthTotals(
  transactions: Transaction[],
  key: MonthKey,
  cycleStartDay = 1,
): MonthTotals {
  let income = 0;
  let spent = 0;
  let invested = 0;
  let transferred = 0;
  let expenseCount = 0;

  for (const t of transactions) {
    if (!inMonth(t, key, cycleStartDay)) continue;
    switch (t.type) {
      case "INCOME":
        // A refund is money credited back against earlier spending, not new
        // income — it nets against `spent` instead. `spent` can legitimately
        // dip below what a naive expense-only sum would show if a refund
        // lands in a later cycle than the purchase; that's the honest figure.
        if (t.isRefund) spent -= t.amount;
        else income += t.amount;
        break;
      case "EXPENSE":
        spent += t.amount;
        expenseCount += 1;
        break;
      case "INVESTMENT":
        invested += t.amount;
        break;
      case "TRANSFER":
        transferred += t.amount;
        break;
    }
  }

  return { key, income, spent, invested, transferred, expenseCount };
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

export interface BreakdownSlice {
  id: string;
  label: string;
  amount: Paise;
  count: number;
  /** Share of the breakdown total, 0–100. */
  share: number;
}

function toSlices(
  buckets: Map<string, { amount: Paise; count: number }>,
  label: (id: string) => string,
): BreakdownSlice[] {
  const grand = [...buckets.values()].reduce((a, b) => a + b.amount, 0);
  return [...buckets.entries()]
    .map(([id, v]) => ({
      id,
      label: label(id),
      amount: v.amount,
      count: v.count,
      share: grand > 0 ? (v.amount / grand) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Spending by top-level category group.
 * Groups are mutually exclusive, so these slices sum to total spending —
 * this is the breakdown that answers "where did my money go?".
 */
export function spendByGroup(
  transactions: Transaction[],
  labelFor: (groupId: string) => string,
): BreakdownSlice[] {
  const buckets = new Map<string, { amount: Paise; count: number }>();
  for (const t of transactions) {
    const refund = t.type === "INCOME" && t.isRefund;
    if (!isExpense(t) && !refund) continue;
    const id = t.categoryId ? groupIdOf(t.categoryId) : UNCATEGORISED_ID;
    const bucket = buckets.get(id) ?? { amount: 0, count: 0 };
    bucket.amount += refund ? -t.amount : t.amount;
    // Only real expenses count toward "N expenses" — a refund reduces the
    // total but isn't itself a spending event.
    if (!refund) bucket.count += 1;
    buckets.set(id, bucket);
  }
  return toSlices(buckets, labelFor);
}

/** Spending by leaf category, optionally scoped to one group. */
export function spendByCategory(
  transactions: Transaction[],
  labelFor: (categoryId: string) => string,
  groupId?: string,
): BreakdownSlice[] {
  const buckets = new Map<string, { amount: Paise; count: number }>();
  for (const t of transactions) {
    const refund = t.type === "INCOME" && t.isRefund;
    if ((!isExpense(t) && !refund) || !t.categoryId) continue;
    if (groupId && groupIdOf(t.categoryId) !== groupId) continue;
    const bucket = buckets.get(t.categoryId) ?? { amount: 0, count: 0 };
    bucket.amount += refund ? -t.amount : t.amount;
    if (!refund) bucket.count += 1;
    buckets.set(t.categoryId, bucket);
  }
  return toSlices(buckets, labelFor);
}

/**
 * Spending by context tag.
 *
 * These slices deliberately do NOT sum to total spending: one dinner can be
 * both "friends" and "alcohol". That is the point of contexts — the same
 * money answers several questions. Never render this as a share-of-total.
 */
export function spendByContext(
  transactions: Transaction[],
  labelFor: (value: string) => string,
): BreakdownSlice[] {
  const buckets = new Map<string, { amount: Paise; count: number }>();
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    for (const c of t.contexts) {
      const bucket = buckets.get(c.value) ?? { amount: 0, count: 0 };
      bucket.amount += t.amount;
      bucket.count += 1;
      buckets.set(c.value, bucket);
    }
  }
  const spent = total(transactions.filter(isExpense));
  return [...buckets.entries()]
    .map(([id, v]) => ({
      id,
      label: labelFor(id),
      amount: v.amount,
      count: v.count,
      share: spent > 0 ? (v.amount / spent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function spendByMerchant(transactions: Transaction[]): BreakdownSlice[] {
  const buckets = new Map<string, { amount: Paise; count: number }>();
  for (const t of transactions) {
    if (!isExpense(t) || !t.merchant) continue;
    const bucket = buckets.get(t.merchant) ?? { amount: 0, count: 0 };
    bucket.amount += t.amount;
    bucket.count += 1;
    buckets.set(t.merchant, bucket);
  }
  return toSlices(buckets, (id) => id);
}

export function spendByAccount(
  transactions: Transaction[],
  accounts: Account[],
): BreakdownSlice[] {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const buckets = new Map<string, { amount: Paise; count: number }>();
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    const id = t.accountId ?? "unassigned";
    const bucket = buckets.get(id) ?? { amount: 0, count: 0 };
    bucket.amount += t.amount;
    bucket.count += 1;
    buckets.set(id, bucket);
  }
  return toSlices(buckets, (id) => names.get(id) ?? "Unassigned");
}

// ---------------------------------------------------------------------------
// Averages and trends
// ---------------------------------------------------------------------------

/** Total spending in each of the N months before `key`, oldest first. */
export function monthlySpendHistory(
  transactions: Transaction[],
  key: MonthKey,
  months: number,
  cycleStartDay = 1,
): { key: MonthKey; amount: Paise }[] {
  return previousMonths(key, months, cycleStartDay).map((m) => ({
    key: m,
    amount: total(monthTransactions(transactions, m, cycleStartDay).filter(isExpense)),
  }));
}

/**
 * Average monthly spend over the N months before `key`.
 *
 * Months with no data at all are excluded rather than counted as zero — a
 * freshly installed app should not claim your spending has risen 400%
 * because two of the last three months are empty.
 */
export function averageMonthlySpend(
  transactions: Transaction[],
  key: MonthKey,
  months = 3,
  cycleStartDay = 1,
): { average: Paise; monthsCounted: number } {
  const history = monthlySpendHistory(transactions, key, months, cycleStartDay);
  const active = history.filter((h) => h.amount > 0);
  if (active.length === 0) return { average: 0, monthsCounted: 0 };
  return {
    average: Math.round(
      active.reduce((a, b) => a + b.amount, 0) / active.length,
    ),
    monthsCounted: active.length,
  };
}

export interface ComparisonResult {
  current: Paise;
  average: Paise;
  difference: Paise;
  /** Null when there is no history to compare against. */
  percentChange: number | null;
  monthsCounted: number;
}

/** Compares a filtered slice of this month against the same slice historically. */
export function compareToAverage(
  transactions: Transaction[],
  key: MonthKey,
  predicate: (t: Transaction) => boolean,
  months = 3,
  cycleStartDay = 1,
): ComparisonResult {
  const matching = transactions.filter((t) => isExpense(t) && predicate(t));
  const current = total(monthTransactions(matching, key, cycleStartDay));
  const history = previousMonths(key, months, cycleStartDay).map((m) =>
    total(monthTransactions(matching, m, cycleStartDay)),
  );
  const active = history.filter((amount) => amount > 0);
  const average =
    active.length > 0
      ? Math.round(active.reduce((a, b) => a + b, 0) / active.length)
      : 0;
  return {
    current,
    average,
    difference: current - average,
    percentChange: percentChange(current, average),
    monthsCounted: active.length,
  };
}

export function monthOverMonthChange(
  transactions: Transaction[],
  key: MonthKey,
  cycleStartDay = 1,
): ComparisonResult {
  const previous = previousMonths(key, 1, cycleStartDay)[0]!;
  const current = total(monthTransactions(transactions, key, cycleStartDay).filter(isExpense));
  const base = total(monthTransactions(transactions, previous, cycleStartDay).filter(isExpense));
  return {
    current,
    average: base,
    difference: current - base,
    percentChange: percentChange(current, base),
    monthsCounted: base > 0 ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Behavioural patterns
// ---------------------------------------------------------------------------

export interface VelocityResult {
  spentSoFar: Paise;
  daysElapsed: number;
  perDay: Paise;
  /** Straight-line projection of where the month lands at this pace. */
  projectedMonthEnd: Paise;
}

export function spendingVelocity(
  transactions: Transaction[],
  key: MonthKey,
  now: Date,
  cycleStartDay = 1,
): VelocityResult {
  const spentSoFar = total(monthTransactions(transactions, key, cycleStartDay).filter(isExpense));
  const daysElapsed = Math.max(1, elapsedDaysInMonth(now, key, cycleStartDay));
  const perDay = Math.round(spentSoFar / daysElapsed);
  return {
    spentSoFar,
    daysElapsed,
    perDay,
    projectedMonthEnd: perDay * daysInMonth(key, cycleStartDay),
  };
}

export interface WeekendSplit {
  weekend: Paise;
  weekday: Paise;
  /** Share of spending that happened on Sat/Sun, 0–100. */
  weekendShare: number;
}

export function weekendSplit(transactions: Transaction[]): WeekendSplit {
  let weekend = 0;
  let weekday = 0;
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    const day = new Date(t.date).getDay();
    if (day === 0 || day === 6) weekend += t.amount;
    else weekday += t.amount;
  }
  const grand = weekend + weekday;
  return {
    weekend,
    weekday,
    weekendShare: grand > 0 ? (weekend / grand) * 100 : 0,
  };
}

export type TimeBand = "morning" | "afternoon" | "evening" | "night";

export function timeBandOf(date: string | Date): TimeBand {
  const hour = (typeof date === "string" ? new Date(date) : date).getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export function spendByTimeOfDay(
  transactions: Transaction[],
): Record<TimeBand, Paise> {
  const out: Record<TimeBand, Paise> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    out[timeBandOf(t.date)] += t.amount;
  }
  return out;
}

/** Share of spending that happened after a given hour, 0–100. */
export function shareAfterHour(transactions: Transaction[], hour: number): number {
  let after = 0;
  let all = 0;
  for (const t of transactions) {
    if (!isExpense(t)) continue;
    all += t.amount;
    if (new Date(t.date).getHours() >= hour) after += t.amount;
  }
  return all > 0 ? (after / all) * 100 : 0;
}

export function averageTransactionSize(transactions: Transaction[]): Paise {
  const expenses = transactions.filter(isExpense);
  if (expenses.length === 0) return 0;
  return Math.round(total(expenses) / expenses.length);
}

/** Expenses far above the user's own norm — candidates for "that was big". */
export function outlierTransactions(
  transactions: Transaction[],
  multiple = 3,
): Transaction[] {
  const expenses = transactions.filter(isExpense);
  if (expenses.length < 5) return [];
  const average = averageTransactionSize(expenses);
  if (average <= 0) return [];
  return expenses
    .filter((t) => t.amount >= average * multiple)
    .sort((a, b) => b.amount - a.amount);
}

export interface FrequencyPattern {
  label: string;
  count: number;
  amount: Paise;
  averageAmount: Paise;
}

/** Small purchases repeated often — the classic invisible money leak. */
export function highFrequencySmallSpends(
  transactions: Transaction[],
  maxAmount: Paise,
  minCount: number,
): FrequencyPattern[] {
  const buckets = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (!isExpense(t) || t.amount > maxAmount) continue;
    const label = t.merchant ?? t.description;
    if (!label) continue;
    const key = label.toLowerCase();
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }
  const out: FrequencyPattern[] = [];
  for (const list of buckets.values()) {
    if (list.length < minCount) continue;
    const amount = total(list);
    out.push({
      label: list[0]!.merchant ?? list[0]!.description,
      count: list.length,
      amount,
      averageAmount: Math.round(amount / list.length),
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Lenses
// ---------------------------------------------------------------------------

export interface LensResult {
  lens: Lens;
  amount: Paise;
  count: number;
  transactions: Transaction[];
}

export function lensTotals(
  transactions: Transaction[],
  lenses: Lens[] = LENSES,
): LensResult[] {
  return lenses
    .map((lens) => {
      const matched = applyLens(transactions, lens);
      return {
        lens,
        amount: total(matched),
        count: matched.length,
        transactions: matched,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/** Share of income put into investments, 0–100. */
export function investmentRate(totals: MonthTotals): number {
  if (totals.income <= 0) return 0;
  return (totals.invested / totals.income) * 100;
}

/**
 * Share of income not consumed, 0–100.
 * Investments count as saved, because they are — the money still belongs to
 * the user. Transfers are ignored entirely.
 */
export function savingsRate(totals: MonthTotals): number {
  if (totals.income <= 0) return 0;
  return ((totals.income - totals.spent) / totals.income) * 100;
}

/**
 * How steady spending is week to week, 0–100 (higher is steadier).
 * Built from the coefficient of variation of daily spend, which is stable
 * across very different income levels.
 */
export function spendingConsistency(
  transactions: Transaction[],
  key: MonthKey,
  now: Date,
  cycleStartDay = 1,
): number {
  const days = elapsedDaysInMonth(now, key, cycleStartDay);
  if (days < 5) return 50;
  const daily = new Array<number>(days).fill(0);
  const cycleStart = monthKeyToDate(key);
  for (const t of monthTransactions(transactions, key, cycleStartDay)) {
    if (!isExpense(t)) continue;
    const dayIndex = daysBetween(cycleStart, new Date(t.date));
    if (dayIndex >= 0 && dayIndex < days) {
      daily[dayIndex] = (daily[dayIndex] ?? 0) + t.amount;
    }
  }
  const mean = daily.reduce((a, b) => a + b, 0) / days;
  if (mean <= 0) return 100;
  const variance =
    daily.reduce((acc, v) => acc + (v - mean) ** 2, 0) / days;
  const cv = Math.sqrt(variance) / mean;
  // A CV of 0 is perfectly even; 2.0 or more is wildly lumpy.
  return Math.max(0, Math.min(100, Math.round(100 - (cv / 2) * 100)));
}

// ---------------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------------

/**
 * What is currently owed on a credit card.
 *
 * Outstanding = everything charged to the card, minus everything paid toward
 * it. Payments arrive as TRANSFER rows with `toAccountId` set to the card,
 * which is precisely why paying a card must never create an expense: the
 * underlying purchases are already counted, and the payment only reduces
 * this balance (spec §17).
 */
export function creditCardOutstanding(
  transactions: Transaction[],
  cardAccountId: string,
): Paise {
  let charged = 0;
  let paid = 0;
  for (const t of transactions) {
    if (t.type === "EXPENSE" && t.accountId === cardAccountId) {
      charged += t.amount;
    } else if (t.type === "TRANSFER" && t.toAccountId === cardAccountId) {
      paid += t.amount;
    } else if (t.type === "TRANSFER" && t.accountId === cardAccountId) {
      // A cash advance or a refund routed out of the card increases the debt.
      charged += t.amount;
    } else if (t.type === "INCOME" && t.isRefund && t.accountId === cardAccountId) {
      // A merchant refund credited back to the card reduces what's owed —
      // this works whether or not it's linked to the original charge, since
      // only "landed back in the card account" matters here.
      charged -= t.amount;
    }
  }
  return Math.max(0, charged - paid);
}

export interface CreditCardSummary {
  account: Account;
  detail?: CreditCardDetail;
  outstanding: Paise;
  spentThisMonth: Paise;
  dueDate: Date | null;
  daysUntilDue: number | null;
  utilisation: number | null;
}

export function summariseCreditCard(
  account: Account,
  detail: CreditCardDetail | undefined,
  transactions: Transaction[],
  key: MonthKey,
  now: Date,
  cycleStartDay = 1,
): CreditCardSummary {
  const outstanding = creditCardOutstanding(transactions, account.id);
  const spentThisMonth = total(
    monthTransactions(transactions, key, cycleStartDay).filter(
      (t) => isExpense(t) && t.accountId === account.id,
    ),
  );

  let dueDate: Date | null = null;
  let daysUntilDue: number | null = null;
  if (detail) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), detail.dueDay);
    // If this month's due date has passed, the next one is what matters.
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    dueDate = candidate;
    daysUntilDue = Math.round(
      (new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate()).getTime() -
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
        86_400_000,
    );
  }

  return {
    account,
    detail,
    outstanding,
    spentThisMonth,
    dueDate,
    daysUntilDue,
    utilisation:
      detail && detail.creditLimit > 0
        ? (outstanding / detail.creditLimit) * 100
        : null,
  };
}

/** Total already-committed money across every credit card. */
export function totalCommitted(
  accounts: Account[],
  transactions: Transaction[],
): Paise {
  return accounts
    .filter((a) => a.type === "CREDIT_CARD" && a.isActive)
    .reduce((acc, a) => acc + creditCardOutstanding(transactions, a.id), 0);
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/**
 * Live balance of a spendable (bank/cash) account.
 * Credit cards are excluded here — a card has an outstanding, not a balance.
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
): Paise {
  let balance = account.openingBalance;
  for (const t of transactions) {
    if (t.accountId === account.id) {
      if (t.type === "INCOME") balance += t.amount;
      else balance -= t.amount; // expense, transfer out, investment out
    }
    if (t.toAccountId === account.id && t.type === "TRANSFER") {
      // Money landing in a bank account from elsewhere.
      if (account.type !== "CREDIT_CARD") balance += t.amount;
    }
  }
  return balance;
}

/** Cash actually available across bank and cash accounts. */
export function liquidBalance(
  accounts: Account[],
  transactions: Transaction[],
): Paise {
  return accounts
    .filter((a) => a.isActive && (a.type === "BANK" || a.type === "CASH"))
    .reduce((acc, a) => acc + accountBalance(a, transactions), 0);
}

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------

export interface InvestmentBreakdown {
  investment: Investment;
  contributed: Paise;
  planned: Paise;
}

export function investmentContributions(
  investments: Investment[],
  transactions: Transaction[],
  key: MonthKey,
  cycleStartDay = 1,
): InvestmentBreakdown[] {
  const monthly = monthTransactions(transactions, key, cycleStartDay).filter(
    (t) => t.type === "INVESTMENT",
  );
  return investments
    .filter((i) => i.isActive)
    .map((investment) => ({
      investment,
      contributed: total(monthly.filter((t) => t.investmentId === investment.id)),
      planned: investment.monthlyContribution,
    }))
    .sort((a, b) => b.contributed - a.contributed || b.planned - a.planned);
}
