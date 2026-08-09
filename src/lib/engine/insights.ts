import { groupIdOf } from "@/lib/domain/categories";
import { contextLabel } from "@/lib/domain/contexts";
import {
  endOfMonth,
  formatDayMonth,
  formatMonthLabel,
  previousMonths,
  type MonthKey,
} from "@/lib/domain/dates";
import { formatMoney, percentOf } from "@/lib/domain/money";
import { LENSES, matchesLens, type Lens } from "@/lib/domain/lenses";
import type {
  Account,
  Goal,
  Investment,
  Paise,
  Transaction,
} from "@/lib/domain/types";
import {
  averageTransactionSize,
  compareToAverage,
  creditCardOutstanding,
  highFrequencySmallSpends,
  investmentRate,
  isExpense,
  monthTotals,
  monthTransactions,
  outlierTransactions,
  savingsRate,
  shareAfterHour,
  spendByGroup,
  spendingVelocity,
  total,
  weekendSplit,
  type ComparisonResult,
} from "./analytics";

/**
 * The insight engine (spec §21–24).
 *
 * Two hard rules, both of which exist to make the output trustworthy:
 *
 *  1. Every insight is derived from `analytics.ts`. Nothing here invents a
 *     number, softens one, or rounds one differently than the rest of the app.
 *  2. Every insight carries the exact transactions behind it, so tapping the
 *     headline shows the receipts. If we can't show the working, we don't
 *     make the claim.
 *
 * Insights are also *rationed*. A screen that shouts every month teaches the
 * user to ignore it, so detectors have real thresholds and the strongest
 * "call me out" tone is reserved for genuine outliers.
 */

export type InsightTone = "positive" | "neutral" | "warning" | "alert";

export type InsightKind =
  | "category-spike"
  | "lens-spike"
  | "month-over-month"
  | "weekend-concentration"
  | "late-night"
  | "frequency"
  | "outlier"
  | "investment-rate"
  | "savings-rate"
  | "credit-commitment"
  | "velocity"
  | "goal-progress"
  | "merchant";

export interface Insight {
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  /** Short label, e.g. "Biggest money leak". */
  eyebrow: string;
  /** The claim, e.g. "Dating spending is up 75%". */
  title: string;
  /** The dominant figure. */
  amount?: Paise;
  /** One or two sentences of grounded explanation. */
  body: string;
  /** Comparison figures, when the insight is a comparison. */
  comparison?: ComparisonResult;
  /** The rows that produced the number. Always populated when drillable. */
  transactions: Transaction[];
  /** Higher surfaces first. */
  priority: number;
  /** Label for the drill-down action. */
  action?: string;
}

export interface InsightInput {
  transactions: Transaction[];
  accounts: Account[];
  goals: Goal[];
  investments: Investment[];
  month: MonthKey;
  now: Date;
  cycleStartDay: number;
  groupLabel: (groupId: string) => string;
}

const MIN_MEANINGFUL_AMOUNT = 100_000; // ₹1,000 in paise — below this, who cares

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/** Category groups spending well above their own 3-month norm. */
function detectCategorySpikes(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay, groupLabel } = input;
  const thisMonth = monthTransactions(transactions, month, cycleStartDay);
  const slices = spendByGroup(thisMonth, groupLabel);
  const out: Insight[] = [];

  for (const slice of slices.slice(0, 6)) {
    if (slice.amount < MIN_MEANINGFUL_AMOUNT) continue;
    const comparison = compareToAverage(
      transactions,
      month,
      (t) => Boolean(t.categoryId) && groupIdOf(t.categoryId!) === slice.id,
      3,
      cycleStartDay,
    );
    if (comparison.monthsCounted === 0) continue;
    if (comparison.percentChange === null || comparison.percentChange < 30) continue;

    const rows = thisMonth.filter(
      (t) => isExpense(t) && t.categoryId && groupIdOf(t.categoryId) === slice.id,
    );

    out.push({
      id: `category-spike:${slice.id}`,
      kind: "category-spike",
      tone: comparison.percentChange >= 60 ? "alert" : "warning",
      eyebrow: comparison.percentChange >= 60 ? "Money leak detected" : "Worth a look",
      title: `${slice.label} spending is up ${Math.round(comparison.percentChange)}%`,
      amount: comparison.current,
      body:
        `${formatMoney(comparison.current)} this month against a ${comparison.monthsCounted}-month average of ` +
        `${formatMoney(comparison.average)} — ${formatMoney(Math.abs(comparison.difference))} more than usual, ` +
        `across ${rows.length} ${rows.length === 1 ? "transaction" : "transactions"}.`,
      comparison,
      transactions: rows,
      priority: 70 + Math.min(25, comparison.percentChange / 4),
      action: "See what's driving it",
    });
  }
  return out;
}

