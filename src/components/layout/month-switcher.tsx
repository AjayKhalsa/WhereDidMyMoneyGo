"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthWithYear } from "@/lib/domain/dates";
import { useFinance, useMonthNavigation } from "@/lib/hooks/use-finance";
import { IconButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * Month navigation.
 *
 * Forward is disabled at the present month — there is no data in the future,
 * and letting someone page into an empty October would only look broken.
 */
export function MonthSwitcher({ className }: { className?: string }) {
  const { month, canGoForward, goBack, goForward } = useMonthNavigation();
  const { isCurrentMonth } = useFinance();

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <IconButton label="Previous month" onClick={goBack} className="h-8 w-8">
        <ChevronLeft className="h-4 w-4" strokeWidth={1.9} />
      </IconButton>
      <span className="min-w-[7.5rem] text-center text-[14px] font-medium text-ink">
        {isCurrentMonth ? "This month" : formatMonthWithYear(month)}
      </span>
      <IconButton
        label="Next month"
        onClick={goForward}
        disabled={!canGoForward}
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.9} />
      </IconButton>
    </div>
  );
}

/** Shared page heading used by Insights, Money and Transactions. */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink sm:text-[30px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[14px] leading-relaxed text-ink-secondary">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}
