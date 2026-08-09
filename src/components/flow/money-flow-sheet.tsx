"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { groupIdOf } from "@/lib/domain/categories";
import { contextLabel } from "@/lib/domain/contexts";
import { formatMonthLong } from "@/lib/domain/dates";
import { formatMoney, percentOf } from "@/lib/domain/money";
import type { Transaction } from "@/lib/domain/types";
import {
  spendByAccount,
  spendByCategory,
  spendByContext,
  spendByGroup,
  spendByMerchant,
  total,
  type BreakdownSlice,
} from "@/lib/engine/analytics";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { BarList, StackedFlowBar, type FlowSegment } from "@/components/ui/charts";
import { SegmentedControl } from "@/components/ui/fields";
import { Sheet } from "@/components/ui/sheet";
import { Button, Chip } from "@/components/ui/primitives";
import { TransactionList } from "@/components/transactions/transaction-list";
import { cn } from "@/lib/utils";

/**
 * "Where did my money go?" (spec §9).
 *
 * A full-screen drill-down that starts with the shape of the whole month —
 * earned, invested, spent, committed, unallocated — and then lets you walk
 * into any part of it until you are looking at the individual transactions.
 *
 * Two views, because they answer different questions and only one of them
 * adds up to the total:
 *
 *   • By category — mutually exclusive, sums to total spending.
 *   • By context  — overlapping tags, so a dinner with friends counts under
 *     both "Friends" and "Alcohol". Shown as a share of spending, never as a
 *     share of each other.
 */

type Dimension = "category" | "context" | "merchant" | "account";

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "context", label: "Context" },
  { value: "merchant", label: "Merchant" },
  { value: "account", label: "Paid with" },
];

interface DrillTarget {
  dimension: Dimension;
  id: string;
  label: string;
}

