import type {Account,Category,Transaction} from '@/lib/domain/types';
import {addMonths,daysInMonth,elapsedDaysInMonth,monthKeyToDate,toDateInputValue} from '@/lib/domain/dates';
import {indiaNow,transactionOccurredBy} from '@/lib/domain/transaction-time';
import {createCategoryLookup} from '@/lib/domain/categories';
import {isSpendingActivity,spendingAttribution,spendingSummary} from './spending';
import {categoryPaymentSources} from './payment-source-breakdown';
import {recognizedMerchants} from './merchant-recognition';

export interface DriverBucket {
 id:string;label:string;current:number;previous:number;difference:number;
 currentRows:Transaction[];previousRows:Transaction[];
}
export interface MerchantSpend {
 id:string;label:string;net:number;gross:number;refunds:number;count:number;average:number;rows:Transaction[];
}

/** Recorded consumption only. Comparisons use equal prefixes of pay cycles;
 * refunds remain on their posting dates and inherit linked purchase metadata. */
export function spendingDrivers(input:{transactions:Transaction[];categories:Category[];accounts:Account[];month:string;cycleStartDay:number;now:Date}){
 const {month,cycleStartDay,now}=input;
 const all=input.transactions.filter(t=>transactionOccurredBy(t,now));
 const metadata=spendingAttribution(all),lookup=createCategoryLookup(input.categories);
 const eligible=all.filter(t=>isSpendingActivity(metadata(t)));
 // Pay-cycle arithmetic uses today's Indian calendar date, independent of host timezone.
 const today=new Date(`${indiaNow(now).slice(0,10)}T12:00:00`);
 const elapsed=elapsedDaysInMonth(today,month,cycleStartDay);
 const previousMonth=addMonths(month,-1,cycleStartDay);
 const days=Math.min(elapsed,daysInMonth(previousMonth,cycleStartDay));
 const range=(key:string,length:number)=>{
  const end=monthKeyToDate(key);end.setDate(end.getDate()+Math.max(0,length)-1);
  return {from:key,to:toDateInputValue(end)};
 };
 const within=(key:string,length:number)=>{
  if(length<=0)return [];
  const {from,to}=range(key,length);
  return eligible.filter(t=>t.date.slice(0,10)>=from&&t.date.slice(0,10)<=to);
 };
 const currentRows=within(month,elapsed),comparedRows=within(month,days),previousRows=within(previousMonth,days);
 const current=spendingSummary(currentRows,all),compared=spendingSummary(comparedRows,all),previous=spendingSummary(previousRows,all);
 const groups=(rows:Transaction[])=>{
  const map=new Map<string,Transaction[]>();
  for(const row of rows){const id=lookup.groupOf(metadata(row).categoryId??'other')?.id??'other';map.set(id,[...(map.get(id)??[]),row]);}
  return map;
 };
 const left=groups(comparedRows),right=groups(previousRows);
 const drivers:DriverBucket[]=[...new Set([...left.keys(),...right.keys()])].map(id=>{
  const currentRows=left.get(id)??[],previousRows=right.get(id)??[];
  const current=spendingSummary(currentRows,all).spending,previous=spendingSummary(previousRows,all).spending;
  return {id,label:lookup.groupNameOf(id),current,previous,difference:current-previous,currentRows,previousRows};
 }).sort((a,b)=>Math.abs(b.difference)-Math.abs(a.difference)||a.label.localeCompare(b.label));
 const merchants=new Map<string,{label:string;rows:Transaction[]}>();
 for(const row of currentRows){
  const name=metadata(row).merchant?.trim();
  const known=name?recognizedMerchants(name):[];
  const label=known.length===1?known[0]!.name:name||'Merchant not recorded';
  // Preserve digits and distinct unknown payees; no merchant is invented from a description.
  const id=name?label.toLowerCase().normalize('NFKC').replace(/\s+/g,' '):'__unknown';
  const bucket=merchants.get(id)??{label,rows:[]};bucket.rows.push(row);merchants.set(id,bucket);
 }
 const merchantSpending:MerchantSpend[]=[...merchants].map(([id,bucket])=>{
  const summary=spendingSummary(bucket.rows,all);
  return {id,label:bucket.label,net:summary.spending,gross:summary.gross,refunds:summary.refunds,count:summary.count,
   average:summary.count?Math.round(summary.gross/summary.count):0,rows:bucket.rows};
 }).sort((a,b)=>b.net-a.net||a.label.localeCompare(b.label));
 const sources=categoryPaymentSources(currentRows,all,input.accounts,()=> 'all').get('all')??[];
 const hasComparison=days>0&&previousRows.length>0;
 const difference=compared.spending-previous.spending;
 return {current,currentRows,compared,previous,comparedRows,previousRows,days,elapsed,hasComparison,difference,
  percent:hasComparison&&previous.spending>0&&compared.spending>=0?difference/previous.spending*100:null,
  currentRange:range(month,elapsed),comparisonRange:range(month,days),previousRange:range(previousMonth,days),
  drivers,merchants:merchantSpending,sources};
}
