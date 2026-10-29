import { nextOccurrence } from './recurring';
import { toDateInputValue, clampToMonth } from '@/lib/domain/dates';
import { transactionOccurredBy } from '@/lib/domain/transaction-time';
import type { RecurringTransaction, Transaction, IncomeSource } from '@/lib/domain/types';
import type { CreditCardSummary } from './analytics';

export interface PaymentEvent {id:string;date:string;label:string;amount:number;kind:'bill'|'investment'|'income'|'card';status:'expected'|'recorded';transactionIds:string[];note:string}
/** Read-only schedule projection. Never creates a payment or modifies safe-to-spend. */
export function paymentCalendar(rules:RecurringTransaction[],income:IncomeSource[],cards:CreditCardSummary[],transactions:Transaction[],now:Date):PaymentEvent[]{
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const end=new Date(start);end.setDate(end.getDate()+29);
 const from=toDateInputValue(start),to=toDateInputValue(end),events:PaymentEvent[]=[];
 for(const rule of rules.filter(r=>r.isActive)){
  let date=nextOccurrence(rule,start);
  for(let guard=0;date<=end&&guard<31;guard++){
   const day=toDateInputValue(date);
   const paid=transactions.filter(t=>t.recurringId===rule.id&&t.type===rule.type&&t.categoryId!=='adjustment'&&t.date.slice(0,10)===day&&transactionOccurredBy(t,now));
   events.push({id:`rule:${rule.id}:${day}`,date:day,label:rule.merchant||rule.description,amount:paid.length?paid.reduce((sum,t)=>sum+t.amount,0):rule.amount,kind:rule.type==='INVESTMENT'?'investment':'bill',status:paid.length?'recorded':'expected',transactionIds:paid.map(t=>t.id),note:paid.length?'Linked payment recorded.':rule.frequency==='YEARLY'?'Estimated anniversary; month inferred from rule creation.':'Scheduled estimate. Payments on another date may need linking.'});
   const next=new Date(date);next.setDate(next.getDate()+1);date=nextOccurrence(rule,next);
  }
 }
 for(const source of income.filter(s=>s.isActive&&s.recurring)){
  for(let offset=0;offset<2;offset++){
   const date=clampToMonth(start.getFullYear(),start.getMonth()+offset,source.dayOfMonth),day=toDateInputValue(date);
   if(day<from||day>to)continue;
   events.push({id:`income:${source.id}:${day}`,date:day,label:source.name,amount:Math.max(0,source.amount-source.deductions),kind:'income',status:'expected',transactionIds:[],note:'Expected income; receipt must be confirmed by an actual credit.'});
  }
 }
 for(const card of cards){
  const statement=card.lastStatement;if(!statement||!card.dueDate)continue;
  const day=toDateInputValue(card.dueDate),remaining=Math.max(0,statement.spent-statement.paidAmount);
  if(day>to||statement.paidInFull||remaining<=0)continue;
  events.push({id:`card:${card.account.id}:${day}`,date:day,label:card.account.name,amount:remaining,kind:'card',status:'expected',transactionIds:[],note:`Ledger-derived statement remainder${day<from?' · overdue':''}. Check the bank statement for final dues.`});
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label));
}
