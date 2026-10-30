"use client";
import { useState } from 'react';
import { addMonths } from '@/lib/domain/dates';
import type { Transaction } from '@/lib/domain/types';
import type { SpendingReport } from '@/lib/engine/spending-report';
import { spendingTrend } from '@/lib/engine/spending-trend';
import { useMoneyText, usePrivacy } from '@/lib/hooks/use-privacy';

export function SpendingTrend({report, transactions, month, cycleStartDay, onOpen}:{report:SpendingReport;transactions:Transaction[];month:string;cycleStartDay:number;onOpen:(title:string,rows:Transaction[])=>void}) {
  const money=useMoneyText(), {hidden}=usePrivacy();
  const [chosenDate,setChosenDate]=useState('');
  const current=spendingTrend(report.current.transactions,transactions,month,cycleStartDay,report.comparableDays);
  const previous=spendingTrend(report.previous.transactions,transactions,addMonths(month,-1,cycleStartDay),cycleStartDay,report.comparableDays);
  const selected=current.find(d=>d.date===chosenDate)??current[current.length-1];
  const values=[0,...current.map(d=>d.cumulative),...(report.hasPrevious?previous.map(d=>d.cumulative):[])];
  const low=Math.min(...values),high=Math.max(...values),span=high-low||1;
  const x=(day:number)=>12+day/Math.max(current.length,previous.length,1)*296;
  const y=(value:number)=>145-(value-low)/span*130;
  const path=(days:typeof current)=>`M ${x(0)} ${y(0)} `+days.map(d=>`L ${x(d.day)} ${y(d.cumulative)}`).join(' ');
  return <section aria-label="Spending trend" className="rounded-xl border border-line bg-surface p-4 space-y-3">
    <div><h3 className="text-sm font-semibold">How net outflow builds up</h3><p className="text-xs text-ink-secondary">Current cycle versus previous cycle, aligned by cycle day. Credits and refunds lower the line.</p></div>
    {hidden?<p className="py-8 text-center text-sm text-ink-secondary">Chart hidden while balances are private.</p>:<svg viewBox="0 0 320 165" role="img" aria-label={`Cumulative net outflow: ${money(report.current.net)} this cycle${report.hasPrevious?`, ${money(report.previous.net)} in the comparison period`:''}`} className="w-full">
      <line x1="12" x2="308" y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.15" />
      {report.hasPrevious&&<path d={path(previous)} fill="none" stroke="currentColor" opacity="0.4" strokeWidth="2" strokeDasharray="5 4" />}
      <path d={path(current)} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-700" />
      <text x="12" y="162" fontSize="10" fill="currentColor">Day 1</text><text x="308" y="162" textAnchor="end" fontSize="10" fill="currentColor">Day {Math.max(current.length,previous.length)}</text>
    </svg>}
    <p className="text-xs text-ink-secondary">Solid: current {money(report.current.net)} · {report.hasPrevious?`Dashed: previous ${money(report.previous.net)}`:'No previous-period records available.'}</p>
    <p className="text-xs text-ink-tertiary">Based on recorded transactions, not proof of complete bank coverage. No forecast is assumed.</p>
    {selected&&<div className="border-t border-line pt-3 space-y-2">
      <label className="block text-xs text-ink-secondary" htmlFor="trend-day">Explore a day</label>
      <select id="trend-day" value={selected.date} onChange={e=>setChosenDate(e.target.value)} className="w-full rounded-lg border border-line bg-surface p-2 text-sm">{current.map(d=><option key={d.date} value={d.date}>{d.date} · {d.transactions.length} records</option>)}</select>
      <p className="text-xs text-ink-secondary">{money(selected.outgoing)} outgoing − {money(selected.returned)} returned = {money(selected.net)} net</p>
      <button type="button" disabled={!selected.transactions.length} onClick={()=>onOpen(`Transactions · ${selected.date}`,selected.transactions)} className="min-h-11 text-sm underline underline-offset-4 disabled:opacity-40">View day transactions</button>
    </div>}
  </section>;
}
