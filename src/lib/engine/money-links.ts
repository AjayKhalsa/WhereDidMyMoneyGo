import {isSalaryIncome} from './salary-cycle';
import type { Database, MoneyLink, Transaction } from '@/lib/domain/types';

export function linkFingerprint(links: MoneyLink[]) {
  return links.map(l=>({id:l.id,kind:l.kind,income_id:l.incomeId,expense_id:l.expenseId??null,amount:l.amount})).sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateMoneyLinks(transactions: Transaction[], links: MoneyLink[]): string|null {
  const byId=new Map(transactions.map(t=>[t.id,t]));
  const incomeUsed=new Map<string,number>(),expenseUsed=new Map<string,number>();
  const ids=new Set<string>();
  for(const l of links){
    if(ids.has(l.id))return 'Duplicate link. Reload and try again.';ids.add(l.id);
    if(!['CONTRIBUTION','PASS_THROUGH'].includes(l.kind)||!Number.isSafeInteger(l.amount)||l.amount<=0)return 'Every link needs a positive amount.';
    const incoming=byId.get(l.incomeId),outgoing=l.expenseId?byId.get(l.expenseId):undefined;
    if(!incoming||incoming.type!=='INCOME'||incoming.isRefund||incoming.categoryId==='adjustment'||incoming.categoryId==='income.salary'||isSalaryIncome(incoming))return 'Choose contributed or held money, excluding salary, refunds and balance adjustments.';
    if(l.expenseId&&(!outgoing||outgoing.type!=='EXPENSE'||outgoing.categoryId==='adjustment'))return 'Choose an expense for the outgoing payment.';
    incomeUsed.set(l.incomeId,(incomeUsed.get(l.incomeId)??0)+l.amount);
    if(outgoing)expenseUsed.set(outgoing.id,(expenseUsed.get(outgoing.id)??0)+l.amount);
  }
  for(const [id,amount]of incomeUsed)if(amount>byId.get(id)!.amount)return 'An incoming payment has been allocated more than once. Reduce the linked amounts.';
  for(const [id,amount]of expenseUsed)if(amount>byId.get(id)!.amount)return 'Linked funding exceeds the purchase amount. Reduce the linked amounts.';
  return null;
}

/** Raw ledger is immutable. Only confirmed, received money changes personal reporting. */
export function projectMoneyLinks(db: Pick<Database,'transactions'|'moneyLinks'>, asOf=new Date()) {
  const rows=db.transactions;
  const byId=new Map(rows.map(t=>[t.id,t]));
  const confirmed=(t:Transaction|undefined)=>!!t&&new Date(t.date)<=asOf;
  const refunds=new Map<string,number>();
  for(const t of rows)if(confirmed(t)&&t.type==='INCOME'&&t.isRefund&&t.reversesTransactionId)refunds.set(t.reversesTransactionId,(refunds.get(t.reversesTransactionId)??0)+t.amount);
  const excluded=new Map<string,number>(),covered=new Map<string,number>();
  const applied=new Map<string,number>();
  let held=0,passThroughHeld=0,purchaseFundsHeld=0;
  const links=[...(db.moneyLinks??[])].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  for(const l of links){
    const incoming=byId.get(l.incomeId),expense=l.expenseId?byId.get(l.expenseId):undefined;
    if(!confirmed(incoming)||incoming!.type!=='INCOME'||incoming!.isRefund)continue;
    if(l.expenseId&&(!expense||expense.type!=='EXPENSE'))continue;
    const reserved=Math.min(l.amount,Math.max(0,incoming!.amount-(excluded.get(l.incomeId)??0)));
    if(reserved<=0)continue;
    excluded.set(l.incomeId,(excluded.get(l.incomeId)??0)+reserved);
    const capacity=expense&&confirmed(expense)?Math.max(0,expense.amount-(refunds.get(expense.id)??0)-(covered.get(expense.id)??0)):0;
    const used=Math.min(reserved,capacity);
    if(expense&&used>0)covered.set(expense.id,(covered.get(expense.id)??0)+used);
    applied.set(l.id,used);
    const pending=reserved-used;held+=pending;
    if(l.kind==='PASS_THROUGH')passThroughHeld+=pending;else purchaseFundsHeld+=pending;
  }
  const transactions=rows.map(t=>{
    const reduction=t.type==='INCOME'?(excluded.get(t.id)??0):t.type==='EXPENSE'?(covered.get(t.id)??0):0;
    return reduction>0?{...t,bankAmount:t.bankAmount??t.amount,categoryId:t.type==='INCOME'?undefined:t.categoryId,amount:Math.max(0,t.amount-reduction)}:t;
  });
  return {transactions,held,passThroughHeld,purchaseFundsHeld,excluded,covered,applied};
}

export function transactionLinkSummary(db: Pick<Database,'transactions'|'moneyLinks'>, id:string, asOf=new Date()) {
  const projection=projectMoneyLinks(db,asOf);
  const original=db.transactions.find(t=>t.id===id);
  const links=(db.moneyLinks??[]).filter(l=>l.incomeId===id||l.expenseId===id);
  return {original,links,personal:projection.transactions.find(t=>t.id===id)?.amount??0,linked:original?original.amount-(projection.transactions.find(t=>t.id===id)?.amount??original.amount):0};
}
