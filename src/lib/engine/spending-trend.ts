import { daysInMonth, monthKeyToDate, toDateInputValue } from '@/lib/domain/dates';
import type { Transaction } from '@/lib/domain/types';
import { spendingSummary } from './spending';

export interface SpendingDay { day:number; date:string; net:number; cumulative:number; outgoing:number; returned:number; transactions:Transaction[] }

/** Consume already-filtered report rows so totals, tags and refund attribution agree. */
export function spendingTrend(rows:Transaction[], all:Transaction[], month:string, cycleStartDay:number, comparableDays:number|null):SpendingDay[] {
  const length=Math.min(daysInMonth(month,cycleStartDay),comparableDays??Infinity);
  const byDate=new Map<string,Transaction[]>();
  for(const row of rows) {const key=row.date.slice(0,10);byDate.set(key,[...(byDate.get(key)??[]),row]);}
  let cumulative=0;
  return Array.from({length},(_,i)=>{
    const date=monthKeyToDate(month);date.setDate(date.getDate()+i);
    const key=toDateInputValue(date), transactions=byDate.get(key)??[];
    const summary=spendingSummary(transactions,all);
    cumulative+=summary.net;
    return {day:i+1,date:key,net:summary.net,cumulative,outgoing:summary.gross,returned:summary.refunds+summary.credits,transactions};
  });
}
