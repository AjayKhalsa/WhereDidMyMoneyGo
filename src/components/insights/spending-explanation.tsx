"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import type { Transaction } from '@/lib/domain/types';
import type { spendingDrivers } from '@/lib/engine/spending-drivers';
import { explainSpending } from '@/lib/engine/spending-explanation';
import { useMoneyText, usePrivacy } from '@/lib/hooks/use-privacy';
import { InfoButton } from '@/components/ui/info-button';

export function SpendingExplanation({ report, onOpen }: {
  report: ReturnType<typeof spendingDrivers>;
  onOpen: (title: string, rows: Transaction[]) => void;
}) {
  const analysis = explainSpending(report);
  const money = useMoneyText(), { hidden } = usePrivacy(), reduced = useReducedMotion();
  const max = Math.max(1, ...analysis.effects.map(e => Math.abs(e.amount)));
  const driver = analysis.dominant;
  const headline = !report.hasComparison ? 'Your largest purchases' : report.difference === 0 ? 'Changes offset each other' : !driver ? 'Recorded spending is unchanged' :
    driver.id === 'frequency' ? (driver.amount > 0 ? 'More purchases drove the change' : 'Fewer purchases drove the change') :
    driver.id === 'ticket' ? (driver.amount > 0 ? 'Larger purchases drove the change' : 'Smaller purchases drove the change') :
    driver.id === 'refunds' ? (driver.amount > 0 ? 'Fewer refunds raised net spending' : 'Refunds brought net spending down') :
    'Purchases explain the change';
  return <section className="analysis-editorial" aria-label="Spending analysis">
    <div className="flex items-center justify-between gap-3"><p className="eyebrow">Behind the numbers</p><InfoButton title="How this analysis works"><p>We compare the first {report.days} days of both pay cycles. Changes in purchase count and average purchase size explain the gross spending difference; changes in refunds explain the rest.</p><p>The count/average interaction is split equally between both effects. Amounts reconcile to the net change, rounded to the nearest paise. These are arithmetic contributions, not proof of why you spent differently; average size can change because you bought different things.</p><p>With no purchases in either period, purchase frequency and size cannot be separated. Missing imported history can also affect the comparison. The largest-purchase share covers all recorded purchases in the selected cycle to date, before refunds.</p></InfoButton></div>
    <h3 className="mt-2 max-w-lg text-xl font-semibold leading-snug tracking-tight">{headline}</h3>
    {report.hasComparison && <>
      <p className="mt-2 text-xs text-ink-secondary">Compared across {report.days} cycle days · recorded history</p>
      <div className="mt-5 grid grid-cols-2 gap-5 border-y border-line py-4">
        <div><p className="text-xs text-ink-secondary">Purchases · previous → now</p><p className="mt-1 text-lg font-semibold tnum">{analysis.previousCount} <span className="text-ink-tertiary">→</span> {analysis.currentCount}</p></div>
        <div><p className="text-xs text-ink-secondary">Average purchase</p><p className="mt-1 text-sm font-semibold tnum">{analysis.previousAverage === null ? '—' : money(analysis.previousAverage)} <span className="text-ink-tertiary">→</span> {analysis.currentAverage === null ? '—' : money(analysis.currentAverage)}</p></div>
      </div>
      <div className="mt-4 space-y-4" aria-label="Contributions to spending change">{analysis.effects.map(effect => <div key={effect.id}>
        <div className="flex items-center justify-between gap-3 text-xs"><span>{effect.label}</span><span className="font-semibold tnum">{effect.amount > 0 ? '+' : ''}{money(effect.amount)}</span></div>
        {!hidden && <div aria-hidden="true" className="mt-2 flex h-1.5"><div className="flex w-1/2 justify-end border-r border-line-strong">{effect.amount < 0 && <motion.div className="h-full rounded-l-full bg-emerald-600" initial={false} animate={{width:`${-effect.amount / max * 100}%`}} transition={{duration:reduced ? 0 : .45}}/>}</div><div className="w-1/2">{effect.amount > 0 && <motion.div className="h-full rounded-r-full bg-accent" initial={false} animate={{width:`${effect.amount / max * 100}%`}} transition={{duration:reduced ? 0 : .45}}/>}</div></div>}
      </div>)}</div>
      <div className="mt-4 flex justify-between border-t border-line pt-3 text-sm font-semibold"><span>Net change</span><span className="tnum">{report.difference > 0 ? '+' : ''}{money(report.difference)}</span></div>
    </>}
    {analysis.purchaseCount > 3 && analysis.largestShare !== null && <button type="button" onClick={() => onOpen('Your three largest purchases', analysis.largest)} className="mt-5 flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-accent-soft/60 px-3 py-3 text-left text-sm"><span><strong>{hidden ? 'Your 3 largest purchases' : `3 purchases account for ${Math.round(analysis.largestShare)}%`}</strong><span className="mt-1 block text-xs text-ink-secondary">{money(analysis.largestAmount)} of {money(report.current.gross)} paid this cycle</span></span><ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0"/></button>}
    {!report.hasComparison && analysis.purchaseCount <= 3 && <p className="mt-3 text-sm text-ink-secondary">{analysis.purchaseCount ? `${analysis.purchaseCount} purchases recorded. A comparison appears once the previous cycle has spending history.` : 'No purchases recorded in this cycle.'}</p>}
  </section>;
}
