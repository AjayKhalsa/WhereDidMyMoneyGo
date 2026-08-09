"use client";

import { formatMoney } from "@/lib/domain/money";
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
 */

export function SafeToSpendExplainer() {
  const { safeToSpend, isCurrentMonth } = useFinance();
  const {
    breakdown,
    safeAmount,
    dailyAllowance,
    remainingDays,
    projectedMonthEndSpend,
    projectedSurplus,
    bankBalance,
    cardOutstanding,
    unencumberedCash,
  } = safeToSpend;

  return (
    <div className="space-y-6 py-1">
      <ul className="space-y-0">
        {breakdown.map((line, index) => (
          <li key={line.id}>
            {index > 0 && <Divider className="my-0" />}
            <div className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[14.5px] font-medium text-ink">
                  {line.label}
                </p>
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
                {formatMoney(line.amount)}
              </span>
            </div>
          </li>
        ))}
      </ul>

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
              {formatMoney(dailyAllowance)}
            </span>{" "}
            a day.
          </p>
        )}
      </div>

      <section>
        <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
          Where it&rsquo;s heading
        </h3>
        <div className="space-y-2.5">
          <Line
            label="Projected spend by month end"
            value={formatMoney(projectedMonthEndSpend)}
            hint="If you keep spending at your current pace"
          />
          <Line
            label={projectedSurplus >= 0 ? "Projected surplus" : "Projected shortfall"}
            value={formatMoney(Math.abs(projectedSurplus))}
            hint={
              projectedSurplus >= 0
                ? "What would be left over at that pace"
                : "How far past your safe limit that pace lands"
            }
            tone={projectedSurplus >= 0 ? "positive" : "warning"}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
          Cash position
        </h3>
        <p className="mb-3 text-[13px] leading-relaxed text-ink-secondary">
          Your balance and your money are not the same thing. Part of what sits
          in your account is already promised to your card.
        </p>
        <div className="space-y-2.5">
          <Line label="Bank and cash balance" value={formatMoney(bankBalance)} />
          <Line
            label="Credit card outstanding"
            value={`− ${formatMoney(cardOutstanding)}`}
            hint="Already spent, not yet paid"
          />
          <Divider />
          <Line
            label="Actually yours"
            value={formatMoney(unencumberedCash)}
            emphasis
          />
        </div>
      </section>
    </div>
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