/** Cross-cutting lenses — dating, alcohol, eating out — against their norm. */
function detectLensSpikes(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay } = input;
  const out: Insight[] = [];
  const watched: Lens[] = LENSES.filter((l) =>
    ["dating", "alcohol", "eating-out", "cabs", "friends"].includes(l.id),
  );

  for (const lens of watched) {
    const comparison = compareToAverage(
      transactions,
      month,
      (t) => matchesLens(t, lens),
      3,
      cycleStartDay,
    );
    if (comparison.current < MIN_MEANINGFUL_AMOUNT) continue;
    if (comparison.monthsCounted === 0) continue;
    if (comparison.percentChange === null || comparison.percentChange < 40) continue;

    const rows = monthTransactions(transactions, month, cycleStartDay).filter((t) =>
      matchesLens(t, lens),
    );
    const multiple = comparison.average > 0 ? comparison.current / comparison.average : 0;

    out.push({
      id: `lens-spike:${lens.id}`,
      kind: "lens-spike",
      tone: comparison.percentChange >= 100 ? "alert" : "warning",
      eyebrow: multiple >= 2 ? "Interesting…" : "Something I noticed",
      title: `${lens.label} is up ${Math.round(comparison.percentChange)}%`,
      amount: comparison.current,
      body:
        `${formatMoney(comparison.current)} this month. Your ${comparison.monthsCounted}-month average is ` +
        `${formatMoney(comparison.average)}` +
        (multiple >= 1.8 ? ` — that's ${multiple.toFixed(1)}× your usual.` : ".") +
        ` ${rows.length} ${rows.length === 1 ? "transaction" : "transactions"} make it up.`,
      comparison,
      transactions: rows,
      priority: 72 + Math.min(22, comparison.percentChange / 5),
      action: "Break it down",
    });
  }
  return out;
}

/** The single biggest category, framed as a leak when it dominates. */
function detectBiggestLeak(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay, groupLabel } = input;
  const thisMonth = monthTransactions(transactions, month, cycleStartDay);
  const slices = spendByGroup(thisMonth, groupLabel);
  const top = slices[0];
  if (!top || top.amount < MIN_MEANINGFUL_AMOUNT) return [];
  if (top.share < 22) return []; // nothing is dominating; not a story

  const rows = thisMonth.filter(
    (t) => isExpense(t) && t.categoryId && groupIdOf(t.categoryId) === top.id,
  );

  return [
    {
      id: `leak:${top.id}`,
      kind: "category-spike",
      tone: "neutral",
      eyebrow: "Biggest money leak",
      title: top.label,
      amount: top.amount,
      body: `${formatMoney(top.amount)} this month — ${Math.round(top.share)}% of everything you spent, over ${rows.length} ${rows.length === 1 ? "transaction" : "transactions"}.`,
      transactions: rows,
      priority: 55,
      action: "See transactions",
    },
  ];
}

function detectWeekendConcentration(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay } = input;
  const thisMonth = monthTransactions(transactions, month, cycleStartDay).filter(isExpense);
  if (thisMonth.length < 8) return [];
  const split = weekendSplit(thisMonth);
  if (split.weekendShare < 45 || split.weekend < MIN_MEANINGFUL_AMOUNT) return [];

  const rows = thisMonth.filter((t) => {
    const day = new Date(t.date).getDay();
    return day === 0 || day === 6;
  });

  return [
    {
      id: "weekend-concentration",
      kind: "weekend-concentration",
      tone: "neutral",
      eyebrow: "Pattern",
      title: `${Math.round(split.weekendShare)}% of your spending happens at weekends`,
      amount: split.weekend,
      body: `${formatMoney(split.weekend)} across Saturdays and Sundays, against ${formatMoney(split.weekday)} on the other five days.`,
      transactions: rows,
      priority: 45,
      action: "See weekend spending",
    },
  ];
}

