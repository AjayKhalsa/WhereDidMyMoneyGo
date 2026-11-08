"use client";

import {useState} from 'react';
import {Info, ArrowDownLeft, TrendingUp, ShoppingBag, CreditCard} from 'lucide-react';
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
 * Compact summary cards use consistent icons and restrained colour.
 * They provide context below the primary safe-to-spend figure.
 */

export function MoneySnapshot() {
  const money = useMoneyText();
  const { totals, safeToSpend, db, month, cycleStartDay, now } = useFinance();
  const [incomeOpen,setIncomeOpen]=useState(false);
  const evidence=incomeEvidence(db?.transactions??[],month,cycleStartDay,now);

  const items = [
    {
      icon: ArrowDownLeft, tone: "text-positive bg-positive-soft",
      id: "income",
      label: "Income",
      value: totals.income,
      sub: null as string | null,
    },
    {
      icon: TrendingUp, tone: "text-accent bg-accent-soft",
      id: "invested",
      label: "Invested",
      value: totals.investmentContributions,
      sub:
        totals.income > 0
          ? `${percentOf(totals.investmentContributions, totals.income).toFixed(0)}%`
          : null,
    },
    {
      icon: ShoppingBag, tone: "text-amber-700 bg-amber-50",
      id: "spent",
      label: "Spent",
      value: totals.spent,
      sub:
        totals.income > 0
          ? `${percentOf(totals.spent, totals.income).toFixed(0)}%`
          : null,
    },
    {
      icon: CreditCard, tone: "text-violet-700 bg-violet-50",
      id: "committed",
      label: "Committed",
      value: safeToSpend.cardOutstanding,
      sub: null,
    },
  ];

  return (
    <>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="min-w-0 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-subtle)] sm:p-4"
        >
          <dt className="text-[12.5px] text-ink-secondary"><span className={cn("mb-2 flex w-fit rounded-xl p-2",item.tone)}><item.icon aria-hidden="true" className="h-4 w-4"/></span>{item.id==='income'?<button type="button" onClick={()=>setIncomeOpen(true)} className="inline-flex min-h-8 items-center gap-1.5" aria-label="View income breakdown">Income <Info className="h-3.5 w-3.5" aria-hidden="true"/></button>:item.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-1.5">
            <Amount value={item.value} size="md" />
            {item.sub && (
              <span className="text-[12.5px] text-ink-tertiary tnum">
                {item.sub}
              </span>
            )}
          </dd>
          {item.id === "invested" && totals.investmentWithdrawals > 0 && (
            <dd className="mt-1 text-[12px] text-ink-tertiary">
              {money(totals.investmentWithdrawals)} withdrawn · {money(totals.invested)} net flow
            </dd>
          )}
        </div>
      ))}
    </dl>
    <Sheet open={incomeOpen} onClose={()=>setIncomeOpen(false)} title="Income in this cycle" description={formatMonthLabel(month,cycleStartDay)} size="lg">
      <p className="mb-4 text-sm text-ink-secondary">Cycle income includes salary paid early and payments received from friends. Refunds, your own transfers and returned investment principal are separate.</p>
      <p className="mb-4 font-semibold">Received: {money(totals.income)}</p>
      {evidence.earlySalary.length>0&&<p className="mb-4 rounded-xl border border-line p-3 text-sm">Salary received {evidence.earlySalary.map(t=>formatDayMonth(t.date)).join(', ')} is included in this cycle. Salary paid between the 22nd and 25th belongs to the cycle starting on that month’s 24th; the original payment date stays unchanged.</p>}
      {evidence.salaryBeforeCycle&&<div className="mb-5 rounded-xl border border-line p-3 text-sm"><p>Last salary: {formatDayMonth(evidence.salaryBeforeCycle.date)} · {money(evidence.salaryBeforeCycle.amount)}</p><p className="mt-1 text-ink-secondary">Recorded before this cycle started; already included in your bank balance.</p><TransactionList transactions={[evidence.salaryBeforeCycle]} showDayTotals={false}/></div>}
      <TransactionList transactions={evidence.rows} showDayTotals={false} emptyTitle="No income recorded in this cycle"/>
    </Sheet>
    </>
  );
}
