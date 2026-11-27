"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { ProgressTrack } from "@/components/ui/progress-track";
import {useInsightNarrative} from './insight-analysis-provider';
import {useMaskedProse} from '@/lib/hooks/use-privacy';

/** Insights needs a budget signal; editing and full comparisons live on Budgets. */
export function BudgetSummary() {
  const { budget } = useFinance();
  const money = useMoneyText();
  const narrative=useInsightNarrative('budget'),prose=useMaskedProse();
  if (!budget) return null;
  const over = budget.remaining < 0;
  const biggestOver = budget.buckets.filter(bucket => bucket.remaining < 0)
    .sort((a, b) => a.remaining - b.remaining)[0];
  const message = biggestOver
    ? `${biggestOver.label} is ${money(-biggestOver.remaining)} above its limit.`
    : budget.elapsed < 5
      ? "A few more days will make the spending forecast useful."
      : budget.projected > budget.limit
        ? `At this pace, spending would finish ${money(budget.projected - budget.limit)} above your plan.`
        : "Your recorded spending pace fits within the plan.";

  return (
    <section className="visual-card space-y-3" aria-label="Budget overview">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-ink-secondary">{over ? "Over your spending budget" : "Budget room left"}</h2>
          <p className={`mt-1 text-2xl font-semibold tracking-tight tnum ${over ? "text-danger" : "text-ink"}`}>
            {money(Math.abs(budget.remaining))}
          </p>
        </div>
        <Link href="/budgets" className="flex min-h-11 shrink-0 items-center gap-1 text-sm text-accent">
          Your plan <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.75} />
        </Link>
      </div>
      <ProgressTrack label="Spending budget used" value={budget.limit > 0 ? budget.spent / budget.limit * 100 : budget.spent > 0 ? 100 : 0}
        tone={over ? "danger" : "accent"} animate={false} />
      <p className="text-xs text-ink-secondary">{money(budget.spent)} of {money(budget.limit)} spent · {narrative?prose(narrative.interpretation):message}</p>
      {narrative&&<p className="text-xs font-medium">{prose(narrative.nextStep)}</p>}
    </section>
  );
}
