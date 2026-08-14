"use client";

import { ArrowRight } from "lucide-react";
import type { Insight, InsightTone } from "@/lib/engine/insights";
import { useMaskedProse } from "@/lib/hooks/use-privacy";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";

/**
 * An insight, as a card.
 *
 * Tone is carried almost entirely by a single accent rule and the eyebrow
 * text — no coloured backgrounds, no icons competing with the number. A
 * screen full of amber warning boxes stops being read after a week, which
 * defeats the purpose of having an insight engine at all (spec §23).
 */

const TONE_RULE: Record<InsightTone, string> = {
  positive: "before:bg-positive",
  warning: "before:bg-warning",
  alert: "before:bg-danger",
  neutral: "before:bg-line-strong",
};

const TONE_EYEBROW: Record<InsightTone, string> = {
  positive: "text-positive",
  warning: "text-warning",
  alert: "text-danger",
  neutral: "text-ink-tertiary",
};

export function InsightCard({
  insight,
  onSelect,
  compact,
  className,
}: {
  insight: Insight;
  onSelect?: (insight: Insight) => void;
  compact?: boolean;
  className?: string;
}) {
  const prose = useMaskedProse();
  const interactive = Boolean(onSelect) && insight.transactions.length > 0;
  const Element = interactive ? "button" : "div";

  return (
    <Element
      {...(interactive
        ? { type: "button" as const, onClick: () => onSelect?.(insight) }
        : {})}
      className={cn(
        "group relative w-full overflow-hidden rounded-[var(--radius-card)] text-left",
        "border border-line bg-surface p-4 sm:p-5",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        TONE_RULE[insight.tone],
        interactive &&
          "transition-all duration-200 ease-[var(--ease-out-soft)] hover:border-line-strong hover:shadow-[var(--shadow-raised)]",
        className,
      )}
    >
      <p
        className={cn(
          "text-[11.5px] font-semibold uppercase tracking-[0.08em]",
          TONE_EYEBROW[insight.tone],
        )}
      >
        {insight.eyebrow}
      </p>

      <h3
        className={cn(
          "mt-1.5 font-semibold tracking-[-0.01em] text-ink",
          compact ? "text-[15px]" : "text-[16.5px]",
        )}
      >
        {prose(insight.title)}
      </h3>

      {insight.amount !== undefined && !compact && (
        <div className="mt-2.5">
          <Amount value={insight.amount} size="lg" />
        </div>
      )}

      <p
        className={cn(
          "mt-2 leading-relaxed text-ink-secondary",
          compact ? "text-[12.5px]" : "text-[13.5px]",
        )}
      >
        {prose(insight.body)}
      </p>

      {interactive && insight.action && (
        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink">
          {insight.action}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </span>
      )}
    </Element>
  );
}