function detectLateNight(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay } = input;
  const thisMonth = monthTransactions(transactions, month, cycleStartDay).filter(isExpense);
  if (thisMonth.length < 10) return [];
  const share = shareAfterHour(thisMonth, 20);
  if (share < 35) return [];

  const rows = thisMonth.filter((t) => new Date(t.date).getHours() >= 20);
  const amount = total(rows);
  if (amount < MIN_MEANINGFUL_AMOUNT) return [];

  return [
    {
      id: "late-night",
      kind: "late-night",
      tone: "neutral",
      eyebrow: "Pattern",
      title: `${Math.round(share)}% of your spending happens after 8 PM`,
      amount,
      body: `${formatMoney(amount)} across ${rows.length} evening ${rows.length === 1 ? "transaction" : "transactions"}. Late decisions tend to be looser ones.`,
      transactions: rows,
      priority: 40,
      action: "See evening spending",
    },
  ];
}

function detectFrequency(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay } = input;
  const thisMonth = monthTransactions(transactions, month, cycleStartDay);
  const patterns = highFrequencySmallSpends(thisMonth, 60_000, 6);
  const top = patterns[0];
  if (!top || top.amount < MIN_MEANINGFUL_AMOUNT) return [];

  const label = top.label.toLowerCase();
  const rows = thisMonth.filter(
    (t) =>
      isExpense(t) &&
      (t.merchant ?? t.description).toLowerCase() === label &&
      t.amount <= 60_000,
  );

  return [
    {
      id: `frequency:${label}`,
      kind: "frequency",
      tone: "neutral",
      eyebrow: "Small and often",
      title: `${top.count} ${top.label} charges add up to ${formatMoney(top.amount)}`,
      amount: top.amount,
      body: `Averaging ${formatMoney(top.averageAmount)} a time. Individually invisible, collectively not.`,
      transactions: rows,
      priority: 50,
      action: "See all of them",
    },
  ];
}

function detectOutlier(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay } = input;
  const thisMonth = monthTransactions(transactions, month, cycleStartDay);
  const outliers = outlierTransactions(thisMonth, 3);
  const biggest = outliers[0];
  if (!biggest) return [];
  const average = averageTransactionSize(thisMonth);
  if (average <= 0) return [];
  const multiple = biggest.amount / average;

  return [
    {
      id: `outlier:${biggest.id}`,
      kind: "outlier",
      tone: "neutral",
      eyebrow: "Largest single expense",
      title: biggest.description || "One big one",
      amount: biggest.amount,
      body: `${formatMoney(biggest.amount)} — ${multiple.toFixed(1)}× your average transaction of ${formatMoney(average)}.`,
      transactions: [biggest],
      priority: 42,
      action: "View transaction",
    },
  ];
}

function detectInvestmentRate(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay } = input;
  const totals = monthTotals(transactions, month, cycleStartDay);
  if (totals.income <= 0 || totals.invested <= 0) return [];
  const rate = investmentRate(totals);
  const rows = monthTransactions(transactions, month, cycleStartDay).filter(
    (t) => t.type === "INVESTMENT",
  );

  if (rate >= 25) {
    return [
      {
        id: "investment-rate",
        kind: "investment-rate",
        tone: "positive",
        eyebrow: "You're doing well",
        title: `${formatMoney(totals.invested)} invested this month`,
        amount: totals.invested,
        body: `That's ${rate.toFixed(1)}% of your income going into long-term assets, across ${rows.length} ${rows.length === 1 ? "contribution" : "contributions"}. Well above the 20% most people aim for.`,
        transactions: rows,
        priority: 68,
        action: "See contributions",
      },
    ];
  }
  if (rate < 10) {
    return [
      {
        id: "investment-rate-low",
        kind: "investment-rate",
        tone: "warning",
        eyebrow: "Worth a look",
        title: `Only ${rate.toFixed(1)}% of income invested`,
        amount: totals.invested,
        body: `${formatMoney(totals.invested)} out of ${formatMoney(totals.income)}. Nudging this toward 20% is the single highest-leverage change available to you.`,
        transactions: rows,
        priority: 60,
        action: "See contributions",
      },
    ];
  }
  return [];
}

