import type {Transaction} from '@/lib/domain/types';
import {monthTransactions} from './analytics';
import {transactionOccurredBy} from '@/lib/domain/transaction-time';
const earned=(t:Transaction)=>t.type==='INCOME'&&!t.isRefund&&t.categoryId!=='adjustment';
const salary=(t:Transaction)=>/^salary$/i.test(t.description.trim())||/^salary$/i.test(t.merchant?.trim()??'')||/(?:^|[-/:\s])SAL(?:ARY)?\s+(?:FOR\s+)?(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(?:20\d{2}|\d{2})\b/i.test(t.description);
export function incomeEvidence(transactions:Transaction[],month:string,cycleStartDay:number,now:Date){
 const all=transactions.filter(t=>transactionOccurredBy(t,now)&&earned(t));
 const rows=monthTransactions(all,month,cycleStartDay);
 const salaryBeforeCycle=rows.some(salary)?undefined:all.filter(t=>salary(t)&&t.date.slice(0,10)<month).sort((a,b)=>b.date.localeCompare(a.date))[0];
 return {rows,salaryBeforeCycle};
}
