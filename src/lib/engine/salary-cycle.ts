import type {Transaction} from '@/lib/domain/types';
import {monthKey,type MonthKey} from '@/lib/domain/dates';
/** Explicit salary income only. Personal reimbursements and bank credits keep
 * their actual receipt cycle; refunds/adjustments can never be payroll. */
export function isSalaryIncome(t:Transaction):boolean {
 if(t.type!=='INCOME'||t.isRefund||t.reversesTransactionId||t.categoryId==='adjustment')return false;
 const text=`${t.description} ${t.merchant??''}`;
 if(/\b(?:refund|reversal|cashback|loan|principal|self[ -]?transfer|own[ -]?transfer)\b/i.test(text))return false;
 return [t.description,t.merchant??''].some(s=>/^salary$/i.test(s.trim())||/(?:^|[-/:\s])SAL(?:ARY)?\s+(?:FOR\s+)?(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+(?:20\d{2}|\d{2})\b/i.test(s));
}
/** Reporting attribution only: preserve the bank date, balance and cycle window.
 * Payroll on 22–25 belongs to the 24th cycle of that same calendar month. */
export function reportingCycle(t:Transaction,cycleStartDay=1):MonthKey {
 if(cycleStartDay===24&&isSalaryIncome(t)){
  const match=/^(\d{4}-\d{2})-(\d{2})(?:T|$)/.exec(t.date);
  if(match&&Number(match[2])>=22&&Number(match[2])<=25)return `${match[1]}-24`;
 }
 return monthKey(t.date,cycleStartDay);
}
/** Compare attribution with the unchanged calendar cash-flow window. */
export function salaryTimingAdjustments(transactions:Transaction[],key:MonthKey,cycleStartDay=1){
 let receivedBefore=0,assignedNext=0;
 if(cycleStartDay!==24)return {receivedBefore,assignedNext,difference:0};
 for(const t of transactions.filter(isSalaryIncome)){
  const actual=monthKey(t.date.length===10?`${t.date}T00:00:00`:t.date,cycleStartDay),assigned=reportingCycle(t,cycleStartDay);
  if(assigned===key&&actual!==key)receivedBefore+=t.amount;
  if(actual===key&&assigned!==key)assignedNext+=t.amount;
 }
 return {receivedBefore,assignedNext,difference:receivedBefore-assignedNext};
}
