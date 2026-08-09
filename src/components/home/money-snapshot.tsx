"use client";

import { investmentRate } from "@/lib/engine/analytics";
import { percentOf } from "@/lib/domain/money";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";

/**
 * The four figures that describe a month (spec §8).
 *
 * Presented as a quiet row of numbers separated by rules rather than four
 * coloured cards. They are context for the hero, not four competing
 * headlines — hierarchy is the whole point.
 */

export function MoneySnapshot() {
  const { totals, safeToSpend } = useFinance();

  const items = [
    {
      id: "income",
      label: "Income",
      value: totals.income,
      sub: null as string | null,
    },
    {
      id: "invested",
      label: "Invested",
      value: totals.invested,
      sub:
        totals.income > 0
          ? `${investmentRate(totals).toFixed(0)}%`
          : null,
    },
    {
      id: "spent",
      label: "Spent",
      value: totals.spent,
      sub:
        totals.income > 0
          ? `${percentOf(totals.spent, totals.income).toFixed(0)}%`
          : null,
    },
    {
      id: "committed",
      label: "Committed",
      value: safeToSpend.cardOutstanding,
      sub: null,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "min-w-0",
            // Hairline separators on wide screens only; on mobile the grid
            // gap does the work and extra lines would just add noise.
            index > 0 && "sm:border-l sm:border-line sm:pl-4",
          )}
        >
          <dt className="text-[12.5px] text-ink-secondary">{item.label}</dt>
          <dd className="mt-1 flex items-baseline gap-1.5">
            <Amount value={item.value} size="md" />
            {item.sub && (
              <span className="text-[12.5px] text-ink-tertiary tnum">
                {item.sub}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
