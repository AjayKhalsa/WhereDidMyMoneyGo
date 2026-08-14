"use client";

import { useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import {
  filterTransactions,
  isFilterEmpty,
  mergeFilters,
  parseSearchQuery,
  summariseResults,
  type TransactionFilter,
} from "@/lib/engine/search";
import { useFinance } from "@/lib/hooks/use-finance";
import { PageHeader } from "@/components/layout/month-switcher";
import {
  FilterBar,
  rangeToFilter,
  type RangePreset,
} from "@/components/transactions/filter-bar";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Amount } from "@/components/ui/amount";
import { Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { pluralise } from "@/lib/utils";

/**
 * Transactions (spec §29, §30).
 *
 * The complete record, and the only screen in the app that is a list first.
 * It exists to answer specific questions — "what did that weekend cost?",
 * "how much have I spent on cabs since July?" — so the summary line above the
 * list is the real output. The rows are the evidence for it.
 *
 * This screen ignores the global month switcher: a search that spans months
 * would be meaningless if a month picker were silently narrowing it. The date
 * range is part of the query instead.
 */

export default function TransactionsPage() {
  const money = useMoneyText();
  const { status, db, now, categories, cycleStartDay } = useFinance();

  const [query, setQuery] = useState("");
  const [barFilter, setBarFilter] = useState<TransactionFilter>({});
  const [range, setRange] = useState<RangePreset>("month");

  const transactions = useMemo(() => db?.transactions ?? [], [db?.transactions]);

  const parsed = useMemo(
    () =>
      parseSearchQuery(query, {
        categories: db?.categories ?? [],
        accounts: db?.accounts ?? [],
        now,
        cycleStartDay,
      }),
    [query, db?.categories, db?.accounts, now, cycleStartDay],
  );

  const filter = useMemo(
    () =>
      mergeFilters(
        { ...rangeToFilter(range, now, cycleStartDay), ...barFilter },
        parsed.filter,
      ),
    [range, now, cycleStartDay, barFilter, parsed.filter],
  );

  const results = useMemo(
    () => filterTransactions(transactions, filter),
    [transactions, filter],
  );

  const summary = useMemo(() => summariseResults(results), [results]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const narrowed =
    Boolean(query.trim()) || !isFilterEmpty(barFilter) || range !== "all";

  function clearAll() {
    setQuery("");
    setBarFilter({});
    setRange("all");
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Transactions"
        description="Everything you've recorded, searchable."
      />

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        filter={barFilter}
        onFilterChange={setBarFilter}
        range={range}
        onRangeChange={setRange}
        terms={parsed.terms}
        onClear={clearAll}
        hasFilters={narrowed}
      />

      {results.length > 0 && (
        <ResultSummary
          headline={describeResults(parsed.terms.map((t) => t.label))}
          summary={summary}
        />
      )}

      {results.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-5 w-5" strokeWidth={1.5} />}
          title={
            transactions.length === 0
              ? "Nothing recorded yet"
              : "No transactions match that"
          }
          description={
            transactions.length === 0
              ? "Add your first expense and it will show up here."
              : "Try widening the date range, or clearing a filter."
          }
          action={
            narrowed && transactions.length > 0 ? (
              <Button onClick={clearAll}>Clear filters</Button>
            ) : undefined
          }
        />
      ) : (
        <TransactionList transactions={results} showTime />
      )}

      {summary.largest && results.length > 3 && (
        <p className="pb-2 text-[12.5px] leading-relaxed text-ink-tertiary">
          Largest single expense here:{" "}
          <span className="font-medium text-ink-secondary">
            {summary.largest.description}
          </span>{" "}
          at {money(summary.largest.amount)}
          {summary.largest.categoryId &&
            ` · ${categories.pathOf(summary.largest.categoryId)}`}
          .
        </p>
      )}
    </div>
  );
}

/**
 * The answer, stated as a sentence before the evidence.
 *
 * Income and moved money are reported separately from spending rather than
 * folded into one figure — the whole product rests on those being different
 * kinds of money.
 */
function ResultSummary({
  headline,
  summary,
}: {
  headline: string;
  summary: ReturnType<typeof summariseResults>;
}) {
  const money = useMoneyText();
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <p className="text-[13px] text-ink-secondary">{headline}</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {summary.expenseCount > 0 && (
          <div>
            <Amount value={summary.spent} size="lg" />
            <p className="mt-0.5 text-[12px] text-ink-tertiary">
              across {summary.expenseCount}{" "}
              {pluralise(summary.expenseCount, "expense")} · avg{" "}
              {money(summary.averageExpense)}
            </p>
          </div>
        )}

        {summary.income > 0 && (
          <div>
            <Amount value={summary.income} size="md" className="text-positive" />
            <p className="mt-0.5 text-[12px] text-ink-tertiary">received</p>
          </div>
        )}

        {summary.moved > 0 && (
          <div>
            <Amount
              value={summary.moved}
              size="md"
              className="text-ink-secondary"
            />
            <p className="mt-0.5 text-[12px] text-ink-tertiary">
              moved, not spent
            </p>
          </div>
        )}
      </div>

      {summary.expenseCount === 0 && summary.count > 0 && (
        <p className="mt-1.5 text-[12.5px] text-ink-tertiary">
          {summary.count} {pluralise(summary.count, "row")}, none of them
          spending.
        </p>
      )}
    </div>
  );
}

/** "July · Dating spend" — built from whatever the query was understood to mean. */
function describeResults(labels: string[]): string {
  if (labels.length === 0) return "Everything in range";
  return labels.join(" · ");
}
