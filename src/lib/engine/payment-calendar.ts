import { toDateInputValue, clampToMonth } from '@/lib/domain/dates';
import type { RecurringTransaction, Transaction, IncomeSource } from '@/lib/domain/types';
import type { CreditCardSummary } from './analytics';
import {resolveRecurringPayments} from './recurring-payments';

export interface PaymentEvent {id:string;date:string;label:string;amount:number;kind:'bill'|'investment'|'income'|'card';status:'expected'|'recorded';transactionIds:string[];note:string}
/** Read-only schedule projection. Never creates a payment or modifies safe-to-spend. */
export function paymentCalendar(rules:RecurringTransaction[],income:IncomeSource[],cards:CreditCardSummary[],transactions:Transaction[],now:Date):PaymentEvent[]{
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const end=new Date(start);end.setDate(end.getDate()+29);
 const from=toDateInputValue(start),to=toDateInputValue(end),events:PaymentEvent[]=[];
 for(const slot of resolveRecurringPayments(rules,transactions,start,end,now)){
  const {rule,transaction}=slot,day=toDateInputValue(slot.dueDate);
  events.push({id:`rule:${rule.id}:${day}`,date:day,label:rule.merchant||rule.description,amount:transaction?.amount??rule.amount,kind:rule.type==='INVESTMENT'?'investment':'bill',status:transaction?'recorded':'expected',transactionIds:transaction?[transaction.id]:[],note:transaction?(slot.basis==='recognised'?'Existing payment recognised by merchant, account, amount and schedule.':'Linked payment recorded.'):rule.frequency==='YEARLY'?'Estimated anniversary; month inferred from rule creation.':'Scheduled estimate. Ambiguous payments require review.'});
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
