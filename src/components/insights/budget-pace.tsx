"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useMoneyText, useMoneyTextCompact, usePrivacy } from "@/lib/hooks/use-privacy";
import { formatDayMonth, monthKeyToDate } from "@/lib/domain/dates";
import { spendingPace } from "@/lib/engine/money-visuals";
import type { Transaction } from "@/lib/domain/types";

export function BudgetPace({ transactions, month, cycleStartDay, now, limit, saved, onOpen }: {
  transactions: Transaction[]; month: string; cycleStartDay: number; now: Date; limit: number; saved: boolean;
  onOpen: (title: string, rows: Transaction[]) => void;
}) {
  const money = useMoneyText(), compact = useMoneyTextCompact(), { hidden } = usePrivacy();
  const id = useId();
  const [chosen, setChosen] = useState<number | null>(null);
  const report = useMemo(() => spendingPace({ transactions, month, cycleStartDay, now, limit }), [transactions, month, cycleStartDay, now, limit]);
  const elapsed = report.points.filter(p => p.actual !== null);
  const selected = elapsed[Math.min(chosen ?? elapsed.length - 1, elapsed.length - 1)];
  const low = Math.min(0, ...elapsed.map(p => p.actual ?? 0));
  const high = Math.max(1, limit, ...elapsed.map(p => p.actual ?? 0));
  const y = (value: number) => 184 - (value - low) / (high - low) * 158;
  const x = (day: number) => 48 + day / report.days * 360;
  const actualPath = `M ${x(0)} ${y(0)} ` + elapsed.map(p => `L ${x(p.day)} ${y(p.actual ?? 0)}`).join(" ");
  const above = report.difference > 0;
  return <div className="mt-4 space-y-3" aria-label="Budget pace">
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
      <span>{saved ? "Spending budget" : "Suggested budget"} · {money(limit)}</span>
      <Link href="/budgets" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Adjust budget</Link>
    </div>
    {hidden ? <p className="py-14 text-center text-sm text-ink-secondary">Chart hidden while balances are private.</p> : <>
      <svg viewBox="0 0 420 224" className="w-full" role="img" aria-label="Spending against budget pace. Purple is recorded spending; the dashed line reaches the full budget at cycle end. Explore dates with the slider.">
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--color-accent)" stopOpacity=".22"/><stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0"/></linearGradient></defs>
        {[low, (low + high) / 2, high].map((value, index) => <g key={index}><line x1="48" x2="408" y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".09"/><text x="42" y={y(value) + 4} textAnchor="end" fontSize="13" fill="currentColor" opacity=".65">{compact(Math.round(value))}</text></g>)}
        {low < 0 && <line x1="48" x2="408" y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".25"/>}
        <path d={`M ${x(0)} ${y(0)} L ${x(report.days)} ${y(limit)}`} fill="none" stroke="currentColor" opacity=".5" strokeWidth="2" strokeDasharray="5 5"/>
        {elapsed.length > 0 && <><path d={`${actualPath} L ${x(report.elapsed)} ${y(0)} Z`} fill={`url(#${id})`}/><path className="chart-line-draw" pathLength="1" strokeDasharray="1" d={actualPath} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/></>}
        {selected && <><line x1={x(selected.day)} x2={x(selected.day)} y1="18" y2="189" stroke="var(--color-accent)" opacity=".25"/><circle cx={x(selected.day)} cy={y(selected.ideal)} r="3" fill="var(--color-surface)" stroke="currentColor" opacity=".65"/><circle cx={x(selected.day)} cy={y(selected.actual ?? 0)} r="4" fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="2"/></>}
        <text x="48" y="214" fontSize="13" fill="currentColor">Start</text><text x="408" y="214" textAnchor="end" fontSize="13" fill="currentColor">Day {report.days}</text>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary"><span>● Recorded spending</span><span>┄ Even budget pace</span><span>{formatDayMonth(monthKeyToDate(month))}–{formatDayMonth(monthKeyToDate(report.points.at(-1)!.date))} · day {report.elapsed} of {report.days}</span></div>
    </>}
    <p className={`text-sm font-medium ${above ? "text-warning" : "text-positive"}`}>
      {report.elapsed === 0 ? "This cycle has not started." : limit === 0 ? `${money(report.spending)} recorded against a zero spending allowance.` : report.difference === 0 ? "Spending matches the budget pace." : `${money(Math.abs(report.difference))} ${above ? "above" : "below"} budget pace${report.elapsed === report.days ? " at cycle end" : " so far"}.`}
    </p>
    {selected && <div className="inset-panel bg-surface/80 px-4 py-2">
      <label htmlFor={`${id}-day`} className="flex flex-wrap justify-between gap-2 text-xs"><span>{formatDayMonth(monthKeyToDate(selected.date))} · day {selected.day}</span><span className="tnum">{money(selected.actual ?? 0)} spent · {money(selected.ideal)} pace</span></label>
      <input id={`${id}-day`} aria-label="Explore budget pace by day" type="range" min="0" max={Math.max(0, elapsed.length - 1)} value={selected.day - 1} onChange={e => setChosen(Number(e.target.value))} className="min-h-11 w-full accent-[var(--color-accent)]"/>
      <button type="button" disabled={!selected.rows.length} onClick={() => onOpen(`Spending · ${formatDayMonth(monthKeyToDate(selected.date))}`, selected.rows)} className="min-h-11 w-full text-left text-xs text-accent disabled:text-ink-tertiary">{selected.rows.length ? `View ${selected.rows.length} ${selected.rows.length === 1 ? "record" : "records"} for this day ↗` : "No spending recorded on this day"}</button>
    </div>}
  </div>;
}
