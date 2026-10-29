"use client";
import {useState} from 'react';
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText} from '@/lib/hooks/use-privacy';
import {paymentCalendar} from '@/lib/engine/payment-calendar';
import {Sheet} from '@/components/ui/sheet';
import {TransactionList} from '@/components/transactions/transaction-list';
const LABELS={bill:'Bill / subscription',investment:'Investment',income:'Money expected in',card:'Card repayment'};
export function PaymentCalendar(){
 const {db,now,creditCards}=useFinance(),money=useMoneyText();
 const [day,setDay]=useState(''),[selected,setSelected]=useState<string[]|null>(null);
 const events=paymentCalendar(db?.recurring??[],db?.incomeSources??[],creditCards,db?.transactions??[],now);
 const dates=[...new Set(events.map(e=>e.date))];
 const visible=events.filter(e=>!day||e.date===day);
 return <section className="rounded-2xl border border-line bg-surface p-4 space-y-4" aria-label="Upcoming payments">
  <div><h2 className="text-base font-semibold">Coming up · next 30 days</h2><p className="mt-1 text-xs text-ink-secondary">Bills, subscriptions, dated investment rules and expected income. Card repayments are separate from spending.</p></div>
  {dates.length>0&&<label className="block text-xs text-ink-secondary">Choose a date<select className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-sm" value={day} onChange={e=>setDay(e.target.value)}><option value="">All upcoming dates</option>{dates.map(d=><option key={d} value={d}>{d}</option>)}</select></label>}
  {!events.length&&<p className="text-sm text-ink-secondary">No dated payments scheduled. Your existing recurring rules and income dates will appear here.</p>}
  <ul className="divide-y divide-line">{visible.map(e=><li key={e.id} className="py-3 space-y-1">
   <div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words text-sm font-medium">{e.label}</span><span className="shrink-0 text-sm">{money(e.amount)}</span></div>
   <p className="text-xs text-ink-secondary">{e.date} · {LABELS[e.kind]} · {e.status==='recorded'?'Recorded':'Expected'}</p>
   <p className="text-xs text-ink-tertiary">{e.note}</p>
   {e.transactionIds.length>0&&<button type="button" className="min-h-11 text-xs underline" onClick={()=>setSelected(e.transactionIds)}>View linked payments</button>}
  </li>)}</ul>
  <p className="text-xs text-ink-tertiary">Monthly investment plans without a payment date are not assigned a guessed date. Expected items do not change your balances.</p>
  <Sheet open={selected!==null} onClose={()=>setSelected(null)} title="Linked payments"><TransactionList transactions={(db?.transactions??[]).filter(t=>selected?.includes(t.id))} showDayTotals={false}/></Sheet>
 </section>;
}
