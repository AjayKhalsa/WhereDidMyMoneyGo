"use client";

import { useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import {
  daysInMonth,
  elapsedDaysInMonth,
  formatMonthLabel,
  formatMonthLong,
  greetingFor,
} from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { useFinance } from "@/lib/hooks/use-finance";
import { usePrivacy } from "@/lib/hooks/use-privacy";
import { AnimatedAmount, Amount } from "@/components/ui/amount";
import { ProgressTrack } from "@/components/ui/charts";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { LiquidCashStrip } from "./liquid-cash-strip";
import { SafeToSpendExplainer } from "./safe-to-spend-explainer";

/**
 * The Home hero (spec §6).
 *
 * One number, larger than anything else on the page, answering the only
 * question that matters when you open a money app: how much can I actually
 * spend right now? Everything else on Home is supporting evidence.
 *
 * The figure is deliberately not a bank balance — see `safe-to-spend.ts`.
 */

/**
 * Masks every figure in the app. Lives on the hero because that is where the
 * largest number is, so it is to hand at the moment you'd want it — handing
 * your phone over, or opening the app on a train.
 */
function HideBalancesButton() {
  const { hidden, toggle } = usePrivacy();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Show balances" : "Hide balances"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "text-ink-tertiary transition-colors hover:bg-surface-sunken hover:text-ink-secondary",
        "active:scale-95",
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </button>
  );
}

export function FinancialHero() {
  const { safeToSpend, month, now, isCurrentMonth, cycleStartDay, db } = useFinance();
  const [explaining, setExplaining] = useState(false);

  const name = db?.profile.name;
  const elapsed = elapsedDaysInMonth(now, month, cycleStartDay);
  const totalDays = daysInMonth(month, cycleStartDay);
  const progress = (elapsed / totalDays) * 100;

  const overspent = safeToSpend.isOverspent;

  return (
    <section className="pt-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] text-ink-secondary">
          {greetingFor(now)}
          {name && name !== "there" ? `, ${name}` : ""}
        </p>
        <HideBalancesButton />
      </div>

      <div className="mt-4">
        <AnimatedAmount
          value={safeToSpend.safeAmount}
          size="hero"
          className={cn(overspent && "text-danger")}
        />

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[17px] font-medium tracking-[-0.01em] text-ink">
            {overspent ? "Over your limit" : "Safe to spend"}
          </h1>
          {!overspent && safeToSpend.dailyAllowance > 0 && isCurrentMonth && (
            <span className="text-[15px] text-ink-secondary tnum">
              {formatMoney(safeToSpend.dailyAllowance)}/day
            </span>
          )}
          <button
            type="button"
            onClick={() => setExplaining(true)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
              "text-[12.5px] font-medium text-ink-tertiary",
              "transition-colors hover:bg-surface-hover hover:text-ink-secondary",
            )}
          >
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
            How is this worked out?
          </button>
        </div>

        <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-secondary">
          {overspent ? (
            <>
              You&rsquo;ve committed{" "}
              <Amount value={Math.abs(safeToSpend.safeAmount)} size="xs" /> more
              than you hold, once card balances, bills and investments are
              accounted for.
            </>
          ) : (
            "What's actually yours right now — your cash, less what you already owe on cards and everything committed this cycle."
          )}
        </p>

        <LiquidCashStrip />
      </div>

      {/* Month progress — quiet context, never the headline. */}
      <div className="mt-6 max-w-md">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[12.5px] font-medium text-ink-secondary">
            {cycleStartDay === 1
              ? `${formatMonthLong(month)} ${isCurrentMonth ? elapsed : totalDays}`
              : isCurrentMonth
                ? `${formatMonthLabel(month, cycleStartDay)} · day ${elapsed}`
                : formatMonthLabel(month, cycleStartDay)}
          </span>
          <span className="text-[12.5px] text-ink-tertiary tnum">
            {isCurrentMonth
              ? `${safeToSpend.remainingDays} ${safeToSpend.remainingDays === 1 ? "day" : "days"} left`
              : `${totalDays} days`}
          </span>
        </div>
        <ProgressTrack value={progress} tone="ink" height="h-1" />
      </div>

      <Sheet
        open={explaining}
        onClose={() => setExplaining(false)}
        title="How safe-to-spend is calculated"
        description="Every line comes from your own transactions"
        size="md"
      >
        <SafeToSpendExplainer />
      </Sheet>
    </section>
  );
}
