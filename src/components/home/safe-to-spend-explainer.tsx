"use client";

import type { BreakdownLine } from "@/lib/engine/safe-to-spend";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { Divider } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * The receipt behind the hero number (spec §33).
 *
 * "Never make the user wonder where the number came from." Each row is one
 * `BreakdownLine` produced by the engine — the UI does no arithmetic of its
 * own here beyond rendering signs.
 *
 * Two totals, in a deliberate order. Safe to spend comes first and reads as
 * a sentence: cash in bank, less what's owed on cards, equals what's yours.
 * It used to be an income-minus-expenses figure, which is how the app ended
 * up telling someone they could spend ₹56k while holding ₹2.4k.
 *
 * "This month" follows, and always shows its two endpoints. That figure is a
 * *change* in position over the cycle, so it can exceed the cash on hand
 * when opening positions were negative. Asset redemptions are shown separately
 * from income; card repayments do not count as earnings or wealth gains.
 */

export function SafeToSpendExplainer() {
  const money = useMoneyText();
  const { safeToSpend, isCurrentMonth } = useFinance();
  const {
    breakdown,
    monthlySurplusBreakdown,
    safeAmount,
    monthlySurplus,
    positionAtCycleStart,
    positionNow,
    positionDifference,
    cardDebtCleared,
    dailyAllowance,
    remainingDays,
    projectedMonthEndSpend,
    projectedSurplus,
  } = safeToSpend;

  return (
    <div className="space-y-6 py-1">
      <BreakdownList lines={breakdown} />

      <div className="rounded-xl bg-surface-sunken p-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[14.5px] font-medium text-ink">
            Safe to spend
          </span>
          <Amount value={safeAmount} size="lg" signed />
        </div>
        {isCurrentMonth && safeAmount > 0 && (
          <p className="mt-1.5 text-[13px] text-ink-secondary">
            Spread over {remainingDays}{" "}
            {remainingDays === 1 ? "day" : "days"} left, that&rsquo;s{" "}
            <span className="font-medium text-ink tnum">
              {money(dailyAllowance)}
            </span>{" "}
            a day.
          </p>
        )}
      </div>

      <section>
        <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
          This month
        </h3>
        <p className="mb-1 text-[13px] leading-relaxed text-ink-secondary">
          Income plus returned investment principal, minus contributions and spending.
          This is a change in cash and card position, not investment gains or net worth.
        </p>
        <BreakdownList lines={monthlySurplusBreakdown} />
        <div className="mt-3 rounded-xl bg-surface-sunken p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[14.5px] font-medium text-ink">
              {monthlySurplus >= 0 ? "Cash/card position improved by" : "Cash/card position fell by"}
            </span>
            <Amount value={Math.abs(monthlySurplus)} size="lg" />
          </div>
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <Line
              label="Where you started"
              value={money(positionAtCycleStart)}
              hint="Cash plus card credits, minus card debt when this cycle began"
            />
            <Line
              label="Where you are now"
              value={money(positionNow)}
              emphasis
            />
          </div>
          {positionDifference !== 0 && (
            <p role="alert" className="mt-3 text-[12.5px] text-warning">
              Recorded flows differ from the cash/card position change by {money(positionDifference)}.
              Review adjustments and account coverage before relying on this change.
            </p>
          )}
          {cardDebtCleared > 0 && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-secondary">
              Card debt fell by {money(cardDebtCleared)} during this cycle.
              Repayments reduce bank cash and card debt together; they do not create income or gains.
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
          Where it&rsquo;s heading
        </h3>
        <div className="space-y-2.5">
          <Line
            label="Projected spend by month end"
            value={money(projectedMonthEndSpend)}
            hint="If you keep spending at your current pace"
          />
          <Line
            label={projectedSurplus >= 0 ? "Projected surplus" : "Projected shortfall"}
            value={money(Math.abs(projectedSurplus))}
            hint={
              projectedSurplus >= 0
                ? "What would be left over at that pace"
                : "How far past your safe limit that pace lands"
            }
            tone={projectedSurplus >= 0 ? "positive" : "warning"}
          />
        </div>
      </section>
    </div>
  );
}

function BreakdownList({ lines }: { lines: BreakdownLine[] }) {
  const money = useMoneyText();
  return (
    <ul className="space-y-0">
      {lines.map((line, index) => (
        <li key={line.id}>
          {index > 0 && <Divider className="my-0" />}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-[14.5px] font-medium text-ink">{line.label}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-secondary">
                {line.hint}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 pt-0.5 text-[15px] font-medium tnum",
                line.direction === "add" ? "text-ink" : "text-ink-secondary",
              )}
            >
              {line.direction === "add" ? "" : "− "}
              {money(line.amount)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Line({
  label,
  value,
  hint,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "warning";
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p
          className={cn(
            "text-[14px]",
            emphasis ? "font-medium text-ink" : "text-ink-secondary",
          )}
        >
          {label}
        </p>
        {hint && <p className="text-[12px] text-ink-tertiary">{hint}</p>}
      </div>
      <span
        className={cn(
          "shrink-0 text-[14.5px] font-medium tnum",
          tone === "positive" && "text-positive",
          tone === "warning" && "text-warning",
          !tone && "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
