"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { LENSES, matchesLens } from "@/lib/domain/lenses";
import { formatMoney } from "@/lib/domain/money";
import { compareToAverage, lensTotals } from "@/lib/engine/analytics";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount, DeltaBadge } from "@/components/ui/amount";
import { Sheet } from "@/components/ui/sheet";
import { TransactionList } from "@/components/transactions/transaction-list";
import type { LensResult } from "@/lib/engine/analytics";
import { cn } from "@/lib/utils";

/**
 * Answers to the questions the product promises to answer (spec §41).
 *
 * "How much did I spend on dating?", "…with friends?", "…on alcohol?" — each
 * of these is a lens over the same transactions, so the answers are exact and
 * never double-count. This is the closest V1 gets to a natural-language
 * assistant: the questions are pre-formed, the arithmetic is deterministic,
 * and every answer opens onto the transactions that produced it.
 */

export function LensAnswers() {
  const { monthRows, db, month, cycleStartDay } = useFinance();
  const [active, setActive] = useState<LensResult | null>(null);

  const results = useMemo(
    () => lensTotals(monthRows, LENSES).filter((r) => r.count > 0),
    [monthRows],
  );

  const comparison = useMemo(() => {
    if (!active) return null;
    return compareToAverage(
      db?.transactions ?? [],
      month,
      (t) => matchesLens(t, active.lens),
      3,
      cycleStartDay,
    );
  }, [active, db?.transactions, month, cycleStartDay]);

  if (results.length === 0) return null;

  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2">
        {results.map((result) => (
          <li key={result.lens.id}>
            <button
              type="button"
              onClick={() => setActive(result)}
              className={cn(
                "group flex w-full items-center justify-between gap-3 rounded-xl",
                "border border-line bg-surface px-4 py-3 text-left",
                "transition-all duration-200 ease-[var(--ease-out-soft)]",
                "hover:border-line-strong hover:shadow-[var(--shadow-subtle)]",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] text-ink-secondary">
                  {result.lens.question}
                </span>
                <span className="mt-1 flex items-baseline gap-2">
                  <Amount value={result.amount} size="md" />
                  <span className="text-[12px] text-ink-tertiary tnum">
                    {result.count}{" "}
                    {result.count === 1 ? "transaction" : "transactions"}
                  </span>
                </span>
              </span>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={1.75}
              />
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.lens.question}
        description={
          active
            ? `${formatMoney(active.amount)} across ${active.count} ${active.count === 1 ? "transaction" : "transactions"}`
            : undefined
        }
        size="lg"
      >
        {active && (
          <div className="space-y-6 py-1">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[12.5px] text-ink-secondary">This month</p>
                <div className="mt-1">
                  <Amount value={active.amount} size="lg" />
                </div>
              </div>
              {comparison && comparison.monthsCounted > 0 && (
                <>
                  <div>
                    <p className="text-[12.5px] text-ink-secondary">
                      {comparison.monthsCounted}-month average
                    </p>
                    <div className="mt-1">
                      <Amount
                        value={comparison.average}
                        size="lg"
                        className="text-ink-secondary"
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[12.5px] text-ink-secondary">Change</p>
                    <div className="mt-2">
                      <DeltaBadge percent={comparison.percentChange} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div>
              <p className="mb-2 text-[13px] leading-relaxed text-ink-secondary">
                Average of{" "}
                <span className="font-medium text-ink tnum">
                  {formatMoney(Math.round(active.amount / Math.max(1, active.count)))}
                </span>{" "}
                per transaction.
              </p>
              <TransactionList transactions={active.transactions} showTime />
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
