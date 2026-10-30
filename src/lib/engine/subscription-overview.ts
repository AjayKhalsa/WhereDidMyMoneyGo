import type {Category,RecurringTransaction,Transaction} from '@/lib/domain/types';
import {monthKeyToDate,elapsedDaysInMonth,toDateInputValue,endOfMonth} from '@/lib/domain/dates';
import {indiaNow,transactionOccurredBy} from '@/lib/domain/transaction-time';
import {spendingAttribution,spendingSummary} from './spending';
import {monthlyEquivalent} from './recurring';
import {resolveRecurringPayments,overlappingRecurringRules,possibleRecurringPayments} from './recurring-payments';
import {recognizedMerchants} from './merchant-recognition';
import {detectRecurringCandidates} from './recurring-detection';
import {merchantPayee} from './merchant-identity';

export function subscriptionCategory(id:string|undefined,categories:Category[]):boolean{
 const seen=new Set<string>();
 while(id&&!seen.has(id)){
  if(id==='bills.subscription')return true;
  seen.add(id);id=categories.find(category=>category.id===id)?.parentId??undefined;
 }
 return false;
}
function serviceIdentity(name:string){
 name=merchantPayee(name);
 const known=recognizedMerchants(name);
 const label=known.length===1?known[0]!.name:name.trim()||'Subscription';
 return {key:label.toLowerCase().normalize('NFKC').replace(/\s+/g,' '),label};
}
export interface SubscriptionService {
 id:string;label:string;accountId?:string;net:number;count:number;rows:Transaction[];history:Transaction[];
 chargeChange?:{latest:Transaction;baseline:number;difference:number;evidence:Transaction[]};
}
function chargeChange(history:Transaction[],refunded:Set<string|undefined>):SubscriptionService['chargeChange']{
 const [latest,previous,older]=history;
 if(!latest||!previous||!older||[latest,previous,older].some(t=>refunded.has(t.id)))return;
 const day=(t:Transaction)=>Date.parse(t.date.slice(0,10)+'T12:00:00Z');
 if(![day(latest)-day(previous),day(previous)-day(older)].every(gap=>gap>=24*86400000&&gap<=36*86400000))return;
 if(Math.abs(previous.amount-older.amount)>Math.max(100,Math.round(older.amount*.01)))return;
 const baseline=Math.round((previous.amount+older.amount)/2),difference=latest.amount-baseline;
 if(Math.abs(difference)>=2000&&Math.abs(difference)/baseline>=.1)return {latest,baseline,difference,evidence:[latest,previous,older]};
}

/** Observed spending, scheduled estimates and uncertain overlaps stay separate.
 * No recurring rules, links or transactions are created or modified. */
