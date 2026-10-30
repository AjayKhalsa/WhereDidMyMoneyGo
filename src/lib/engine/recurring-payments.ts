import {toDateInputValue,clampToMonth} from '@/lib/domain/dates';
import {transactionOccurredBy} from '@/lib/domain/transaction-time';
import type {RecurringTransaction,Transaction} from '@/lib/domain/types';
import {recognizedMerchants} from './merchant-recognition';
import {anniversaryMonth,occurrencesInCycle} from './recurring-occurrences';
import {merchantPayee} from './merchant-identity';

export interface RecurringOccurrence {
 rule:RecurringTransaction;dueDate:Date;transaction?:Transaction;basis?:'explicit'|'recognised';
}
const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function identity(text:string|undefined):string|undefined {
 if(!text)return;
 text=merchantPayee(text);
 const known=recognizedMerchants(text);
 if(known.length===1)return `brand:${known[0]!.name.toLowerCase()}`;
 if(known.length>1)return;
 const key=normalized(text);
 if(key.length<5||['subscription','subscriptions','payment','electricity','mobile bill','rent','monthly bill','insurance','bill payment'].includes(key))return;
 return `payee:${key}`;
}
const dayNumber=(day:string)=>Date.parse(day.slice(0,10)+'T12:00:00Z')/86400000;
const distance=(t:Transaction,date:Date)=>Math.abs(dayNumber(t.date)-dayNumber(toDateInputValue(date)));
function sameCategory(a:string|undefined,b:string|undefined){return !!a&&!!b&&!['other','adjustment'].includes(a)&&!['other','adjustment'].includes(b)&&a.split('.')[0]===b.split('.')[0];}
export function possibleRecurringPayments(rule:RecurringTransaction,transactions:Transaction[],dueDate:Date,now:Date):Transaction[]{
 const key=identity(rule.merchant??rule.description);
 if(rule.type!=='EXPENSE'||rule.categoryId?.split('.')[0]!=='bills'||!rule.accountId||!key)return [];
 const refunded=new Set(transactions.filter(t=>t.type==='INCOME'&&t.isRefund&&t.reversesTransactionId&&transactionOccurredBy(t,now)).map(t=>t.reversesTransactionId));
 return transactions.filter(t=>!t.recurringId&&!refunded.has(t.id)&&t.type==='EXPENSE'&&t.amount>0&&t.accountId===rule.accountId&&sameCategory(t.categoryId,rule.categoryId)&&identity(t.merchant??t.description)===key&&transactionOccurredBy(t,now)&&distance(t,dueDate)<=3);
}

/** Possible duplicate schedules are warnings, never automatic deletion or
 * suppression of a commitment. Different accounts/plans stay independent. */
export function overlappingRecurringRules(rules:RecurringTransaction[]):Map<string,string[]>{
 const result=new Map<string,string[]>();
 for(let i=0;i<rules.length;i++)for(let j=i+1;j<rules.length;j++){
  const a=rules[i]!,b=rules[j]!;
  if(!a.isActive||!b.isActive||a.type!==b.type||!a.accountId||a.accountId!==b.accountId||a.amount!==b.amount)continue;
  const key=identity(a.merchant??a.description);if(!key||key!==identity(b.merchant??b.description))continue;
  let gap=Math.abs(a.dayOfPeriod-b.dayOfPeriod);
  if(a.frequency!==b.frequency)gap=0; // Same service/amount can collide across cadences.
  else if(a.frequency==='WEEKLY')gap=Math.min(gap,7-gap);
  else if(a.frequency==='MONTHLY'){
   gap=Infinity;
   for(const year of [2024,2025])for(let month=0;month<12;month++)for(const offset of [-1,0,1]){
    const x=clampToMonth(year,month,a.dayOfPeriod),y=clampToMonth(year,month+offset,b.dayOfPeriod);
    gap=Math.min(gap,Math.abs(dayNumber(toDateInputValue(x))-dayNumber(toDateInputValue(y))));
   }
  }else{
   const ma=anniversaryMonth(a.createdAt),mb=anniversaryMonth(b.createdAt);gap=Infinity;
   for(const year of [2024,2025])for(const offset of [-1,0,1]){
    const x=clampToMonth(year,ma,a.dayOfPeriod),y=clampToMonth(year+offset,mb,b.dayOfPeriod);
    gap=Math.min(gap,Math.abs(dayNumber(toDateInputValue(x))-dayNumber(toDateInputValue(y))));
   }
  }
  if(gap>3)continue;
  result.set(a.id,[...result.get(a.id)??[],b.id]);result.set(b.id,[...result.get(b.id)??[],a.id]);
 }
 return result;
}

