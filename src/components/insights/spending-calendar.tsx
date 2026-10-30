"use client";

import {useMemo,useState} from 'react';
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText,usePrivacy} from '@/lib/hooks/use-privacy';
import {formatDayMonth,formatFullDate,monthKeyToDate} from '@/lib/domain/dates';
import {spendingCalendar} from '@/lib/engine/spending-calendar';
import {InfoButton} from '@/components/ui/info-button';
import {Sheet} from '@/components/ui/sheet';
import {TransactionList} from '@/components/transactions/transaction-list';

const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SOURCE_NAMES={card:'Credit cards',bank:'Bank accounts',cash:'Cash',unknown:'Account unknown'};
const INTENSITY=['bg-violet-100 text-violet-950','bg-violet-200 text-violet-950','bg-violet-400 text-violet-950','bg-violet-700 text-white'];
const label=(date:string)=>formatDayMonth(monthKeyToDate(date));

export function SpendingCalendar() {
  const {db,month,cycleStartDay,now}=useFinance();
  const money=useMoneyText(),{hidden}=usePrivacy();
  const [selection,setSelection]=useState<{month:string;date:string}|null>(null);
  const report=useMemo(()=>spendingCalendar({transactions:db?.transactions??[],accounts:db?.accounts??[],month,cycleStartDay,now}),[db?.transactions,db?.accounts,month,cycleStartDay,now]);
  const selected=selection?.month===month?report.days.find(day=>day.date===selection.date&&!day.future):undefined;
  const offset=((report.days[0]?.weekday??1)+6)%7;

  return <section aria-label="Spending calendar" className="rounded-2xl border border-line bg-surface p-4 sm:p-5 space-y-4">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Spending by day</h2><p className="mt-1 text-sm text-ink-secondary">{money(report.summary.spending)} after refunds · {report.recordedDays} days with entries</p></div><InfoButton title="Spending by day"><p>Each day shows recorded purchases minus posted refunds. Tap a date for the original entries and payment-source split. Salary, investments, transfers and balance adjustments are excluded.</p><p>Darker purple means higher net spending within this cycle; green marks net refunds. A dot marks recorded activity. A blank past day means no spending recorded, not proof of a no-spend day.</p><p>Refunds stay on the date they arrived, including refunds for earlier purchases. Dates follow the Indian calendar; a missing transaction clock does not prevent a day-level total. Future payments are excluded.</p><p>These figures depend on the entries captured in your ledger. Bank statements establish whether that history is complete.</p></InfoButton></div>
    <div className="flex items-center justify-between gap-3 text-xs text-ink-tertiary"><span>{label(report.from)} – {label(report.to)}</span>{report.highest&&<button type="button" onClick={()=>setSelection({month,date:report.highest!.date})} className="min-h-11 text-right underline underline-offset-4" aria-label="Open highest spending day">Highest: {label(report.highest.date)} · {money(report.highest.spending)}</button>}</div>
    <div className="grid grid-cols-7 gap-1 sm:gap-2" aria-label="Daily recorded spending">
      {WEEKDAYS.map(day=><span key={day} className="pb-1 text-center text-[10px] text-ink-tertiary sm:text-xs">{day}</span>)}
      {Array.from({length:offset},(_,i)=><span key={`blank-${i}`} aria-hidden="true"/>)}
      {report.days.map(day=>{
        const color=hidden?'bg-surface-sunken text-ink':day.spending<0?'bg-emerald-100 text-emerald-950':day.spending>0?INTENSITY[Math.min(3,Math.ceil(day.spending/report.maxPositive*4)-1)]:'bg-surface-sunken text-ink';
        const status=day.future?'Upcoming':!day.rows.length?'No spending recorded':day.spending<0?'Net refunds':day.spending===0?'Net zero':'Net spending';
        return <button type="button" key={day.date} disabled={day.future} aria-label={`${formatFullDate(monthKeyToDate(day.date))}: ${status}${!hidden&&day.rows.length?` ${money(day.spending)}`:''}`} aria-current={day.today?'date':undefined} onClick={()=>setSelection({month,date:day.date})} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center rounded-lg border text-xs sm:min-h-16 ${day.today?'border-ink':'border-transparent'} ${day.future?'bg-surface-sunken text-ink-tertiary opacity-40':color} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}>
          <span>{Number(day.date.slice(8,10))}</span>{(day.date===report.from||day.date.endsWith('-01'))&&<span className="text-[9px]">{monthKeyToDate(day.date).toLocaleDateString('en-IN',{month:'short'})}</span>}
          {day.rows.length>0&&<span aria-hidden="true" className="absolute bottom-1 h-1 w-1 rounded-full bg-current"/>}
        </button>;
      })}
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-tertiary">{hidden?<span>Amounts and spending intensity hidden</span>:<><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-violet-200"/>Lower</span><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-violet-700"/>Higher</span><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-emerald-100"/>Net refunds</span></>}<span>Tap a day to explore</span></div>
    <Sheet open={!!selected} onClose={()=>setSelection(null)} title={selected?`Spending · ${formatFullDate(monthKeyToDate(selected.date))}`:'Daily spending'} size="lg">
      {selected&&<><div className="mb-5 space-y-3"><p className="text-2xl font-semibold">{money(selected.spending)} <span className="text-sm font-normal text-ink-secondary">net spending</span></p><p className="text-sm text-ink-secondary">{money(selected.gross)} purchases · {money(selected.refunds)} refunds</p>{selected.sources.length>0&&<div className="divide-y divide-line">{selected.sources.map(source=><div key={source.source} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{SOURCE_NAMES[source.source]}</span><span className="tnum">{money(source.net)}</span></div>)}</div>}</div><TransactionList transactions={selected.rows} showDayTotals={false} showTime emptyTitle="No spending recorded" emptyDescription="There are no purchase or refund entries for this date."/></>}
    </Sheet>
  </section>;
}