export function MoneyFlowSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { monthRows, totals, safeToSpend, categories, month, db } = useFinance();
  const [dimension, setDimension] = useState<Dimension>("category");
  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const expenses = useMemo(
    () => monthRows.filter((t) => t.type === "EXPENSE"),
    [monthRows],
  );

  const slices = useMemo<BreakdownSlice[]>(() => {
    switch (dimension) {
      case "category":
        return spendByGroup(
          expenses,
          (id) => categories.byId.get(id)?.name ?? "Other",
        );
      case "context":
        return spendByContext(expenses, contextLabel);
      case "merchant":
        return spendByMerchant(expenses);
      case "account":
        return spendByAccount(expenses, db?.accounts ?? []);
    }
  }, [dimension, expenses, categories, db?.accounts]);

  const drillTransactions = useMemo<Transaction[]>(() => {
    if (!drill) return [];
    switch (drill.dimension) {
      case "category":
        return expenses.filter(
          (t) => t.categoryId && groupIdOf(t.categoryId) === drill.id,
        );
      case "context":
        return expenses.filter((t) =>
          t.contexts.some((c) => c.value === drill.id),
        );
      case "merchant":
        return expenses.filter((t) => t.merchant === drill.id);
      case "account":
        return expenses.filter(
          (t) => (t.accountId ?? "unassigned") === drill.id,
        );
    }
  }, [drill, expenses]);

  const drillSubSlices = useMemo<BreakdownSlice[]>(() => {
    if (!drill || drill.dimension !== "category") return [];
    return spendByCategory(
      drillTransactions,
      (id) => categories.nameOf(id),
      drill.id,
    );
  }, [drill, drillTransactions, categories]);

  // Unallocated is what the month's income has not yet been claimed by.
  const unallocated = Math.max(
    0,
    totals.income - totals.invested - totals.spent,
  );

  const segments: FlowSegment[] = [
    { id: "invested", label: "Invested", amount: totals.invested, tone: "accent" },
    { id: "spent", label: "Spent", amount: totals.spent, tone: "ink" },
    { id: "left", label: "Unallocated", amount: unallocated, tone: "muted" },
  ];

  return (
    <Sheet
      open={open}
      onClose={() => {
        setDrill(null);
        onClose();
      }}
      variant="full"
      title={drill ? drill.label : "Where your money went"}
      description={
        drill
          ? `${drillTransactions.length} ${drillTransactions.length === 1 ? "transaction" : "transactions"} · ${formatMoney(total(drillTransactions))}`
          : formatMonthLong(month)
      }
    >
      {drill ? (
        <div className="space-y-6 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDrill(null)}
            className="-ml-2"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Back to overview
          </Button>

          <div className="flex items-baseline gap-3">
            <Amount value={total(drillTransactions)} size="xl" />
            <span className="text-[13px] text-ink-tertiary">
              {percentOf(total(drillTransactions), totals.spent).toFixed(0)}% of
              this month&rsquo;s spending
            </span>
          </div>

          {drillSubSlices.length > 1 && (
            <section>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
                Broken down
              </h3>
              <BarList slices={drillSubSlices} showCount />
            </section>
          )}

          <section>
            <h3 className="mb-2 px-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
              Every transaction
            </h3>
            <TransactionList transactions={drillTransactions} showTime />
          </section>
        </div>
      ) : (
        <div className="space-y-8 py-2">
          {/* --- The shape of the month --- */}
          <section className="space-y-5">
            <FlowStep
              label="Earned"
              amount={totals.income}
              tone="positive"
              detail="Everything that came in this month"
              emphasis
            />
            <FlowStep
              label="Invested"
              amount={totals.invested}
              tone="accent"
              detail={
                totals.income > 0
                  ? `${percentOf(totals.invested, totals.income).toFixed(1)}% of income — moved, not spent`
                  : "Moved into assets, not spent"
              }
            />
            <FlowStep
              label="Spent"
              amount={totals.spent}
              tone="ink"
              detail={
                totals.income > 0
                  ? `${percentOf(totals.spent, totals.income).toFixed(1)}% of income, across ${totals.expenseCount} transactions`
                  : `${totals.expenseCount} transactions`
              }
            />
            <FlowStep
              label="Committed"
              amount={safeToSpend.cardOutstanding}
              tone="warning"
              detail="Owed on cards — already inside the spending above"
            />
            <FlowStep
              label="Unallocated"
              amount={unallocated}
              tone="muted"
              detail="Not yet spent, invested or assigned"
            />

            {totals.income > 0 && (
              <StackedFlowBar segments={segments} className="pt-1" />
            )}

            {totals.transferred > 0 && (
              <p className="text-[12.5px] leading-relaxed text-ink-tertiary">
                <Chip tone="neutral" className="mr-1.5">
                  {formatMoney(totals.transferred)} moved
                </Chip>
                Transfers between your own accounts, including card payments.
                Deliberately excluded from spending — the purchases behind them
                are already counted above.
              </p>
            )}
          </section>

          {/* --- Explore the spending --- */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
                Explore {formatMoney(totals.spent)} of spending
              </h3>
            </div>

            <SegmentedControl
              label="Break spending down by"
              value={dimension}
              onChange={(value) => setDimension(value)}
              options={DIMENSIONS}
              className="max-w-md"
            />

            {dimension === "context" && (
              <p className="text-[12.5px] leading-relaxed text-ink-tertiary">
                Contexts overlap — one dinner can be both{" "}
                <span className="font-medium text-ink-secondary">Friends</span>{" "}
                and{" "}
                <span className="font-medium text-ink-secondary">Alcohol</span>.
                These add up to more than your total spending, and that is
                correct: the same money is answering more than one question.
              </p>
            )}

            <BarList
              slices={slices}
              showCount
              onSelect={(slice) =>
                setDrill({
                  dimension,
                  id: slice.id,
                  label: slice.label,
                })
              }
              emptyLabel="No spending recorded this month"
            />
          </section>
        </div>
      )}
    </Sheet>
  );
}

function FlowStep({
  label,
  amount,
  detail,
  tone,
  emphasis,
}: {
  label: string;
  amount: number;
  detail: string;
  tone: "positive" | "accent" | "ink" | "warning" | "muted";
  emphasis?: boolean;
}) {
  const dots = {
    positive: "bg-positive",
    accent: "bg-accent",
    ink: "bg-ink",
    warning: "bg-warning",
    muted: "bg-line-strong",
  };

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", dots[tone])}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span
            className={cn(
              "text-[14.5px]",
              emphasis ? "font-semibold text-ink" : "font-medium text-ink",
            )}
          >
            {label}
          </span>
          <Amount value={amount} size={emphasis ? "lg" : "md"} />
        </div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">
          {detail}
        </p>
      </div>
    </div>
  );
}