/** Read-only payment recognition. A debit clears at most one occurrence and
 * only when both the payment and schedule have a unique eligible counterpart.
 * Never persist a recurringId or create a transaction from a prediction. */
export function resolveRecurringPayments(rules:RecurringTransaction[],transactions:Transaction[],start:Date,end:Date,now:Date):RecurringOccurrence[]{
 const slots:RecurringOccurrence[]=rules.filter(r=>r.isActive).flatMap(rule=>occurrencesInCycle(rule,start,end).map(dueDate=>({rule,dueDate})));
 const actual=transactions.filter(t=>t.amount>0&&t.categoryId!=='adjustment'&&transactionOccurredBy(t,now));
 const used=new Set<string>(),from=dayNumber(toDateInputValue(start)),to=dayNumber(toDateInputValue(end));
 // Explicit user links are authoritative, including early payments in a cycle
 // and changed charge amounts. Assign the nearest still-unpaid occurrence.
 for(const t of [...actual].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))){
  if(!t.recurringId)continue;
  const rule=rules.find(r=>r.id===t.recurringId);if(!rule)continue;
  const [year,month]=t.date.slice(0,10).split('-').map(Number);
  const physical=[-1,0,1].flatMap(offset=>rule.frequency==='YEARLY'
   ?occurrencesInCycle(rule,new Date(year!+offset,0,1),new Date(year!+offset,11,31))
   :occurrencesInCycle(rule,new Date(year!,month!-1+offset,1),new Date(year!,month!+offset,0)));
  const nearest=physical.sort((a,b)=>distance(t,a)-distance(t,b)||a.getTime()-b.getTime())[0];
  // The nearest real occurrence may be outside the displayed window. A late
  // October payment must not clear November just because October is hidden.
  const candidates=slots.filter(s=>!s.transaction&&s.rule.id===t.recurringId&&s.rule.type===t.type&&nearest&&toDateInputValue(s.dueDate)===toDateInputValue(nearest)&&((dayNumber(t.date)>=from&&dayNumber(t.date)<=to)||distance(t,s.dueDate)<=3));
  const target=candidates[0];if(target){target.transaction=t;target.basis='explicit';used.add(t.id);}
 }
 const overlaps=overlappingRecurringRules(rules);
 const candidates=new Map<RecurringOccurrence,Transaction[]>(),claims=new Map<string,RecurringOccurrence[]>();
 for(const slot of slots){
  const rule=slot.rule,key=identity(rule.merchant??rule.description);
  // Duplicate schedules require review even if only one falls in this window.
  if(slot.transaction||rule.type!=='EXPENSE'||!rule.accountId||!key||overlaps.has(rule.id))continue;
  const matches=possibleRecurringPayments(rule,transactions,slot.dueDate,now).filter(t=>!used.has(t.id));
  candidates.set(slot,matches);
  for(const t of matches)claims.set(t.id,[...claims.get(t.id)??[],slot]);
 }
 for(const [slot,matches] of candidates){
  const t=matches[0];if(matches.length===1&&t&&t.amount===slot.rule.amount&&claims.get(t.id)?.length===1){slot.transaction=t;slot.basis='recognised';}
 }
 return slots.sort((a,b)=>a.dueDate.getTime()-b.dueDate.getTime()||a.rule.id.localeCompare(b.rule.id));
}
