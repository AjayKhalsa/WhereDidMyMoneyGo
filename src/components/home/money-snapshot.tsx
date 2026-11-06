"use client";

import {useState} from 'react';
import {Info} from 'lucide-react';
import {Sheet} from '@/components/ui/sheet';
import {TransactionList} from '@/components/transactions/transaction-list';
import {formatDayMonth,formatMonthLabel} from '@/lib/domain/dates';
import {incomeEvidence} from '@/lib/engine/income-evidence';
import { percentOf } from "@/lib/domain/money";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";

/**
 * The four figures that describe a month (spec §8).
 *
 * Presented as a quiet row of numbers separated by rules rather than four
 * coloured cards. They are context for the hero, not four competing
 * headlines — hierarchy is the whole point.
 */

export function MoneySnapshot() {
  const money = useMoneyText();
  const { totals, safeToSpend, db, month, cycleStartDay, now } = useFinance();
  const [incomeOpen,setIncomeOpen]=useState(false);
  const evidence=incomeEvidence(db?.transactions??[],month,cycleStartDay,now);

  const items = [
    {
      id: "income",
      label: "Income",
      value: totals.income,
      sub: null as string | null,
    },
    {
      id: "invested",
      label: "Invested",
      value: totals.investmentContributions,
      sub:
        totals.income > 0
          ? `${percentOf(totals.investmentContributions, totals.income).toFixed(0)}%`
          : null,
    },
    {
      id: "spent",
      label: "Spent",
      value: totals.spent,
      sub:
        totals.income > 0
          ? `${percentOf(totals.spent, totals.income).toFixed(0)}%`
          : null,
    },
    {
      id: "committed",
      label: "Committed",
      value: safeToSpend.cardOutstanding,
      sub: null,
    },
  ];

  return (
    <>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn(
            "min-w-0",
            // Hairline separators on wide screens only; on mobile the grid
            // gap does the work and extra lines would just add noise.
            index > 0 && "sm:border-l sm:border-line sm:pl-4",
          )}
        >
          <dt className="flex min-h-8 items-center text-[12.5px] text-ink-secondary">{item.id==='income'?<button type="button" onClick={()=>setIncomeOpen(true)} className="inline-flex min-h-8 items-center gap-1.5" aria-label="View income breakdown">Income <Info className="h-3.5 w-3.5" aria-hidden="true"/></button>:item.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-1.5">
            <Amount value={item.value} size="md" />
            {item.sub && (
              <span className="text-[12.5px] text-ink-tertiary tnum">
                {item.sub}
              </span>
            )}
          </dd>
          {item.id === "invested" && totals.investmentWithdrawals > 0 && (
            <p className="mt-1 text-[12px] text-ink-tertiary">
              {money(totals.investmentWithdrawals)} withdrawn · {money(totals.invested)} net flow
            </p>
          )}
        </div>
      ))}
    </dl>
    <Sheet open={incomeOpen} onClose={()=>setIncomeOpen(false)} title="Income in this cycle" description={formatMonthLabel(month,cycleStartDay)} size="lg">
      <p className="mb-4 text-sm text-ink-secondary">Recorded income includes payments received from friends. Refunds, your own transfers and returned investment principal are separate.</p>
      <p className="mb-4 font-semibold">Received: {money(totals.income)}</p>
      {evidence.salaryBeforeCycle&&<div className="mb-5 rounded-xl border border-line p-3 text-sm"><p>Last salary: {formatDayMonth(evidence.salaryBeforeCycle.date)} · {money(evidence.salaryBeforeCycle.amount)}</p><p className="mt-1 text-ink-secondary">Recorded before this cycle started; already included in your bank balance.</p><TransactionList transactions={[evidence.salaryBeforeCycle]} showDayTotals={false}/></div>}
      <TransactionList transactions={evidence.rows} showDayTotals={false} emptyTitle="No income recorded in this cycle"/>
    </Sheet>
    </>
  );
}
