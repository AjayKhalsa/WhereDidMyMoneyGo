"use client";

import type { Insight } from "@/lib/engine/insights";
import { useMoneyText, useMaskedProse } from "@/lib/hooks/use-privacy";
import { Amount, DeltaBadge } from "@/components/ui/amount";
import { Sheet } from "@/components/ui/sheet";
import { TransactionList } from "@/components/transactions/transaction-list";
import { cn } from "@/lib/utils";

/**
 * The evidence behind an insight (spec §24).
 *
 * "Dating spending is 75% above average" is only worth showing if the four
 * dinners that caused it are one tap away. Nothing here is recomputed — the
 * insight carries its own transactions, so this list is guaranteed to be the
 * exact set the headline number was calculated from.
 */

export function InsightDetailSheet({
  insight,
  onClose,
}: {
  insight: Insight | null;
  onClose: () => void;
}) {
  const prose = useMaskedProse();
  const money = useMoneyText();
  const comparison = insight?.comparison;

  return (
    <Sheet
      open={Boolean(insight)}
      onClose={onClose}
      title={insight ? prose(insight.title) : undefined}
      description={insight?.eyebrow}
      size="lg"
    >
      {insight && (
        <div className="space-y-6 py-1">
          <p className="text-[14px] leading-relaxed text-ink-secondary">
            {prose(insight.body)}
          </p>

          {comparison && comparison.monthsCounted > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="This month" value={comparison.current} emphasis />
              <Stat
                label={`${comparison.monthsCounted}-month average`}
                value={comparison.average}
              />
              <div className="min-w-0">
                <p className="text-[12.5px] text-ink-secondary">Difference</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                  <Amount
                    value={Math.abs(comparison.difference)}
                    size="md"
                    className={cn(
                      comparison.difference > 0 ? "text-warning" : "text-positive",
                    )}
                  />
                  <DeltaBadge percent={comparison.percentChange} />
                </div>
              </div>
            </div>
          )}

          {insight.transactions.length > 0 && (
            <section>
              <header className="mb-2 flex items-baseline justify-between gap-3 px-2.5">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
                  What made it up
                </h3>
                <span className="text-[12px] text-ink-tertiary tnum">
                  {insight.transactions.length}{" "}
                  {insight.transactions.length === 1 ? "item" : "items"} ·{" "}
                  {money(
                    insight.transactions.reduce((acc, t) => acc + t.amount, 0),
                  )}
                </span>
              </header>
              <TransactionList
                transactions={insight.transactions}
                showTime
                showDayTotals={false}
              />
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-ink-secondary">{label}</p>
      <div className="mt-1">
        <Amount
          value={value}
          size="md"
          className={cn(!emphasis && "text-ink-secondary")}
        />
      </div>
    </div>
  );
}
