"use client";

import {useMemo, useState} from 'react';
import {transactionOccurredBy} from '@/lib/domain/transaction-time';
import type {BreakdownSlice} from '@/lib/engine/analytics';
import {categoryPaymentSources, type PaymentSource} from '@/lib/engine/payment-source-breakdown';
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText} from '@/lib/hooks/use-privacy';
import {Amount} from '@/components/ui/amount';
import {Sheet} from '@/components/ui/sheet';
import {TransactionList} from '@/components/transactions/transaction-list';

const SOURCES = [
  {id:'card', label:'Credit cards', color:'bg-violet-600'},
  {id:'bank', label:'Bank accounts', color:'bg-emerald-600'},
  {id:'cash', label:'Cash', color:'bg-amber-500'},
  {id:'unknown', label:'Unknown source', color:'bg-slate-400'},
] as const;

export function CategoryPaymentBars({slices, limit=8}: {slices:BreakdownSlice[]; limit?:number}) {
  const {db, monthRows, categories, now} = useFinance();
  const money = useMoneyText();
  const [selected, setSelected] = useState<string|null>(null);
  const [source, setSource] = useState<PaymentSource|null>(null);
  const groups = useMemo(() => categoryPaymentSources(monthRows, (db?.transactions ?? []).filter(t => transactionOccurredBy(t, now)), db?.accounts ?? [], id => categories.groupOf(id)?.id ?? 'other'), [monthRows, db?.transactions, db?.accounts, categories, now]);
  const visible = slices.slice(0,limit);
  const parts = (id:string) => groups.get(id) ?? [];
  const maxPositive = Math.max(1,...visible.map(s => parts(s.id).reduce((n,p) => n+Math.max(0,p.net),0)));
  const maxNegative = Math.max(0,...visible.map(s => parts(s.id).reduce((n,p) => n+Math.max(0,-p.net),0)));
  const scale = maxPositive+maxNegative;
  const present = SOURCES.filter(s => visible.some(v => parts(v.id).some(p => p.source===s.id)));
  const active = slices.find(s => s.id===selected);
  const details = parts(selected ?? '');
  const transactions = details.filter(p => source===null || p.source===source).flatMap(p => p.transactions);
  return <>
    <div aria-label="Payment source legend" className="flex flex-wrap gap-x-4 gap-y-1 px-2.5 text-xs text-ink-secondary">
      {present.map(s => <span key={s.id} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.color}`}/>{s.label}</span>)}
    </div>
    {maxNegative>0 && <p className="px-2.5 text-xs text-ink-tertiary">Net credits extend left of the divider.</p>}
    <ul className="min-w-0 space-y-0.5">
      {visible.map(slice => <li key={slice.id}>
        <button type="button" aria-label={`${slice.label}, payment source split`} onClick={() => {setSelected(slice.id);setSource(null);}} className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-hover">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium">{slice.label}</span>
            <span className="flex shrink-0 items-baseline gap-2"><span className="text-xs text-ink-tertiary">{slice.count}</span><Amount value={slice.amount} size="sm"/></span>
          </div>
          <div role="img" aria-label={parts(slice.id).map(p => `${SOURCES.find(s => s.id===p.source)!.label}: ${money(p.net)} net`).join(', ')} className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-sunken">
            {maxNegative>0 && <div className="flex h-full shrink-0 justify-end border-r border-ink-tertiary" style={{width:`${maxNegative/scale*100}%`}}>
              {SOURCES.map(s => {const n=parts(slice.id).find(p=>p.source===s.id)?.net ?? 0;return n<0 ? <span key={s.id} className={`h-full shrink-0 ${s.color}`} style={{width:`${-n/maxNegative*100}%`}}/> : null;})}
            </div>}
            <div className="flex h-full" style={{width:`${maxPositive/scale*100}%`}}>
              {SOURCES.map(s => {const n=parts(slice.id).find(p=>p.source===s.id)?.net ?? 0;return n>0 ? <span key={s.id} className={`h-full shrink-0 ${s.color}`} style={{width:`${n/maxPositive*100}%`}}/> : null;})}
            </div>
          </div>
        </button>
      </li>)}
    </ul>
    <Sheet open={!!active} onClose={()=>setSelected(null)} title={active?.label ?? 'Payment source split'} size="md">
      {active && <div className="space-y-5">
        <div><p className="text-sm text-ink-secondary">Net category outflow</p><Amount value={active.amount} size="xl"/></div>
        <div className="space-y-1" aria-label="Payment source amounts">
          {SOURCES.map(s => {const p=details.find(p=>p.source===s.id);return p ? <button key={s.id} type="button" aria-pressed={source===s.id} onClick={()=>setSource(source===s.id?null:s.id)} className={`block w-full rounded-xl border px-3 py-2 text-left ${source===s.id?'border-ink':'border-line'}`}>
            <span className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-sm"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.color}`}/>{s.label}</span><Amount value={p.net} size="sm"/></span>
            {p.returned>0 && <span className="mt-1 block text-xs text-ink-secondary">{money(p.outgoing)} outgoing − {money(p.returned)} returned</span>}
          </button> : null;})}
        </div>
        {source!==null && <button type="button" className="min-h-11 text-sm underline" onClick={()=>setSource(null)}>Show all payment sources</button>}
        <TransactionList transactions={transactions} showTime showDayTotals={false}/>
      </div>}
    </Sheet>
  </>;
}