export function subscriptionOverview(input:{transactions:Transaction[];rules:RecurringTransaction[];categories:Category[];month:string;cycleStartDay:number;now:Date}){
 const {rules,categories,month,cycleStartDay,now}=input;
 const all=input.transactions.filter(t=>transactionOccurredBy(t,now));
 const meta=spendingAttribution(all);
 const today=monthKeyToDate(indiaNow(now).slice(0,10));
 const elapsed=elapsedDaysInMonth(today,month,cycleStartDay);
 const end=elapsed>0?monthKeyToDate(month):endOfMonth(month,cycleStartDay);
 if(elapsed>0)end.setDate(end.getDate()+elapsed-1);
 const periodEnd=toDateInputValue(end);
 const eligible=all.filter(t=>(t.type==='EXPENSE'||t.type==='INCOME'&&t.isRefund)&&t.categoryId!=='adjustment'&&subscriptionCategory(meta(t).categoryId,categories));
 const rows=elapsed>0?eligible.filter(t=>t.date.slice(0,10)>=month&&t.date.slice(0,10)<=periodEnd):[];
 const active=rules.filter(rule=>rule.isActive&&rule.type==='EXPENSE'&&rule.amount>0&&subscriptionCategory(rule.categoryId,categories));
 const overlaps=overlappingRecurringRules(rules);
 const duplicateGroups:RecurringTransaction[][]=[],seen=new Set<string>();
 for(const rule of active){
  if(seen.has(rule.id)||!overlaps.has(rule.id))continue;
  const queue=[rule.id],ids=new Set<string>();
  while(queue.length){const id=queue.pop()!;if(ids.has(id))continue;ids.add(id);for(const other of overlaps.get(id)??[])queue.push(other);}
  ids.forEach(id=>seen.add(id));duplicateGroups.push(rules.filter(rule=>ids.has(rule.id)));
 }
 const serviceRows=new Map<string,{label:string;accountId?:string;rows:Transaction[]}>();
 for(const row of rows){
  const m=meta(row),identity=serviceIdentity(m.merchant||m.description),id=JSON.stringify([identity.key,row.accountId??'']);
  const value=serviceRows.get(id)??{label:identity.label,accountId:row.accountId,rows:[]};value.rows.push(row);serviceRows.set(id,value);
 }
 const refunded=new Set(all.filter(t=>t.type==='INCOME'&&t.isRefund&&t.reversesTransactionId).map(t=>t.reversesTransactionId));
 const services:SubscriptionService[]=[...serviceRows].map(([id,value])=>{
  const [key]=JSON.parse(id);
  const history=eligible.filter(t=>t.type==='EXPENSE'&&t.amount>0&&t.date.slice(0,10)<=periodEnd&&t.accountId===value.accountId&&serviceIdentity(meta(t).merchant||t.description).key===key).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const summary=spendingSummary(value.rows,all);
  const change=value.accountId&&history[0]&&value.rows.some(t=>t.id===history[0]!.id)?chargeChange(history,refunded):undefined;
  return {id,label:value.label,accountId:value.accountId,net:summary.spending,count:summary.count,rows:value.rows,history,chargeChange:change};
 }).sort((a,b)=>b.net-a.net||a.label.localeCompare(b.label));
 const horizonEnd=new Date(today);horizonEnd.setDate(horizonEnd.getDate()+29);
 const upcoming=resolveRecurringPayments(rules,all,today,horizonEnd,now).filter(slot=>active.some(rule=>rule.id===slot.rule.id)).map(slot=>{
  const possible=slot.transaction?[]:possibleRecurringPayments(slot.rule,all,slot.dueDate,now);
  const history=slot.rule.accountId?eligible.filter(t=>t.type==='EXPENSE'&&t.amount>0&&t.accountId===slot.rule.accountId&&serviceIdentity(meta(t).merchant||t.description).key===serviceIdentity(slot.rule.merchant||slot.rule.description).key).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)):[];
  const change=slot.rule.frequency==='MONTHLY'?chargeChange(history,refunded):undefined;
  const chargeEvidence=change&&change.latest.amount!==slot.rule.amount?change.evidence:[];
  const dueDay=Date.parse(toDateInputValue(slot.dueDate)+'T12:00:00Z');
  const nearbyRefunded=history.filter(t=>refunded.has(t.id)&&Math.abs(Date.parse(t.date.slice(0,10)+'T12:00:00Z')-dueDay)<=3*86400000);
  const refundIds=new Set(nearbyRefunded.map(t=>t.id));
  const refundEvidence=[...nearbyRefunded,...all.filter(t=>t.type==='INCOME'&&t.isRefund&&t.reversesTransactionId&&refundIds.has(t.reversesTransactionId))];
  const reviewReason=overlaps.has(slot.rule.id)?'overlap':possible.length?'possible-payment':refundEvidence.length?'refunded-charge':chargeEvidence.length?'charge-change':undefined;
  const status=slot.transaction?'recorded' as const:reviewReason?'review' as const:'expected' as const;
  return {...slot,date:toDateInputValue(slot.dueDate),status,possible,chargeEvidence,refundEvidence,reviewReason};
 });
 const monthly=active.reduce((sum,rule)=>sum+monthlyEquivalent(rule),0);
 const overlapMonthly=active.filter(rule=>overlaps.has(rule.id)).reduce((sum,rule)=>sum+monthlyEquivalent(rule),0);
 const annual=active.reduce((sum,rule)=>sum+rule.amount*(rule.frequency==='MONTHLY'?12:rule.frequency==='WEEKLY'?52:1),0);
 const candidates=detectRecurringCandidates(all,rules,now).filter(candidate=>candidate.accountId&&subscriptionCategory(candidate.categoryId,categories));
 return {rows,services,actual:spendingSummary(rows,all),active,monthly,annual,overlapMonthly,duplicateGroups,upcoming,candidates,
  expected:upcoming.filter(slot=>slot.status==='expected').reduce((sum,slot)=>sum+slot.rule.amount,0),
  needsReview:upcoming.filter(slot=>slot.status==='review').reduce((sum,slot)=>sum+slot.rule.amount,0),
  recorded:upcoming.filter(slot=>slot.status==='recorded'),period:{from:month,to:periodEnd},horizon:{from:toDateInputValue(today),to:toDateInputValue(horizonEnd)}};
}
