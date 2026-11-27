"use client";

import { ArrowRight } from "lucide-react";
import type { Insight, InsightTone } from "@/lib/engine/insights";
import { useMaskedProse } from "@/lib/hooks/use-privacy";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import {useInsightNarrative} from './insight-analysis-provider';
import {useMoneyText} from '@/lib/hooks/use-privacy';

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
  insight: original,
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
  const money=useMoneyText(),narrative=useInsightNarrative(`insight:${original.id}`);
  const insight=narrative?{...original,title:narrative.heading,body:narrative.interpretation,nextStep:narrative.nextStep,interpretationSource:'ai' as const}:original;
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

      {insight.amount !== undefined && (!compact||insight.interpretationSource==='ai') && (
        <div className="mt-2.5">
          {insight.amountLabel&&<p className="mb-1 text-xs text-ink-secondary">{insight.amountLabel}</p>}
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

      {insight.evidence&&<dl className="mt-3 space-y-2">{insight.evidence.slice(0,3).map((e,i)=><div key={i} className="text-xs text-ink-secondary"><dt>{e.title}</dt><dd className="mt-0.5 font-medium tnum">{e.metrics.slice(0,2).map(m=>`${m.label}: ${m.unit==='money'?money(m.value):prose(String(m.value))}`).join(' · ')}</dd></div>)}</dl>}
      {insight.nextStep&&<p className="mt-2 text-[13px] font-medium text-ink">{prose(insight.nextStep)}</p>}

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
