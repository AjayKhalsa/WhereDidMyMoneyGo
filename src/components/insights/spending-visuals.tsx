"use client";

import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, CreditCard, Landmark, Wallet } from 'lucide-react';
import type { Transaction } from '@/lib/domain/types';
import { addMonths, formatDayMonth, monthKeyToDate } from '@/lib/domain/dates';
import type { spendingDrivers } from '@/lib/engine/spending-drivers';
import { spendingTrend } from '@/lib/engine/spending-trend';
import { useMoneyText, useMoneyTextCompact, usePrivacy } from '@/lib/hooks/use-privacy';
import { InfoButton } from '@/components/ui/info-button';

type Report = ReturnType<typeof spendingDrivers>;
export const PAYMENT_STYLES = [
  { id: 'card', label: 'Credit cards', color: '#7c3aed', icon: CreditCard },
  { id: 'bank', label: 'Bank accounts', color: '#059669', icon: Landmark },
  { id: 'cash', label: 'Cash', color: '#b77918', icon: Wallet },
  { id: 'unknown', label: 'Account unknown', color: '#64748b', icon: Wallet },
] as const;

export function SpendingPulse({ report, transactions, month, cycleStartDay, onOpen }: {
  report: Report; transactions: Transaction[]; month: string; cycleStartDay: number;
  onOpen: (title: string, rows: Transaction[]) => void;
}) {
  const money = useMoneyText(), compact = useMoneyTextCompact(), { hidden } = usePrivacy();
  const gradient = useId();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<'cumulative' | 'net'>('cumulative');
  const [chosen, setChosen] = useState<number | null>(null);
  const current = useMemo(() => spendingTrend(report.comparedRows, transactions, month, cycleStartDay, report.days), [report.comparedRows, transactions, month, cycleStartDay, report.days]);
  const previous = useMemo(() => spendingTrend(report.previousRows, transactions, addMonths(month, -1, cycleStartDay), cycleStartDay, report.days), [report.previousRows, transactions, month, cycleStartDay, report.days]);
  const selected = current[Math.min(chosen ?? current.length - 1, current.length - 1)];
  const values = [0, ...current.map(d => d[mode]), ...(report.hasComparison ? previous.map(d => d[mode]) : [])];
  const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  const x = (day: number) => 44 + day / Math.max(current.length, 1) * 504;
  const y = (value: number) => 175 - (value - low) / span * 150;
  const line = (days: typeof current) => `M ${x(0)} ${y(0)} ` + days.map(d => `L ${x(d.day)} ${y(d[mode])}`).join(' ');
  const difference = report.difference;
  return <section className="visual-card pulse-card" aria-label="Spending pulse">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="eyebrow">Spending pulse</p><h2 className="mt-2 text-3xl font-semibold tracking-tight tnum">{money(report.current.spending)}</h2><p className="mt-1 text-xs text-ink-secondary">This cycle · after refunds</p></div>
      <InfoButton title="Reading your spending pulse"><p>Purchases minus posted refunds. Income, investments and card repayments are excluded.</p><p>The chart compares the first {report.days} days of each cycle. The headline covers the selected cycle to date. Comparisons reflect recorded history; missing statements can affect them.</p><p>Choose Total to see spending accumulate, or Daily to find individual spikes. Refunds can take either chart below zero.</p></InfoButton>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="rounded-full bg-surface/80 px-3 py-1.5 text-xs font-medium">{report.hasComparison ? `${money(Math.abs(difference))} ${difference > 0 ? 'more' : difference < 0 ? 'less' : 'change'} · first ${report.days} days` : 'Comparison appears with more history'}</span>
      <div className="chart-toggle" aria-label="Chart view">{(['cumulative', 'net'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'cumulative' ? 'Total' : 'Daily'}</button>)}</div>
    </div>
    {hidden ? <p className="py-16 text-center text-sm text-ink-secondary">Chart hidden while balances are private.</p> : <motion.div key={mode} initial={reduced ? false : {opacity:0}} animate={{opacity:1}} transition={{duration:reduced ? 0 : .25}} className="mt-3">
      <svg viewBox="0 0 560 204" className="w-full" role="img" aria-label={`${mode === 'cumulative' ? 'Cumulative' : 'Daily'} spending. This cycle solid purple; previous cycle dashed grey. Use the day slider for exact amounts.`}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366d9" stopOpacity=".24"/><stop offset="100%" stopColor="#6366d9" stopOpacity=".01"/></linearGradient></defs>
        {[low, low + span / 2, high].map((value, i) => <g key={i}><line x1="44" x2="548" y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".08"/><text x="38" y={y(value) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity=".65">{compact(value)}</text></g>)}
        <line x1="44" x2="548" y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".2"/>
        {mode === 'cumulative' ? <>
          <path d={`${line(current)} L ${x(current.length)} ${y(0)} Z`} fill={`url(#${gradient})`}/>
          {report.hasComparison && <path d={line(previous)} fill="none" stroke="#858b9c" strokeWidth="2" strokeDasharray="5 5"/>}
          <path key={month} className="chart-line-draw" pathLength="1" strokeDasharray="1" d={line(current)} fill="none" stroke="#6366d9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
        </> : current.map((day, i) => <g key={day.date}>
          {report.hasComparison && <line x1={x(day.day) - 5} x2={x(day.day) - 5} y1={y(0)} y2={y(previous[i]?.net ?? 0)} stroke="#858b9c" strokeWidth="3" strokeDasharray="2 2"/>}
          <rect x={x(day.day) - 2} y={Math.min(y(0), y(day.net))} width={Math.min(8, 300 / Math.max(current.length, 1))} height={Math.max(day.net === 0 ? 0 : 2, Math.abs(y(day.net) - y(0)))} rx="2" fill={day.net < 0 ? '#059669' : '#6366d9'}/>
        </g>)}
        {selected && <><line x1={x(selected.day)} x2={x(selected.day)} y1="15" y2="180" stroke="#6366d9" opacity=".25"/><motion.circle initial={false} animate={{cx:x(selected.day),cy:y(selected[mode])}} transition={{duration:reduced ? 0 : .12}} r="4" fill="#6366d9" stroke="white" strokeWidth="2"/></>}
        <text x="44" y="200" fontSize="10" fill="currentColor">Start</text><text x="548" y="200" textAnchor="end" fontSize="10" fill="currentColor">Day {report.days}</text>
      </svg>
      <p className="mt-1 text-xs text-ink-secondary">● This cycle {report.hasComparison ? ' · ┄ Previous cycle' : ''}</p>
    </motion.div>}
    {selected && <div className="mt-4 rounded-2xl bg-surface/80 px-4 py-2">
      <label htmlFor={`${gradient}-day`} className="flex items-center justify-between gap-3 text-xs"><span>{formatDayMonth(monthKeyToDate(selected.date))} · day {selected.day}</span><span className="font-semibold tnum">{money(selected[mode])}{mode === 'cumulative' ? ' so far' : ' net'}</span></label>
      <input id={`${gradient}-day`} aria-label="Explore spending by cycle day" type="range" min="0" max={Math.max(0, current.length - 1)} value={selected.day - 1} onChange={event => setChosen(Number(event.target.value))} className="h-8 w-full accent-[var(--color-accent)]"/>
      <button type="button" disabled={!selected.transactions.length} onClick={() => onOpen(`Spending · ${formatDayMonth(monthKeyToDate(selected.date))}`, selected.transactions)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-xs disabled:opacity-50"><span>{selected.transactions.length ? `${selected.transactions.length} records · ${money(selected.outgoing)} paid · ${money(selected.returned)} returned` : 'No recorded spending on this day'}</span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0"/></button>
    </div>}
  </section>;
}

export function PaymentMix({ report, onSelect }: { report: Report; onSelect: (id: string) => void }) {
  const money = useMoneyText(), compact = useMoneyTextCompact(), { hidden } = usePrivacy();
  const ringRef=useRef<HTMLDivElement>(null);
  const inView=useInView(ringRef,{once:true,amount:.5});
  const total = report.sources.reduce((sum, source) => sum + source.outgoing, 0);
  let offset = 0;
  const arcs = PAYMENT_STYLES.flatMap(style => {
    const source = report.sources.find(s => s.source === style.id);
    if (!source || source.outgoing <= 0 || total <= 0) return [];
    const share = source.outgoing / total * 100, start = offset; offset += share;
    return [{ ...style, share, start }];
  });
  return <section className="visual-card" aria-label="Payment mix">
    <div className="flex items-center justify-between"><h3 className="font-semibold">How you paid</h3><InfoButton title="Payment mix"><p>The ring shows purchases before refunds, so every segment is a positive share of the same total. Rows show net spending after refunds, including negative amounts when more was refunded than spent.</p><p>Card repayments and transfers are excluded. Tap a payment source to see its transactions.</p></InfoButton></div>
    <div ref={ringRef} className={`relative mx-auto my-4 h-40 w-40 ${inView ? 'ring-visible' : ''}`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label={hidden ? 'Payment chart hidden' : `Purchases by payment source, total ${money(total)}`}>
        <circle cx="80" cy="80" r="65" fill="none" stroke="var(--color-surface-sunken)" strokeWidth="12"/>
        {!hidden && arcs.map(arc => <circle className="ring-segment" style={{'--ring-segment':`${arc.share} ${100-arc.share}`} as CSSProperties} key={arc.id} cx="80" cy="80" r="65" pathLength="100" fill="none" stroke={arc.color} strokeWidth="12" strokeDasharray={`${arc.share} ${100 - arc.share}`} strokeDashoffset={-arc.start}/>) }
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-semibold tnum">{compact(total)}</span><span className="mt-1 text-xs text-ink-secondary">Purchases</span></div>
    </div>
    <div className="space-y-1">{PAYMENT_STYLES.map(style => {
      const source = report.sources.find(s => s.source === style.id);
      if (!source) return null;
      const Icon = style.icon;
      return <button key={style.id} type="button" onClick={() => onSelect(style.id)} aria-label={`Explore ${style.label}`} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-hover">
        <span className="rounded-xl bg-surface-sunken p-2" style={{ color: style.color }}><Icon aria-hidden="true" className="h-4 w-4"/></span>
        <span className="min-w-0 flex-1"><span className="block text-sm">{style.label}</span><span className="block text-xs text-ink-secondary">{!hidden && total > 0 ? `${Math.round(source.outgoing / total * 100)}% of purchases` : 'Recorded purchases'}{source.returned > 0 ? ` · ${money(source.returned)} returned` : ''}</span></span>
        <span className="text-right text-sm font-medium tnum">{money(source.net)}<span className="block text-[10px] font-normal text-ink-secondary">net</span></span>
      </button>;
    })}</div>
  </section>;
}
