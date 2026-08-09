"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ScoreRating } from "@/lib/engine/insights";
import { useFinance } from "@/lib/hooks/use-finance";
import { ProgressTrack, ScoreDial } from "@/components/ui/charts";
import { cn } from "@/lib/utils";

/**
 * The financial score (spec §26).
 *
 * A single number is only defensible if you can see what produced it, so the
 * factors are part of the component rather than hidden behind a tooltip. Each
 * one names a real, changeable behaviour — investment rate, savings rate,
 * consistency, commitments, pace, goals — with its own rating and a line of
 * evidence. No streaks, no badges, nothing to farm.
 */

const RATING_TONE: Record<ScoreRating, string> = {
  Excellent: "text-positive",
  Good: "text-ink",
  Fair: "text-warning",
  "Needs attention": "text-danger",
};

const RATING_TRACK: Record<ScoreRating, "positive" | "accent" | "warning" | "danger"> = {
  Excellent: "positive",
  Good: "accent",
  Fair: "warning",
  "Needs attention": "danger",
};

export function FinancialScoreCard() {
  const { score } = useFinance();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
        <ScoreDial score={score.score} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
            Financial score
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-secondary">
            {score.summary}
          </p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-tertiary">
            Weighted from six measurable behaviours this month. It moves when
            your habits move — not when you open the app.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-5 flex items-center gap-1 text-[13px] font-medium text-ink-secondary transition-colors hover:text-ink"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          strokeWidth={1.75}
        />
        {expanded ? "Hide breakdown" : "What's behind this?"}
      </button>

      {expanded && (
        <ul className="mt-4 space-y-4 border-t border-line pt-4">
          {score.factors.map((factor) => (
            <li key={factor.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium text-ink">
                  {factor.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[13px] font-medium",
                    RATING_TONE[factor.rating],
                  )}
                >
                  {factor.rating}
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressTrack
                  value={factor.score}
                  tone={RATING_TRACK[factor.rating]}
                  height="h-1"
                />
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-tertiary">
                {factor.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
