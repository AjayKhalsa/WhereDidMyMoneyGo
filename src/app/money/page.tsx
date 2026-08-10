"use client";

import { formatMoney } from "@/lib/domain/money";
import {
  expectedMonthlyIncome,
  goalAllocations,
} from "@/lib/engine/safe-to-spend";
import { monthlyRecurringTotal } from "@/lib/engine/recurring";
import { useFinance } from "@/lib/hooks/use-finance";
import { MonthSwitcher, PageHeader } from "@/components/layout/month-switcher";
import { AccountsPanel } from "@/components/money/accounts-panel";
import { CreditCardCard } from "@/components/money/credit-card-card";
import { DisclosurePanel } from "@/components/money/disclosure-panel";
import { GoalsPanel } from "@/components/money/goals-panel";
import { IncomePanel } from "@/components/money/income-panel";
import { InvestmentsPanel } from "@/components/money/investments-panel";
import { PeoplePanel } from "@/components/money/people-panel";
import { RecurringPanel } from "@/components/money/recurring-panel";
import { Amount } from "@/components/ui/amount";
import { Section, Skeleton } from "@/components/ui/primitives";
import { pluralise } from "@/lib/utils";

/**
 * Money (spec §42) — the structure behind the numbers.
 *
 * Home answers "what can I spend?" and Insights answers "what am I doing?".
 * This screen is where the machinery lives: accounts, salary, investments,
 * standing bills and goals.
 *
 * Every section is collapsed behind a headline figure. Six financial
 * structures unfolded at once is the overwhelming admin dashboard the product
 * is explicitly not meant to be — so the summary in each header is chosen to
 * be the one number that makes opening the section unnecessary most days.
 */

export default function MoneyPage() {
  const {
    status,
    db,
    safeToSpend,
    creditCards,
    peopleBalances,
    netWorth,
    month,
    cycleStartDay,
  } = useFinance();

  if (status === "loading" || status === "idle") {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const spendable = (db?.accounts ?? []).filter(
    (a) => a.isActive && (a.type === "BANK" || a.type === "CASH"),
  );

  const income = expectedMonthlyIncome(db?.incomeSources ?? []);
  const planned = (db?.investments ?? [])
    .filter((i) => i.isActive)
    .reduce((acc, i) => acc + i.monthlyContribution, 0);
  const bills = monthlyRecurringTotal(db?.recurring ?? []);
  const earmarked = goalAllocations(db?.goals ?? [], db?.transactions ?? [], month, cycleStartDay);
  const goalCount = (db?.goals ?? []).length;
  const netOwed = peopleBalances.reduce((acc, b) => acc + b.netAmount, 0);

  return (
    <div className="space-y-9">
      <PageHeader
        title="Money"
        description="Accounts, income, investments and everything you've committed to."
        action={<MonthSwitcher />}
      />

      {/*
        Cash, card debt and net worth side by side — three distinct questions
        that must never blend into one number: what's actually sitting in
        the bank right now, what's owed against it, and what everything
        (cash + investments + people) nets out to once debt is subtracted.
      */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatBlock
          label="Cash available"
          value={safeToSpend.bankBalance}
          detail={`Across ${spendable.length} ${pluralise(spendable.length, "account")}`}
        />
        <StatBlock
          label="Owed on cards"
          value={safeToSpend.cardOutstanding}
          tone={safeToSpend.cardOutstanding > 0 ? "warning" : "neutral"}
          detail={
            safeToSpend.cardOutstanding > 0
              ? `${formatMoney(safeToSpend.unencumberedCash)} is really yours`
              : "Nothing outstanding"
          }
        />
        <StatBlock
          label="Net worth"
          value={netWorth}
          detail="Cash + invested + owed to you, minus cards"
        />
      </div>

      {creditCards.length > 0 && (
        <Section title="Cards">
          <div className="grid gap-4 sm:grid-cols-2">
            {creditCards.map((summary) => (
              <CreditCardCard
                key={summary.account.id}
                summary={summary}
                compact
              />
            ))}
          </div>
        </Section>
      )}

      <div className="border-t border-line">
        <DisclosurePanel
          title="Accounts"
          defaultOpen
          summary={<SummaryFigure value={safeToSpend.bankBalance} />}
        >
          <AccountsPanel />
        </DisclosurePanel>

        <DisclosurePanel
          title="Income"
          summary={
            income > 0 ? (
              <SummaryFigure value={income} suffix="/month" />
            ) : (
              <SummaryHint>Not set up</SummaryHint>
            )
          }
        >
          <IncomePanel />
        </DisclosurePanel>

        <DisclosurePanel
          title="Investments"
          summary={
            planned > 0 ? (
              <SummaryFigure value={planned} suffix="/month" />
            ) : (
              <SummaryHint>No plan set</SummaryHint>
            )
          }
        >
          <InvestmentsPanel />
        </DisclosurePanel>

        <DisclosurePanel
          title="Bills & subscriptions"
          summary={
            bills > 0 ? (
              <SummaryFigure value={bills} suffix="/month" />
            ) : (
              <SummaryHint>None yet</SummaryHint>
            )
          }
        >
          <RecurringPanel />
        </DisclosurePanel>

        <DisclosurePanel
          title="Goals"
          summary={
            earmarked > 0 ? (
              <SummaryFigure value={earmarked} suffix="/month" />
            ) : (
              <SummaryHint>
                {goalCount > 0
                  ? `${goalCount} ${pluralise(goalCount, "goal")}`
                  : "None yet"}
              </SummaryHint>
            )
          }
        >
          <GoalsPanel />
        </DisclosurePanel>

        <DisclosurePanel
          title="People"
          summary={
            netOwed !== 0 ? (
              <SummaryFigure value={Math.abs(netOwed)} suffix={netOwed > 0 ? " owed to you" : " you owe"} />
            ) : peopleBalances.length > 0 ? (
              <SummaryHint>Settled up</SummaryHint>
            ) : (
              <SummaryHint>None yet</SummaryHint>
            )
          }
        >
          <PeoplePanel />
        </DisclosurePanel>
      </div>

      <p className="pb-2 text-[12.5px] leading-relaxed text-ink-tertiary">
        Everything here feeds safe-to-spend. Income sets the ceiling; planned
        investments, unpaid bills and goal contributions are held back before
        you&rsquo;re told what&rsquo;s left.
      </p>
    </div>
  );
}

function StatBlock({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <p className="text-[13px] text-ink-secondary">{label}</p>
      <div className="mt-1.5">
        <Amount
          value={value}
          size="xl"
          signed
          className={
            tone === "warning"
              ? "text-warning"
              : value < 0
                ? "text-danger"
                : undefined
          }
        />
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-tertiary">{detail}</p>
    </div>
  );
}

/** The one figure in a panel header worth seeing without opening it. */
function SummaryFigure({ value, suffix }: { value: number; suffix?: string }) {
  return (
    <span className="text-[14px] font-medium text-ink-secondary tnum">
      {formatMoney(value)}
      {suffix && (
        <span className="text-[12px] font-normal text-ink-tertiary">
          {suffix}
        </span>
      )}
    </span>
  );
}

function SummaryHint({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-ink-tertiary">{children}</span>;
}
