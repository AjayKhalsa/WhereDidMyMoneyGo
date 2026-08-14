"use client";

import { groupIdOf } from "@/lib/domain/categories";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { formatMonthLabel, previousMonths } from "@/lib/domain/dates";
import { percentOf } from "@/lib/domain/money";
import {
  compareToAverage,
  investmentRate,
  isExpense,
  monthTransactions,
  spendByGroup,
  total,
} from "@/lib/engine/analytics";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount, DeltaBadge } from "@/components/ui/amount";
import { Sparkline } from "@/components/ui/charts";
import { cn } from "@/lib/utils";

/**
 * The monthly recap (spec §25).
 *
 * Written as a summary a person would recognise, not an accounting statement:
 * the four figures that define the month, the top five things you spent on,
 * and three judgements — biggest change, best habit, biggest leak — each of
 * which is computed, not editorialised.
 */

export function MonthlyRecap() {
  const money = useMoneyText();
  const { db, month, cycleStartDay, totals, groupBreakdown, safeToSpend } = useFinance();

  const transactions = db?.transactions ?? [];
  const top = groupBreakdown.slice(0, 5);

  // Biggest mover: the category group with the largest percentage swing
  // against its own history, ignoring trivial amounts.
  const movers = groupBreakdown
    .filter((slice) => slice.amount >= 100_000)
    .map((slice) => ({
      slice,
      comparison: compareToAverage(
        transactions,
        month,
        (t) => Boolean(t.categoryId) && groupIdOf(t.categoryId!) === slice.id,
        3,
        cycleStartDay,
      ),
    }))
    .filter((m) => m.comparison.percentChange !== null)
    .sort(
      (a, b) =>
        Math.abs(b.comparison.percentChange ?? 0) -
        Math.abs(a.comparison.percentChange ?? 0),
    );
  const biggestChange = movers[0];

  const spark = [...previousMonths(month, 5, cycleStartDay), month].map((m) =>
    total(monthTransactions(transactions, m, cycleStartDay).filter(isExpense)),
  );

  const invRate = investmentRate(totals);

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
            {formatMonthLabel(month, cycleStartDay)} money report
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-secondary">
            {totals.expenseCount}{" "}
            {totals.expenseCount === 1 ? "transaction" : "transactions"} ·{" "}
            {safeToSpend.remainingDays > 0
              ? `${safeToSpend.remainingDays} days still to go`
              : "Month complete"}
          </p>
        </div>
        {spark.some((v) => v > 0) && (
          <Sparkline values={spark} tone="accent" />
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-line py-5 sm:grid-cols-4">
        <Figure label="Income" value={totals.income} />
        <Figure
          label="Invested"
          value={totals.invested}
          sub={totals.income > 0 ? `${invRate.toFixed(1)}%` : undefined}
        />
        <Figure
          label="Spent"
          value={totals.spent}
          sub={
            totals.income > 0
              ? `${percentOf(totals.spent, totals.income).toFixed(1)}%`
              : undefined
          }
        />
        <Figure label="Committed" value={safeToSpend.cardOutstanding} />
      </dl>

      {top.length > 0 && (
        <section className="mt-5">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
            Top spending
          </h3>
          <ol className="mt-2.5 space-y-2">
            {top.map((slice, index) => (
              <li
                key={slice.id}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span className="w-4 shrink-0 text-[13px] text-ink-faint tnum">
                    {index + 1}
                  </span>
                  <span className="truncate text-[14px] text-ink">
                    {slice.label}
                  </span>
                </span>
                <span className="shrink-0 text-[14px] font-medium text-ink tnum">
                  {money(slice.amount)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-3">
        <Verdict
          label="Biggest change"
          headline={biggestChange?.slice.label ?? "Not enough history"}
          detail={
            biggestChange ? (
              <DeltaBadge
                percent={biggestChange.comparison.percentChange}
              />
            ) : (
              <span className="text-[12.5px] text-ink-tertiary">
                Comes after a couple of months
              </span>
            )
          }
        />
        <Verdict
          label="Best habit"
          headline={
            totals.invested > 0 ? "Investing" : "Nothing to celebrate yet"
          }
          detail={
            totals.invested > 0 ? (
              <span className="text-[13px] text-ink-secondary tnum">
                {money(totals.invested)} · {invRate.toFixed(0)}% of income
              </span>
            ) : (
              <span className="text-[12.5px] text-ink-tertiary">
                Record an investment to track this
              </span>
            )
          }
        />
        <Verdict
          label="Biggest leak"
          headline={top[0]?.label ?? "No spending yet"}
          detail={
            top[0] ? (
              <span className="text-[13px] text-ink-secondary tnum">
                {money(top[0].amount)} · {Math.round(top[0].share)}% of
                spending
              </span>
            ) : null
          }
        />
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-ink-secondary">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        <Amount value={value} size="md" />
        {sub && (
          <span className="text-[12px] text-ink-tertiary tnum">{sub}</span>
        )}
      </dd>
    </div>
  );
}

function Verdict({
  label,
  headline,
  detail,
}: {
  label: string;
  headline: string;
  detail: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0")}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-tertiary">
        {label}
      </p>
      <p className="mt-1.5 truncate text-[15px] font-medium text-ink">
        {headline}
      </p>
      <div className="mt-1">{detail}</div>
    </div>
  );
}