function detectCreditCommitment(input: InsightInput): Insight[] {
  const { transactions, accounts, month, cycleStartDay } = input;
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD" && a.isActive);
  if (cards.length === 0) return [];

  const outstanding = cards.reduce(
    (acc, c) => acc + creditCardOutstanding(transactions, c.id),
    0,
  );
  if (outstanding < MIN_MEANINGFUL_AMOUNT) return [];

  const totals = monthTotals(transactions, month, cycleStartDay);
  const share = percentOf(outstanding, Math.max(1, totals.income));
  if (share < 12) return [];

  const cardIds = new Set(cards.map((c) => c.id));
  const rows = monthTransactions(transactions, month, cycleStartDay).filter(
    (t) => isExpense(t) && t.accountId && cardIds.has(t.accountId),
  );

  return [
    {
      id: "credit-commitment",
      kind: "credit-commitment",
      tone: "warning",
      eyebrow: "Already committed",
      title: `${formatMoney(outstanding)} is owed on your cards`,
      amount: outstanding,
      body: `That's ${Math.round(share)}% of a month's income. You've already spent this money — it just hasn't left your account yet.`,
      transactions: rows,
      priority: 64,
      action: "See card spending",
    },
  ];
}

function detectVelocity(input: InsightInput): Insight[] {
  const { transactions, month, now, cycleStartDay } = input;
  const velocity = spendingVelocity(transactions, month, now, cycleStartDay);
  if (velocity.daysElapsed < 5) return [];

  const history = previousMonths(month, 3, cycleStartDay)
    .map((m) => total(monthTransactions(transactions, m, cycleStartDay).filter(isExpense)))
    .filter((v) => v > 0);
  if (history.length === 0) return [];
  const average = history.reduce((a, b) => a + b, 0) / history.length;
  if (velocity.projectedMonthEnd <= average * 1.15) return [];

  const rows = monthTransactions(transactions, month, cycleStartDay).filter(isExpense);
  const over = velocity.projectedMonthEnd - average;

  return [
    {
      id: "velocity",
      kind: "velocity",
      tone: "warning",
      eyebrow: "Pace check",
      title: `On track to spend ${formatMoney(velocity.projectedMonthEnd)} this month`,
      amount: velocity.projectedMonthEnd,
      body: `You're averaging ${formatMoney(velocity.perDay)} a day over ${velocity.daysElapsed} days. Keep that up and you'll finish ${formatMoney(over)} above your usual ${formatMoney(Math.round(average))}.`,
      transactions: rows,
      priority: 66,
      action: "See this month",
    },
  ];
}

function detectGoalProgress(input: InsightInput): Insight[] {
  const { goals } = input;
  const out: Insight[] = [];
  for (const goal of goals) {
    if (goal.targetAmount <= 0) continue;
    const progress = percentOf(goal.currentAmount, goal.targetAmount);
    if (progress < 75 || progress >= 100) continue;
    const remaining = goal.targetAmount - goal.currentAmount;
    out.push({
      id: `goal:${goal.id}`,
      kind: "goal-progress",
      tone: "positive",
      eyebrow: "Almost there",
      title: `${goal.name} is ${Math.round(progress)}% funded`,
      amount: goal.currentAmount,
      body: `${formatMoney(remaining)} left to reach ${formatMoney(goal.targetAmount)}.`,
      transactions: [],
      priority: 48,
    });
  }
  return out;
}

