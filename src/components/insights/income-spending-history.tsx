"use client";

import { useMemo, useState } from "react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText, usePrivacy } from "@/lib/hooks/use-privacy";
import { formatMonthLabel, monthKeyToDate } from "@/lib/domain/dates";
import { incomeSpendingHistory } from "@/lib/engine/money-visuals";
import { InfoButton } from "@/components/ui/info-button";
import { Sheet } from "@/components/ui/sheet";
import { TransactionList } from "@/components/transactions/transaction-list";

export function IncomeSpendingHistory() {
  const { personalTransactions, month, now, cycleStartDay } = useFinance();
  const money = useMoneyText(), { hidden } = usePrivacy();
  const [chosen, setChosen] = useState(month);
  const [detail, setDetail] = useState<"income" | "spending" | "investment" | null>(null);
  const history = useMemo(() => incomeSpendingHistory({ transactions: personalTransactions, month, now, cycleStartDay }), [personalTransactions, month, now, cycleStartDay]);
  const selected = history.find(p => p.month === chosen) ?? history.at(-1)!;
  const positiveMax = Math.max(1, ...history.flatMap(p => [p.income, Math.max(0, p.spent)]));
  const negativeMax = Math.max(0, ...history.map(p => -p.spent));
  const scale = Math.min(115 / positiveMax, negativeMax > 0 ? 35 / negativeMax : Infinity);
  const rows = detail === "income" ? selected.incomeRows : detail === "spending" ? selected.spendingRows : selected.investmentRows;
  return <section className="visual-card min-w-0" aria-label="Six-cycle income and spending">
    <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Longer view</p><h2 className="mt-1 text-lg font-semibold">Income vs spending</h2></div><InfoButton title="Six-cycle comparison"><p>Six salary cycles ending at the selected month. Income excludes refunds and money held for others. Spending is your share after linked contributions and posted refunds; card repayments and investments are separate.</p><p>The current cycle is partial and is labelled in progress. Dashed placeholders mean no records, not a verified zero-spend month. A refund-heavy month can show a spending bar below zero.</p><p>Labels use the cycle's start month; tap one for exact dates and amounts. The remaining figure includes returned principal and subtracts investment contributions. It describes the cycle, not a bank balance.</p></InfoButton></div>
    <p className="mt-2 text-xs text-ink-secondary">Six salary cycles · tap a month for details</p>
    {hidden ? <p className="py-16 text-center text-sm text-ink-secondary">Chart hidden while balances are private.</p> : <>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600"/> Income</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-accent"/> Spending</span><span>↓ Net refunds</span></div>
      <div className="mt-4 grid grid-cols-6 gap-1.5" role="group" aria-label="Choose a salary cycle">
        {history.map(p => <button key={p.month} type="button" onClick={() => { setChosen(p.month); setDetail(null); }} aria-pressed={p.month === selected.month} aria-label={`${formatMonthLabel(p.month, cycleStartDay)}: ${p.hasRecords ? `${money(p.income)} income, ${money(p.spent)} spending${p.partial ? ', in progress' : ''}` : 'no records'}`} className={`min-w-0 rounded-xl px-1 py-3 text-center focus-visible:outline-2 focus-visible:outline-accent ${p.month === selected.month ? "bg-accent-soft" : "hover:bg-surface-hover"}`}>
          <span className="relative mx-auto block h-40 w-full max-w-16">
            <span className="absolute inset-x-0 top-[120px] border-t border-line-strong"/>
            {p.hasRecords ? <><span className="absolute bottom-[40px] left-[12%] w-[30%] rounded-t bg-emerald-600" style={{ height: Math.max(p.income > 0 ? 2 : 0, p.income * scale) }}/><span className={`absolute left-[57%] w-[30%] ${p.spent < 0 ? "rounded-b bg-emerald-500" : "rounded-t bg-accent"}`} style={p.spent < 0 ? { top: 120, height: Math.max(2, -p.spent * scale) } : { bottom: 40, height: Math.max(p.spent > 0 ? 2 : 0, p.spent * scale) }}/></> : <span className="absolute inset-x-[18%] bottom-[40px] h-12 rounded-t border border-dashed border-line-strong"/>}
          </span>
          <span className="mt-1 block text-xs font-medium">{monthKeyToDate(p.month).toLocaleString("en-IN", { month: "short" })}</span><span className="mt-1 block min-h-6 text-[10px] text-ink-tertiary">{p.partial && p.hasRecords ? "So far" : p.hasRecords ? p.income === 0 && p.spent === 0 ? "Other records" : "" : "No records"}</span>
        </button>)}
      </div>
    </>}
    <div className="inset-panel mt-4 space-y-4 bg-surface-sunken p-4">
      <div><h3 className="text-sm font-medium">{formatMonthLabel(selected.month, cycleStartDay)}</h3><p className="mt-1 text-xs text-ink-secondary">{selected.hasRecords ? selected.partial ? `In progress · day ${selected.elapsed} of ${selected.days}` : "Completed cycle · recorded history" : "No income, spending or investment records for this cycle"}</p></div>
      {selected.hasRecords && <>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-xs text-ink-secondary">Income</dt><dd className="mt-1 font-semibold tnum">{money(selected.income)}</dd></div>
          <div><dt className="text-xs text-ink-secondary">{selected.spent < 0 ? "Net refunds" : "Spending"}</dt><dd className="mt-1 font-semibold tnum">{money(Math.abs(selected.spent))}</dd></div>
          <div><dt className="text-xs text-ink-secondary">Invested</dt><dd className="mt-1 font-semibold tnum">{money(selected.investmentContributions)}</dd></div>
          <div><dt className="text-xs text-ink-secondary">{selected.remaining < 0 ? "Cycle shortfall" : "Left after investing"}</dt><dd className={`mt-1 font-semibold tnum ${selected.remaining < 0 ? 'text-warning' : 'text-positive'}`}>{money(Math.abs(selected.remaining))}</dd></div>
        </dl>
        {selected.investmentWithdrawals > 0 && <p className="text-xs text-ink-secondary">Includes {money(selected.investmentWithdrawals)} of returned investment principal.</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">{([['income','Income',selected.incomeRows],['spending','Spending',selected.spendingRows],['investment','Investments',selected.investmentRows]] as const).map(([id, label, entries]) => entries.length > 0 && <button key={id} type="button" onClick={() => setDetail(id)} className="min-h-11 text-xs text-accent underline underline-offset-4">View {label.toLowerCase()} ↗</button>)}</div>
      </>}
    </div>
    <Sheet open={!!detail} onClose={() => setDetail(null)} title={`${detail === 'investment' ? 'Investments' : detail === 'income' ? 'Income' : 'Spending'} · ${formatMonthLabel(selected.month, cycleStartDay)}`} size="lg"><TransactionList transactions={rows} showDayTotals={false} showTime/></Sheet>
  </section>;
}
