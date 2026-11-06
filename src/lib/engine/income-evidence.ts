import {isSalaryIncome} from './salary-cycle';
import type {Transaction} from '@/lib/domain/types';
import {monthTransactions} from './analytics';
import {transactionOccurredBy} from '@/lib/domain/transaction-time';
const earned=(t:Transaction)=>t.type==='INCOME'&&!t.isRefund&&t.categoryId!=='adjustment';

export function incomeEvidence(transactions:Transaction[],month:string,cycleStartDay:number,now:Date){
 const all=transactions.filter(t=>transactionOccurredBy(t,now)&&earned(t));
 const rows=monthTransactions(all,month,cycleStartDay);
 const salaryBeforeCycle=rows.some(isSalaryIncome)?undefined:all.filter(t=>isSalaryIncome(t)&&t.date.slice(0,10)<month).sort((a,b)=>b.date.localeCompare(a.date))[0];
 const earlySalary=rows.filter(t=>isSalaryIncome(t)&&t.date.slice(0,10)<month);
 return {rows,salaryBeforeCycle,earlySalary};
}
