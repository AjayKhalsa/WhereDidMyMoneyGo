import type {Account, Transaction} from '@/lib/domain/types';
import {addMonths, monthKeyToDate, toDateInputValue} from '@/lib/domain/dates';
import {indiaNow, transactionOccurredBy} from '@/lib/domain/transaction-time';
import {isSpendingActivity, spendingAttribution, spendingSummary} from './spending';
import {categoryPaymentSources} from './payment-source-breakdown';

/** Calendar dates are ledger dates in India, not email/logging clocks. Empty
 * days mean no recorded spending, never verified zero spending. Read-only. */
export function spendingCalendar(input:{transactions:Transaction[];accounts:Account[];month:string;cycleStartDay:number;now:Date}) {
  const {transactions,accounts,month,cycleStartDay,now}=input;
  const today=indiaNow(now).slice(0,10);
  const all=transactions.filter(t=>transactionOccurredBy(t,now));
  const metadata=spendingAttribution(all);
  const end=addMonths(month,1,cycleStartDay);
  const byDay=new Map<string,Transaction[]>();
  for(const row of all) {
    const date=row.date.slice(0,10);
    if(date<month||date>=end||!isSpendingActivity(metadata(row)))continue;
    const rows=byDay.get(date)??[];rows.push(row);byDay.set(date,rows);
  }
  const days=[];
  // Local date arithmetic preserves wall dates even across host DST changes.
  for(const date=monthKeyToDate(month);toDateInputValue(date)<end;date.setDate(date.getDate()+1)) {
    const key=toDateInputValue(date),rows=byDay.get(key)??[];
    days.push({date:key,weekday:date.getDay(),future:key>today,today:key===today,rows,
      ...spendingSummary(rows,all),
      sources:categoryPaymentSources(rows,all,accounts,()=> 'all').get('all')??[]});
  }
  const rows=days.flatMap(day=>day.rows);
  const summary=spendingSummary(rows,all);
  const highest=days.filter(day=>day.spending>0).sort((a,b)=>b.spending-a.spending||a.date.localeCompare(b.date))[0]??null;
  return {days,rows,summary,highest,recordedDays:days.filter(day=>day.rows.length>0).length,
    maxPositive:Math.max(0,...days.map(day=>day.spending)),from:month,to:days.at(-1)?.date??month};
}
