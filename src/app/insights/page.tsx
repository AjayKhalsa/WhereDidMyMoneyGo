"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import type { Insight } from "@/lib/engine/insights";
import { useFinance } from "@/lib/hooks/use-finance";
import { MonthSwitcher, PageHeader } from "@/components/layout/month-switcher";
import { FinancialScoreCard } from "@/components/insights/financial-score";
import { InsightCard } from "@/components/insights/insight-card";
import { InsightDetailSheet } from "@/components/insights/insight-detail-sheet";
import { LensAnswers } from "@/components/insights/lens-answers";
import { MonthlyRecap } from "@/components/insights/monthly-recap";
import { AffordabilityCheck } from "@/components/insights/affordability-check";
import { EmptyState, Section, Skeleton } from "@/components/ui/primitives";

/**
 * Insights (spec §21).
 *
 * Not a dashboard. The question this screen answers is "what should I know
 * about my money?", so it is ordered by usefulness: things that need your
 * attention first, then the questions you actually ask, then the score and
 * the recap for anyone who wants the whole picture.
 */

export default function InsightsPage() {
  const { status, insights, totals } = useFinance();
  const [active, setActive] = useState<Insight | null>(null);

  if (status === "loading" || status === "idle") {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-44 w-full rounded-[var(--radius-card)]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
          <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        </div>
      </div>
    );
  }

  const attention = insights.filter(
    (i) => i.tone === "alert" || i.tone === "warning",
  );
  const rest = insights.filter(
    (i) => i.tone !== "alert" && i.tone !== "warning",
  );

  return (
    <div className="space-y-10">
      <PageHeader
        title="Insights"
        description="What's worth knowing about your money this month."
        action={<MonthSwitcher />}
      />

      {totals.spent === 0 && insights.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="h-5 w-5" strokeWidth={1.5} />}
          title="Nothing to report yet"
          description="Once you've recorded a few weeks of spending, patterns start showing up here — unusual categories, weekend habits, where the money leaks."
        />
      ) : (
        <>
          {attention.length > 0 && (
            <Section title="Worth your attention">
              <div className="grid gap-4 sm:grid-cols-2">
                {attention.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onSelect={setActive}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Ask about your spending"
            description="Every answer opens onto the transactions behind it."
          >
            <LensAnswers />
          </Section>

          <Section title="Can I afford it?">
            <AffordabilityCheck />
          </Section>

          {rest.length > 0 && (
            <Section title="Patterns">
              <div className="grid gap-4 sm:grid-cols-2">
                {rest.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    onSelect={setActive}
                    compact
                  />
                ))}
              </div>
            </Section>
          )}

          <Section title="Your score">
            <FinancialScoreCard />
          </Section>

          <Section title="Monthly recap">
            <MonthlyRecap />
          </Section>
        </>
      )}

      <InsightDetailSheet insight={active} onClose={() => setActive(null)} />
    </div>
  );
}