function detectMonthOverMonth(input: InsightInput): Insight[] {
  const { transactions, month, cycleStartDay } = input;
  const previous = previousMonths(month, 1, cycleStartDay)[0]!;
  const currentRows = monthTransactions(transactions, month, cycleStartDay).filter(isExpense);
  const current = total(currentRows);
  const base = total(monthTransactions(transactions, previous, cycleStartDay).filter(isExpense));
  if (base < MIN_MEANINGFUL_AMOUNT || current < MIN_MEANINGFUL_AMOUNT) return [];

  const change = ((current - base) / base) * 100;
  // Only interesting when spending genuinely improved; increases are covered
  // by the more specific category and velocity detectors.
  if (change > -12) return [];

  return [
    {
      id: "mom-improvement",
      kind: "month-over-month",
      tone: "positive",
      eyebrow: "Better than last month",
      title: `Spending is down ${Math.abs(Math.round(change))}%`,
      amount: current,
      body: `${formatMoney(current)} so far against ${formatMoney(base)} in ${formatMonthLabel(previous, cycleStartDay)}.`,
      transactions: currentRows,
      priority: 58,
      action: "See this month",
    },
  ];
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

const DETECTORS: ((input: InsightInput) => Insight[])[] = [
  detectLensSpikes,
  detectCategorySpikes,
  detectVelocity,
  detectInvestmentRate,
  detectCreditCommitment,
  detectMonthOverMonth,
  detectBiggestLeak,
  detectFrequency,
  detectWeekendConcentration,
  detectLateNight,
  detectOutlier,
  detectGoalProgress,
];

export function generateInsights(input: InsightInput): Insight[] {
  const all = DETECTORS.flatMap((detector) => {
    try {
      return detector(input);
    } catch {
      // A single misbehaving detector must never take down the screen.
      return [];
    }
  });

  // De-duplicate: a category spike and a lens spike can describe the same
  // money (Dating group vs Dating lens). Keep the higher-priority telling.
  const seen = new Set<string>();
  const deduped: Insight[] = [];
  for (const insight of all.sort((a, b) => b.priority - a.priority)) {
    const fingerprint = `${insight.kind}:${insight.amount ?? 0}`;
    const overlapKey =
      insight.kind === "category-spike" || insight.kind === "lens-spike"
        ? `spike:${insight.amount}`
        : fingerprint;
    if (seen.has(overlapKey)) continue;
    seen.add(overlapKey);
    deduped.push(insight);
  }

  return deduped;
}

/**
 * The one insight worth interrupting the Home screen for.
 * Prefers a warning worth acting on, but will happily deliver good news when
 * there is nothing to flag — the tone should not always be scolding.
 */
export function headlineInsight(insights: Insight[]): Insight | undefined {
  return (
    insights.find((i) => i.tone === "alert") ??
    insights.find((i) => i.tone === "warning") ??
    insights.find((i) => i.tone === "positive") ??
    insights[0]
  );
}

// ---------------------------------------------------------------------------
// Financial score (spec §26)
// ---------------------------------------------------------------------------

export type ScoreRating = "Excellent" | "Good" | "Fair" | "Needs attention";

export interface ScoreFactor {
  id: string;
  label: string;
  rating: ScoreRating;
  /** 0–100 contribution before weighting. */
  score: number;
  weight: number;
  detail: string;
}

export interface FinancialScore {
  score: number;
  factors: ScoreFactor[];
  summary: string;
}

function rate(score: number): ScoreRating {
  if (score >= 80) return "Excellent";
  if (score >= 62) return "Good";
  if (score >= 42) return "Fair";
  return "Needs attention";
}

export interface ScoreInput {
  transactions: Transaction[];
  accounts: Account[];
  goals: Goal[];
  month: MonthKey;
  now: Date;
  cycleStartDay: number;
  consistency: number;
}

/**
 * A score built only from things the user can actually change, each shown
 * with its own rating so the number is never a black box.
 */
export function calculateFinancialScore(input: ScoreInput): FinancialScore {
  const { transactions, accounts, goals, month, now, cycleStartDay } = input;
  const totals = monthTotals(transactions, month, cycleStartDay);

  const invRate = investmentRate(totals);
  const savRate = savingsRate(totals);

  // Investment rate: 20% of income is the target, 35%+ is excellent.
  const investmentScore = Math.max(0, Math.min(100, (invRate / 30) * 100));

  // Savings rate: what's left after spending, target 30%.
  const savingsScore = Math.max(0, Math.min(100, (savRate / 45) * 100));

  // Consistency comes straight from the analytics engine.
  const consistencyScore = input.consistency;

  // Commitments: how much of income is locked up in card debt.
  const outstanding = accounts
    .filter((a) => a.type === "CREDIT_CARD" && a.isActive)
    .reduce((acc, a) => acc + creditCardOutstanding(transactions, a.id), 0);
  const commitmentRatio =
    totals.income > 0 ? outstanding / totals.income : outstanding > 0 ? 1 : 0;
  const commitmentScore = Math.max(0, Math.min(100, 100 - commitmentRatio * 250));

  // Pace: are we on course to overspend this month?
  const velocity = spendingVelocity(transactions, month, now, cycleStartDay);
  const paceScore =
    totals.income > 0
      ? Math.max(
          0,
          Math.min(100, 100 - Math.max(0, percentOf(velocity.projectedMonthEnd, totals.income) - 50) * 2),
        )
      : 50;

  // Goals: average funded progress, or neutral when none are set.
  const fundable = goals.filter((g) => g.targetAmount > 0);
  const goalScore =
    fundable.length === 0
      ? 60
      : Math.min(
          100,
          fundable.reduce(
            (acc, g) => acc + percentOf(g.currentAmount, g.targetAmount),
            0,
          ) / fundable.length,
        );

  const factors: ScoreFactor[] = [
    {
      id: "investment",
      label: "Investment rate",
      score: investmentScore,
      rating: rate(investmentScore),
      weight: 0.28,
      detail: `${invRate.toFixed(1)}% of income invested${totals.invested > 0 ? ` (${formatMoney(totals.invested)})` : ""}`,
    },
    {
      id: "savings",
      label: "Savings rate",
      score: savingsScore,
      rating: rate(savingsScore),
      weight: 0.22,
      detail: `${savRate.toFixed(1)}% of income not spent`,
    },
    {
      id: "consistency",
      label: "Spending consistency",
      score: consistencyScore,
      rating: rate(consistencyScore),
      weight: 0.15,
      detail:
        consistencyScore >= 62
          ? "Your daily spending is fairly even"
          : "Spending comes in unpredictable bursts",
    },
    {
      id: "commitments",
      label: "Recurring commitments",
      score: commitmentScore,
      rating: rate(commitmentScore),
      weight: 0.15,
      detail:
        outstanding > 0
          ? `${formatMoney(outstanding)} owed on cards — ${Math.round(commitmentRatio * 100)}% of a month's income`
          : "Nothing outstanding on cards",
    },
    {
      id: "pace",
      label: "Spending pace",
      score: paceScore,
      rating: rate(paceScore),
      weight: 0.12,
      detail: `On track for ${formatMoney(velocity.projectedMonthEnd)} by ${formatDayMonth(endOfMonth(month, cycleStartDay))}`,
    },
    {
      id: "goals",
      label: "Goal progress",
      score: goalScore,
      rating: rate(goalScore),
      weight: 0.08,
      detail:
        fundable.length === 0
          ? "No goals set yet"
          : `${fundable.length} ${fundable.length === 1 ? "goal" : "goals"}, ${Math.round(goalScore)}% funded on average`,
    },
  ];

  const score = Math.round(
    factors.reduce((acc, f) => acc + f.score * f.weight, 0),
  );

  const weakest = [...factors].sort((a, b) => a.score - b.score)[0];
  const strongest = [...factors].sort((a, b) => b.score - a.score)[0];

  const summary =
    score >= 75
      ? `Strong month. ${strongest?.label} is carrying it.`
      : score >= 55
        ? `Solid, with room to improve. ${weakest?.label} is the weak spot.`
        : `${weakest?.label} is what's holding this back.`;

  return { score, factors, summary };
}

/** Human label for a context value, used by insight copy. */
export function describeContext(value: string): string {
  return contextLabel(value);
}
