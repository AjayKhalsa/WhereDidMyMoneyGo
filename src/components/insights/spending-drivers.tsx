"use client";

import {useMemo,useState} from 'react';
import {SpendingPulse, PaymentMix} from './spending-visuals';
import type {Transaction} from '@/lib/domain/types';
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText,usePrivacy} from '@/lib/hooks/use-privacy';
import {formatDayMonth,monthKeyToDate} from '@/lib/domain/dates';
import {spendingDrivers} from '@/lib/engine/spending-drivers';
import {spendingSummary} from '@/lib/engine/spending';
import {InfoButton} from '@/components/ui/info-button';
import {Sheet} from '@/components/ui/sheet';
import {TransactionList} from '@/components/transactions/transaction-list';

const SOURCES=[
 {id:'card',label:'Credit cards',color:'bg-violet-500'},
 {id:'bank',label:'Bank accounts',color:'bg-emerald-600'},
 {id:'cash',label:'Cash',color:'bg-amber-500'},
 {id:'unknown',label:'Account unknown',color:'bg-slate-400'},
] as const;
const dayLabel=(day:string)=>formatDayMonth(monthKeyToDate(day));
type Detail={kind:'comparison'|'category'|'merchant'|'source';id:string;month:string};

export function SpendingDrivers(){
 const {db,month,now,cycleStartDay}=useFinance();
 const money=useMoneyText(),{hidden}=usePrivacy();
 const [detail,setDetail]=useState<Detail|null>(null),[period,setPeriod]=useState<'current'|'previous'>('current');
 const [dayDetail,setDayDetail]=useState<{title:string;ids:string[];month:string}|null>(null);
 const [allDrivers,setAllDrivers]=useState(false),[allMerchants,setAllMerchants]=useState(false);
 const report=useMemo(()=>spendingDrivers({transactions:db?.transactions??[],categories:db?.categories??[],accounts:db?.accounts??[],month,now,cycleStartDay}),[db?.transactions,db?.categories,db?.accounts,month,now,cycleStartDay]);
 const open=(kind:Detail['kind'],id='')=>{setDetail({kind,id,month});setPeriod('current');};
 const driver=report.drivers.find(row=>row.id===detail?.id);
 const merchant=report.merchants.find(row=>row.id===detail?.id);
 const source=report.sources.find(row=>row.source===detail?.id);
 const compare=detail?.kind==='comparison'||detail?.kind==='category';
 const currentRows=detail?.kind==='comparison'?report.comparedRows:detail?.kind==='category'?driver?.currentRows:detail?.kind==='merchant'?merchant?.rows:source?.transactions;
 const previousRows=detail?.kind==='comparison'?report.previousRows:detail?.kind==='category'?driver?.previousRows:[];
 const rows=(compare&&period==='previous'?previousRows:currentRows)??[];
 const title=detail?.kind==='comparison'?'Spending comparison':detail?.kind==='category'?driver?.label:detail?.kind==='merchant'?merchant?.label:SOURCES.find(s=>s.id===detail?.id)?.label;
 const range=compare?(period==='previous'?report.previousRange:report.comparisonRange):report.currentRange;
 const maxChange=Math.max(1,...report.drivers.map(row=>Math.abs(row.difference)));
 const maxMerchant=Math.max(1,...report.merchants.map(row=>row.net));
 const openDay=(title:string,rows:Transaction[])=>setDayDetail({title,ids:rows.map(row=>row.id),month});
 const changes=report.drivers.filter(row=>row.difference!==0);
 const signed=(value:number)=>`${value>0?'+':''}${money(value)}`;

 if(!report.currentRows.length&&!report.previousRows.length)return null;
 return <section aria-label="Spending drivers" className="space-y-4">
  <SpendingPulse key={month} report={report} transactions={db?.transactions??[]} month={month} cycleStartDay={cycleStartDay} onOpen={openDay}/>
  <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">What moved your spending</h2></div><InfoButton title="Spending drivers"><p>Figures use recorded purchases minus posted refunds. Salary, investments, ordinary credits and card repayments are excluded.</p><p>Changes compare the first {report.days} days of each pay cycle. Different cycle lengths use their shared number of days. Merchant and payment-source totals cover the full selected cycle to date.</p><p>Refunds stay on their posting date and use the original purchase's category and merchant when linked. Account types include archived accounts; missing information stays unknown.</p><p>Change bars extend left for lower spending and right for higher spending. Merchant bars show positive net spending; negative amounts represent net refunds. Recorded history provides the comparison, while bank statements establish coverage.</p></InfoButton></div>
  <div className="visual-card space-y-3">
   <div className="flex items-baseline justify-between gap-3"><h3 className="font-medium">What changed</h3>{report.hasComparison&&<span className="text-xs text-ink-tertiary">First {report.days} cycle days</span>}</div>
   {report.hasComparison?<>
    <button type="button" className="w-full min-h-11 text-left" onClick={()=>open('comparison')} aria-label="Open spending comparison"><p className="text-xl font-semibold">{report.difference===0?'Recorded spending is unchanged':`${money(Math.abs(report.difference))} ${report.difference>0?'more':'less'} spent`}</p><p className="mt-1 text-xs text-ink-secondary">{money(report.compared.spending)} this cycle · {money(report.previous.spending)} previous{report.percent!==null&&!hidden?` · ${Math.abs(report.percent).toFixed(0)}% ${report.difference>=0?'higher':'lower'}`:''}</p></button>
    <p className="text-xs text-ink-tertiary">{dayLabel(report.comparisonRange.from)}–{dayLabel(report.comparisonRange.to)} vs {dayLabel(report.previousRange.from)}–{dayLabel(report.previousRange.to)}</p>
    {!hidden&&changes.length>0&&<p className="flex justify-between text-[11px] text-ink-secondary"><span>← Less spent</span><span>More spent →</span></p>}
    {changes.length>0?<div className="divide-y divide-line">{(allDrivers?changes:changes.slice(0,5)).map(row=><button key={row.id} type="button" onClick={()=>open('category',row.id)} className="block min-h-16 w-full rounded-lg px-1 py-3 text-left hover:bg-surface-hover" aria-label={`Explore change in ${row.label}`}>
      <span className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-sm">{row.label}</span><span className={`shrink-0 text-sm font-medium tnum ${row.difference>0?'text-accent':'text-emerald-700'}`}>{signed(row.difference)}</span></span>
      {!hidden&&<span aria-hidden="true" className="mt-2 flex h-2"><span className="flex w-1/2 justify-end border-r border-line-strong">{row.difference<0&&<span className="block h-full rounded-l-full bg-emerald-600 visual-bar" style={{width:`${-row.difference/maxChange*100}%`}}/>}</span><span className="w-1/2">{row.difference>0&&<span className="block h-full rounded-r-full bg-accent visual-bar" style={{width:`${row.difference/maxChange*100}%`}}/>}</span></span>}
     </button>)}</div>:<p className="text-sm text-ink-secondary">No category-level change in these recorded periods.</p>}
    {changes.length>5&&<button type="button" className="min-h-11 text-sm underline underline-offset-4" onClick={()=>setAllDrivers(value=>!value)}>{allDrivers?'Show fewer changes':`All ${changes.length} category changes`}</button>}
   </>:<div><p className="text-xl font-semibold">{money(report.current.spending)} recorded spending</p><p className="mt-1 text-xs text-ink-secondary">No previous-period spending recorded for comparison.</p></div>}
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="visual-card min-w-0"><h3 className="font-semibold">Top merchants</h3><p className="mt-1 text-xs text-ink-tertiary">This cycle · after refunds</p><div className="mt-2 divide-y divide-line">{(allMerchants?report.merchants:report.merchants.slice(0,5)).map(row=><button key={row.id} type="button" onClick={()=>open('merchant',row.id)} aria-label={`Explore merchant ${row.label}`} className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{row.label}</span><span className="mt-1 block text-xs text-ink-tertiary">{row.count?`${row.count} ${row.count===1?'payment':'payments'}${row.count>1?` · avg ${money(row.average)}`:''}`:'Refunds only'}</span>{!hidden&&row.net>0&&<span aria-hidden="true" className="mt-2 block h-1.5 rounded-full bg-surface-sunken"><span className="block h-full rounded-full bg-accent/70 visual-bar" style={{width:`${row.net/maxMerchant*100}%`}}/></span>}</span><span className="shrink-0 text-sm tnum">{money(row.net)}</span></button>)}</div>{report.merchants.length>5&&<button type="button" onClick={()=>setAllMerchants(value=>!value)} className="min-h-11 text-sm underline underline-offset-4">{allMerchants?'Show fewer merchants':`All ${report.merchants.length} merchants`}</button>}</div>
   <PaymentMix report={report} onSelect={id=>open('source',id)}/>
  </div>
  <Sheet open={!!dayDetail&&dayDetail.month===month} onClose={()=>setDayDetail(null)} title={dayDetail?.title} size="lg"><TransactionList transactions={(db?.transactions??[]).filter(row=>dayDetail?.ids.includes(row.id))} showDayTotals={false} showTime/></Sheet>
  <Sheet open={!!detail&&detail.month===month&&!!currentRows} onClose={()=>setDetail(null)} title={title} description={`${dayLabel(range.from)}–${dayLabel(range.to)} · recorded spending after refunds`} size="lg">
   {compare&&<div className="mb-4 flex gap-2"><button type="button" onClick={()=>setPeriod('current')} aria-pressed={period==='current'} className={`min-h-11 rounded-lg border border-line px-3 text-sm ${period==='current'?'bg-ink text-white':''}`}>This cycle</button><button type="button" onClick={()=>setPeriod('previous')} aria-pressed={period==='previous'} className={`min-h-11 rounded-lg border border-line px-3 text-sm ${period==='previous'?'bg-ink text-white':''}`}>Previous cycle</button></div>}
   <p className="mb-4 text-lg font-semibold">{money(spendingSummary(rows,db?.transactions??[]).spending)}</p>
   <TransactionList transactions={rows} showDayTotals={false} showTime emptyTitle="No spending in this period"/>
  </Sheet>
 </section>;
}
