"use client";

import {useMemo,useState} from 'react';
import {ArrowRight} from 'lucide-react';
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
 const maxSource=Math.max(1,...report.sources.map(source=>source.net));
 const changes=report.drivers.filter(row=>row.difference!==0);
 const signed=(value:number)=>`${value>0?'+':''}${money(value)}`;

 if(!report.currentRows.length&&!report.previousRows.length)return null;
 return <section aria-label="Spending drivers" className="space-y-4">
  <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Your spending, explained</h2><p className="text-sm text-ink-secondary">Purchases minus refunds, by category, merchant and payment source.</p></div><InfoButton title="Spending drivers"><p>Figures use recorded purchases minus posted refunds. Salary, investments, ordinary credits and card repayments are excluded.</p><p>Changes compare the first {report.days} days of each pay cycle. Different cycle lengths use their shared number of days. Merchant and payment-source totals cover the full selected cycle to date.</p><p>Refunds stay on their posting date and use the original purchase's category and merchant when linked. Account types include archived accounts; missing information stays unknown.</p><p>Bars compare positive net spending; negative amounts represent net refunds. Recorded history provides the comparison, while bank statements establish coverage.</p></InfoButton></div>
  <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 space-y-3">
   <div className="flex items-baseline justify-between gap-3"><h3 className="font-medium">What changed</h3>{report.hasComparison&&<span className="text-xs text-ink-tertiary">First {report.days} cycle days</span>}</div>
   {report.hasComparison?<>
    <button type="button" className="w-full min-h-11 text-left" onClick={()=>open('comparison')} aria-label="Open spending comparison"><p className="text-xl font-semibold">{report.difference===0?'Recorded spending is unchanged':`${money(Math.abs(report.difference))} ${report.difference>0?'more':'less'} spent`}</p><p className="mt-1 text-xs text-ink-secondary">{money(report.compared.spending)} this cycle · {money(report.previous.spending)} previous{report.percent!==null&&!hidden?` · ${Math.abs(report.percent).toFixed(0)}% ${report.difference>=0?'higher':'lower'}`:''}</p></button>
    <p className="text-xs text-ink-tertiary">{dayLabel(report.comparisonRange.from)}–{dayLabel(report.comparisonRange.to)} vs {dayLabel(report.previousRange.from)}–{dayLabel(report.previousRange.to)}</p>
    {changes.length>0?<div className="divide-y divide-line">{(allDrivers?changes:changes.slice(0,3)).map(row=><button key={row.id} type="button" onClick={()=>open('category',row.id)} className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left" aria-label={`Explore change in ${row.label}`}><span className="min-w-0 truncate text-sm">{row.label}</span><span className={`shrink-0 text-sm font-medium tnum ${row.difference>0?'text-danger':'text-emerald-700'}`}>{signed(row.difference)}</span></button>)}</div>:<p className="text-sm text-ink-secondary">No category-level change in these recorded periods.</p>}
    {changes.length>3&&<button type="button" className="min-h-11 text-sm underline underline-offset-4" onClick={()=>setAllDrivers(value=>!value)}>{allDrivers?'Show fewer changes':`All ${changes.length} category changes`}</button>}
   </>:<div><p className="text-xl font-semibold">{money(report.current.spending)} recorded spending</p><p className="mt-1 text-xs text-ink-secondary">No previous-period spending recorded for comparison.</p></div>}
  </div>
  <div className="grid gap-4 lg:grid-cols-2">
   <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5"><h3 className="font-medium">Top merchants</h3><p className="mt-1 text-xs text-ink-tertiary">This cycle · after refunds</p><div className="mt-2 divide-y divide-line">{(allMerchants?report.merchants:report.merchants.slice(0,5)).map(row=><button key={row.id} type="button" onClick={()=>open('merchant',row.id)} aria-label={`Explore merchant ${row.label}`} className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left"><span className="min-w-0"><span className="block truncate text-sm font-medium">{row.label}</span><span className="mt-1 block text-xs text-ink-tertiary">{row.count?`${row.count} ${row.count===1?'payment':'payments'}${row.count>1?` · avg ${money(row.average)}`:''}`:'Refunds only'}</span></span><span className="shrink-0 text-sm tnum">{money(row.net)}</span></button>)}</div>{report.merchants.length>5&&<button type="button" onClick={()=>setAllMerchants(value=>!value)} className="min-h-11 text-sm underline underline-offset-4">{allMerchants?'Show fewer merchants':`All ${report.merchants.length} merchants`}</button>}</div>
   <div className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5"><h3 className="font-medium">How you paid</h3><p className="mt-1 text-xs text-ink-tertiary">This cycle · after refunds</p><div className="mt-2 space-y-2">{SOURCES.map(definition=>{
    const source=report.sources.find(source=>source.source===definition.id);if(!source)return null;
    return <button key={definition.id} type="button" aria-label={`Explore ${definition.label}`} onClick={()=>open('source',definition.id)} className="block min-h-16 w-full py-2 text-left"><span className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${definition.color}`}/><span className="truncate">{definition.label}</span></span><span className="shrink-0 tnum">{money(source.net)}</span></span>{!hidden&&source.net>0&&<span aria-hidden="true" className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface-sunken"><span className={`block h-full rounded-full ${definition.color}`} style={{width:`${source.net/maxSource*100}%`}}/></span>}{source.net<0&&<span className="mt-1 block text-xs text-ink-tertiary">Net refunds</span>}</button>;
   })}</div><button type="button" onClick={()=>open('comparison')} className="mt-3 flex min-h-11 items-center gap-2 text-sm underline underline-offset-4">Compare cycle transactions<ArrowRight aria-hidden="true" className="h-3.5 w-3.5"/></button></div>
  </div>
  <Sheet open={!!detail&&detail.month===month&&!!currentRows} onClose={()=>setDetail(null)} title={title} description={`${dayLabel(range.from)}–${dayLabel(range.to)} · recorded spending after refunds`} size="lg">
   {compare&&<div className="mb-4 flex gap-2"><button type="button" onClick={()=>setPeriod('current')} aria-pressed={period==='current'} className={`min-h-11 rounded-lg border border-line px-3 text-sm ${period==='current'?'bg-ink text-white':''}`}>This cycle</button><button type="button" onClick={()=>setPeriod('previous')} aria-pressed={period==='previous'} className={`min-h-11 rounded-lg border border-line px-3 text-sm ${period==='previous'?'bg-ink text-white':''}`}>Previous cycle</button></div>}
   <p className="mb-4 text-lg font-semibold">{money(spendingSummary(rows,db?.transactions??[]).spending)}</p>
   <TransactionList transactions={rows} showDayTotals={false} showTime emptyTitle="No spending in this period"/>
  </Sheet>
 </section>;
}
