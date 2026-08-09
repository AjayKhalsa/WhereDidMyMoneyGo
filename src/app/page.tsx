"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useAddSheet } from "@/components/add/add-sheet-provider";
import type { Insight } from "@/lib/engine/insights";
import { FinancialHero } from "@/components/home/financial-hero";
import { MoneySnapshot } from "@/components/home/money-snapshot";
import { MoneyFlowSheet } from "@/components/flow/money-flow-sheet";
import { InsightCard } from "@/components/insights/insight-card";
import { InsightDetailSheet } from "@/components/insights/insight-detail-sheet";
import { CreditCardCard } from "@/components/money/credit-card-card";
import { GoalCard } from "@/components/money/goal-card";
import { TransactionList } from "@/components/transactions/transaction-list";
import { BarList } from "@/components/ui/charts";
import {
  Button,
  Divider,
  EmptyState,
  Section,
  TextAction,
} from "@/components/ui/primitives";
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { WelcomeScreen } from "@/components/home/welcome-screen";

/**
 * Home — the financial command centre (spec §6, §50).
 *
 * Desktop splits into two columns: your position on the left (what you can
 * spend, where it went), your commitments and prompts on the right (card,
 * insight, goals). Mobile stacks them in priority order, with recent activity
 * last because it is reference rather than headline.
 */

export default function HomePage() {
  const { status, error, db, groupBreakdown, headline, monthRows, creditCards, totals } =
    useFinance();
  const { open } = useAddSheet();
  const [flowOpen, setFlowOpen] = useState(false);
  const [activeInsight, setActiveInsight] = useState<Insight | null>(null);

  if (status === "loading" || status === "idle") return <HomeSkeleton />;

  if (status === "error") {
    return (
      <EmptyState
        title="Couldn't open your data"
        description={error ?? "Something went wrong loading your data."}
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    );
  }

  const hasAnyData = (db?.transactions.length ?? 0) > 0;
  const hasIncomeSetUp = (db?.incomeSources.length ?? 0) > 0;
  if (!hasAnyData && !hasIncomeSetUp) return <WelcomeScreen />;

  const recent = [...monthRows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const goals = (db?.goals ?? []).slice(0, 2);

  return (
    <div className="space-y-10">
      <FinancialHero />

      <Divider />

      <MoneySnapshot />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
        {/* ---------- Left: where the money went ---------- */}
        <div className="space-y-10">
          <Section
            title="Where your money went"
            action={
              groupBreakdown.length > 0 ? (
                <TextAction onClick={() => setFlowOpen(true)}>
                  View all
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </TextAction>
              ) : undefined
            }
          >
            {groupBreakdown.length > 0 ? (
              <>
                <BarList
                  slices={groupBreakdown}
                  limit={8}
                  showCount
                  onSelect={() => setFlowOpen(true)}
                />
                <button
                  type="button"
                  onClick={() => setFlowOpen(true)}
                  className="group mt-2 flex w-full items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-left transition-all duration-200 hover:border-line-strong hover:shadow-[var(--shadow-subtle)]"
                >
                  <span className="text-[14px] font-medium text-ink">
                    Where did my money go?
                  </span>
                  <ArrowRight
                    className="h-4 w-4 text-ink-tertiary transition-transform duration-200 group-hover:translate-x-0.5"
                    strokeWidth={1.75}
                  />
                </button>
              </>
            ) : (
              <EmptyState
                icon={<Plus className="h-5 w-5" strokeWidth={1.5} />}
                title="No spending recorded yet"
                description="Add your first expense and this breakdown will fill in."
                action={
                  <Button variant="primary" onClick={() => open()}>
                    Add an expense
                  </Button>
                }
              />
            )}
          </Section>

          <Section
            title="Recent"
            action={
              <Link href="/transactions">
                <TextAction>
                  All transactions
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </TextAction>
              </Link>
            }
          >
            <TransactionList
              transactions={recent}
              showDayTotals={false}
              emptyTitle="Nothing recorded this month"
              emptyDescription="Tap Add to record your first transaction."
            />
          </Section>
        </div>

        {/* ---------- Right: commitments and prompts ---------- */}
        <div className="space-y-10">
          {headline && (
            <Section title="Something I noticed">
              <InsightCard
                insight={headline}
                onSelect={setActiveInsight}
              />
            </Section>
          )}

          {creditCards.length > 0 && (
            <Section title="Credit cards">
              <div className="space-y-3">
                {creditCards.map((summary) => (
                  <CreditCardCard key={summary.account.id} summary={summary} />
                ))}
              </div>
            </Section>
          )}

          {goals.length > 0 && (
            <Section
              title="Goals"
              action={
                <Link href="/money">
                  <TextAction>
                    Manage
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                  </TextAction>
                </Link>
              }
            >
              <div className="space-y-3">
                {goals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            </Section>
          )}

          {totals.spent > 0 && (
            <Link
              href="/insights"
              className="group flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3.5 transition-all duration-200 hover:border-line-strong hover:shadow-[var(--shadow-subtle)]"
            >
              <span className="flex items-center gap-2.5">
                <Sparkles
                  className="h-4 w-4 text-ink-tertiary"
                  strokeWidth={1.75}
                />
                <span className="text-[14px] font-medium text-ink">
                  What else should I know?
                </span>
              </span>
              <ArrowRight
                className="h-4 w-4 text-ink-tertiary transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={1.75}
              />
            </Link>
          )}
        </div>
      </div>

      <MoneyFlowSheet open={flowOpen} onClose={() => setFlowOpen(false)} />
      <InsightDetailSheet
        insight={activeInsight}
        onClose={() => setActiveInsight(null)}
      />
    </div>
  );
}
