import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategorySeed } from '@/lib/domain/categories';
import { spendingSummary, netSpending, netCategoryOutflow } from '@/lib/engine/spending';
import { spendingReport } from '@/lib/engine/spending-report';
import { spendByGroup, spendByCategory, spendByContext, spendByMerchant, spendByAccount, monthTotals, compareToAverage, monthlySpendHistory, spendingVelocity, creditCardOutstanding, netWorth, valueInvestments, lensTotals } from '@/lib/engine/analytics';
import { calculateSafeToSpend, upcomingRecurring } from '@/lib/engine/safe-to-spend';
import { recurringStatuses } from '@/lib/engine/recurring';
import { generateInsights } from '@/lib/engine/insights';
import { at, expense, income, transfer, investmentTxn, makeAccount, makeCard, makeInvestment, makeRecurring, makeIncomeSource, rs } from '../helpers/factories';
const now=new Date('2026-10-21T12:00:00Z'),month='2026-10-01';
const family={id:'family',name:'Family transfers',parentId:null,order:100,system:false};
const categories=[...buildCategorySeed(),family];

test('family cash flow: five debits of 140k less an 80k credit is 60k, preserving income classification',()=>{
 const rows=[10000,10000,10000,60000,50000].map(amount=>expense({amount:rs(amount),categoryId:'family',date:at('2026-10-11')}));
 const credit=income({amount:rs(80000),categoryId:'family',date:at('2026-10-12')});rows.push(credit);
 const original=structuredClone(rows);
 const summary=spendingSummary(rows);assert.equal(summary.gross,rs(140000));assert.equal(summary.credits,rs(80000));assert.equal(summary.net,rs(60000));assert.equal(summary.count,5);assert.equal(summary.creditCount,1);
 assert.equal(spendByGroup(rows,x=>x,rows,true)[0]!.amount,rs(60000));
 const report=spendingReport(rows,categories,{month,now,cycleStartDay:1,dimension:'category',includeCredits:true});
 assert.equal(report.current.net,rs(60000));assert.equal(report.current.transactions.length,6);assert.equal(report.buckets[0]!.net,rs(60000));
 const budget=monthTotals(rows,month);assert.equal(budget.income-budget.spent,-rs(60000));
 assert.equal(netSpending(rows),rs(140000)); // ordinary credits are not relabelled merchant refunds
 assert.deepEqual(rows,original);assert.equal(credit.isRefund,undefined);
});

test('every spending breakdown nets the same refund and excludes adjustments, transfers and investments',()=>{
 const a=makeAccount();const tag={type:'PEOPLE',value:'friends'} as const;
 const purchase=expense({amount:rs(1000),categoryId:'dining.lunch',merchant:'Cafe',accountId:a.id,contexts:[tag,tag],date:at('2026-10-10')});
 const refund=income({amount:rs(300),isRefund:true,reversesTransactionId:purchase.id,accountId:a.id,date:at('2026-10-11')});
 const rows=[purchase,refund,expense({categoryId:'adjustment',amount:rs(99999)}),income({amount:rs(88888)}),transfer(),investmentTxn()];
 assert.equal(netSpending(rows),rs(700));assert.equal(monthTotals(rows,month).spent,rs(700));
 for(const slices of [spendByGroup(rows,x=>x),spendByCategory(rows,x=>x),spendByContext(rows,x=>x),spendByMerchant(rows),spendByAccount(rows,[a])])assert.equal(slices.reduce((s,b)=>s+b.amount,0),rs(700));
 const lens=lensTotals(rows,[{id:'friends',label:'Friends',question:'Friends?',contexts:['friends']}]);assert.equal(lens[0]!.amount,rs(700));assert.deepEqual(lens[0]!.transactions,[purchase,refund]);
});

test('late refunds retain their received cycle and inherit prior purchase attribution in all views',()=>{
 const purchase=expense({categoryId:'shopping.clothing',merchant:'Shop',contexts:[{type:'PEOPLE',value:'friends'}],date:at('2026-09-10')});
 const refund=income({amount:rs(1200),isRefund:true,reversesTransactionId:purchase.id,date:at('2026-10-10')});const all=[purchase,refund];
 assert.equal(spendByGroup([refund],x=>x,all)[0]!.id,'shopping');
 assert.equal(spendByMerchant([refund],all)[0]!.amount,-rs(1200));
 assert.equal(monthTotals(all,month).spent,-rs(1200));
 assert.equal(lensTotals([refund],[{id:'friends',label:'Friends',question:'?',contexts:['friends']}],all)[0]!.amount,-rs(1200));
});

test('trend and velocity use net refunds; zero-net historical activity remains a real comparison month',()=>{
 const rows=[expense({amount:rs(200),date:at('2026-09-10')}),income({amount:rs(200),isRefund:true,date:at('2026-09-11')}),expense({amount:rs(1000),date:at('2026-10-10')}),income({amount:rs(400),isRefund:true,date:at('2026-10-11')})];
 assert.equal(monthlySpendHistory(rows,month,1)[0]!.amount,0);
 const comparison=compareToAverage(rows,month,()=>true,1);assert.equal(comparison.current,rs(600));assert.equal(comparison.monthsCounted,1);assert.equal(comparison.average,0);
 assert.equal(spendingVelocity(rows,month,now).spentSoFar,rs(600));
});

test('category insight evidence includes credits and reports the same 60k net',()=>{
 const rows=[expense({categoryId:'family',amount:rs(140000),date:at('2026-10-11')}),income({categoryId:'family',amount:rs(80000),date:at('2026-10-12')})];
 const insight=generateInsights({transactions:rows,accounts:[],investments:[],goals:[],month,now,cycleStartDay:1,groupLabel:id=>id}).find(i=>i.id==='leak:family')!;
 assert.ok(insight);assert.equal(insight.amount,rs(60000));assert.equal(insight.basis,'category-flow');assert.deepEqual(insight.transactions,rows);
});

test('available cash never includes future salary, future ledger rows or positive card credit',()=>{
 const bank=makeAccount({openingBalance:rs(10000)}),card=makeCard();
 const salary=income({accountId:bank.id,amount:rs(100000),date:at('2026-11-01')});
 const rows=[salary,transfer({accountId:bank.id,toAccountId:card.id,amount:rs(2000),date:at('2026-10-10')})];
 const result=calculateSafeToSpend({transactions:rows,accounts:[bank,card],incomeSources:[makeIncomeSource({amount:rs(100000),deductions:0})],investments:[],goals:[],recurring:[],month,now,cycleStartDay:1});
 assert.equal(result.bankBalance,rs(8000));assert.equal(result.safeAmount,rs(8000));
 assert.equal(netWorth([bank,card],rows,[],[],now),rs(10000));
});

test('recorded card credits and investment charges obey liability and wealth invariants',()=>{
 const card=makeCard();const rows=[investmentTxn({accountId:card.id,investmentId:'fund',amount:rs(5000)}),income({accountId:card.id,amount:rs(1000)})];
 assert.equal(creditCardOutstanding(rows,card.id),rs(4000));
});

test('investment withdrawal increases cash, reduces portfolio and changes net investments, never income',()=>{
 const bank=makeAccount({openingBalance:0}),holding=makeAccount({type:'INVESTMENT',openingBalance:0}),investment=makeInvestment({id:'fund'});
 const rows=[investmentTxn({investmentId:investment.id,accountId:bank.id,amount:rs(10000),date:at('2026-10-02')}),transfer({investmentId:investment.id,accountId:holding.id,toAccountId:bank.id,amount:rs(4000),date:at('2026-10-03')})];
 const totals=monthTotals(rows,month);assert.equal(totals.invested,rs(6000));assert.equal(totals.income,0);
 assert.equal(valueInvestments([investment],rows,now)[0]!.value,rs(6000));
 assert.equal(netWorth([bank,holding],rows,[investment],[],now),0);
 const safe=calculateSafeToSpend({transactions:rows,accounts:[bank,holding],investments:[],incomeSources:[],recurring:[],goals:[],month,now,cycleStartDay:1});
 assert.equal(safe.monthlySurplus,safe.positionNow-safe.positionAtCycleStart);
});

test('a refund or renewal reminder cannot satisfy a recurring expense obligation',()=>{
 const rule=makeRecurring({dayOfPeriod:25,frequency:'MONTHLY'});
 const rows=[income({recurringId:rule.id,isRefund:true,date:at('2026-10-10')})];
 assert.equal(upcomingRecurring([rule],rows,month,now).length,1);
 assert.equal(recurringStatuses([rule],rows,month,now)[0]!.paidThisMonth,false);
});

test('investment and card insights expose evidence on the correct financial basis',()=>{
 const bank=makeAccount(),card=makeCard();
 const holding=makeAccount({type:'INVESTMENT'});
 const rows=[income({amount:rs(100000),accountId:bank.id,date:at('2026-10-01')}),investmentTxn({amount:rs(50000),investmentId:'fund',accountId:bank.id,date:at('2026-10-02')}),transfer({amount:rs(10000),investmentId:'fund',accountId:holding.id,toAccountId:bank.id,date:at('2026-10-03')}),expense({amount:rs(30000),accountId:card.id,date:at('2026-09-01')}),transfer({amount:rs(5000),accountId:bank.id,toAccountId:card.id,date:at('2026-10-04')})];
 const input={transactions:rows,accounts:[bank,card,holding],investments:[],goals:[],month,now,cycleStartDay:1,groupLabel:(id:string)=>id};
 const insights=generateInsights(input);
 const inv=insights.find(i=>i.kind==='investment-rate')!;assert.equal(inv.amount,rs(50000));assert.equal(inv.basis,'investment');assert.equal(inv.transactions.length,1);assert.match(inv.body,/10,000.*principal/);assert.equal(monthTotals(rows,month,1).invested,rs(40000));
 const debt=insights.find(i=>i.kind==='credit-commitment')!;assert.equal(debt.amount,rs(25000));assert.equal(debt.basis,'balance');assert.ok(debt.transactions.some(t=>t.date.startsWith('2026-09')));assert.ok(debt.transactions.some(t=>t.toAccountId===card.id));
 const noIncome=generateInsights({...input,transactions:rows.filter(t=>t.type!=='INCOME')}).find(i=>i.kind==='credit-commitment')!;assert.doesNotMatch(noIncome.body,/%/);assert.match(noIncome.body,/No income/);
});

test('a future payment never marks a recurring bill paid, while a same-day unknown clock is date-only evidence',async()=>{
 const {transactionOccurredBy}=await import('@/lib/domain/transaction-time');
 const rule=makeRecurring({dayOfPeriod:25});
 const future=expense({recurringId:rule.id,date:at('2026-10-25')});
 assert.equal(recurringStatuses([rule],[future],month,now)[0]!.paidThisMonth,false);
 const today=expense({date:'2026-10-21T23:00:00'});
 assert.equal(transactionOccurredBy(today,now),true);
 assert.equal(transactionOccurredBy({...today,timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'}},now),false);
});


test('an ongoing-cycle month change compares matched elapsed dates, including refunds',()=>{
 const rows=[expense({amount:rs(20000),date:at('2026-09-10')}),expense({amount:rs(80000),date:at('2026-09-29')}),expense({amount:rs(20000),date:at('2026-10-10')})];
 const insights=generateInsights({transactions:rows,accounts:[],investments:[],goals:[],month,now,cycleStartDay:1,groupLabel:id=>id});
 assert.equal(insights.some(i=>i.id==='month-over-month'),false); // Both comparable periods are 20k, not an invented 80% drop.
});

test('three 10k SIPs remain 30k contributions when a 50k FD principal is returned',()=>{
 const bank=makeAccount({openingBalance:rs(100000)}),holding=makeAccount({type:'INVESTMENT',openingBalance:rs(50000)});
 const fund=makeInvestment({id:'sip'}),fd=makeInvestment({id:'fd',currentValue:rs(50000),valuedAt:at('2026-10-01')});
 const rows=[...Array.from({length:3},(_,i)=>investmentTxn({id:`sip-${i}`,amount:rs(10000),investmentId:fund.id,accountId:bank.id,date:at('2026-10-26')})),transfer({amount:rs(50000),investmentId:fd.id,accountId:holding.id,toAccountId:bank.id,date:at('2026-10-29')}),income({amount:rs(648),accountId:bank.id,date:at('2026-10-29')})];
 const original=structuredClone(rows),date=new Date('2026-10-30T12:00:00Z'),cycle='2026-10-24';
 const totals=monthTotals(rows,cycle,24);
 assert.equal(totals.investmentContributions,rs(30000));assert.equal(totals.investmentWithdrawals,rs(50000));assert.equal(totals.invested,-rs(20000));assert.equal(totals.income,rs(648));assert.equal(totals.spent,0);
 const safe=calculateSafeToSpend({transactions:rows,accounts:[bank,holding],investments:[fund,fd],incomeSources:[],recurring:[],goals:[],month:cycle,now:date,cycleStartDay:24});
 assert.equal(safe.bankBalance,rs(120648));assert.equal(safe.monthlySurplus,rs(20648));assert.equal(safe.positionNow-safe.positionAtCycleStart,safe.monthlySurplus);
 const lines=safe.monthlySurplusBreakdown;
 assert.equal(lines.find(l=>l.id==='invested')!.amount,rs(30000));assert.equal(lines.find(l=>l.id==='invested')!.direction,'subtract');
 assert.equal(lines.find(l=>l.id==='investment-withdrawals')!.amount,rs(50000));assert.equal(lines.find(l=>l.id==='investment-withdrawals')!.direction,'add');
 assert.equal(lines.reduce((sum,l)=>sum+(l.direction==='add'?l.amount:-l.amount),0),safe.monthlySurplus);
 assert.equal(valueInvestments([fd],rows,date)[0]!.value,0);assert.equal(valueInvestments([fd],rows,date)[0]!.gain,rs(50000));
 assert.equal(netWorth([bank,holding],rows,[fund,fd],[],date)-netWorth([bank,holding],[],[fund,fd],[],date),rs(648));assert.deepEqual(rows,original);
});

test('gross investment totals preserve legitimate repeats and exclude unrelated transfers and adjustments',()=>{
 const rows=[investmentTxn({amount:rs(10000),date:at('2026-10-26')}),investmentTxn({amount:rs(10000),date:at('2026-10-26')}),investmentTxn({amount:rs(99999),categoryId:'adjustment',date:at('2026-10-26')}),investmentTxn({amount:rs(777),date:at('2026-09-01')}),transfer({amount:rs(50000),date:at('2026-10-26')}),transfer({amount:rs(1000),investmentId:'fund',accountId:'same',toAccountId:'same',date:at('2026-10-26')})];
 const totals=monthTotals(rows,'2026-10-24',24);assert.equal(totals.investmentContributions,rs(20000));assert.equal(totals.investmentWithdrawals,0);assert.equal(totals.invested,rs(20000));
});

test('historical card debt reduction stops at the selected cycle end',()=>{
 const bank=makeAccount({openingBalance:rs(100000)}),card=makeCard();
 const rows=[expense({accountId:card.id,amount:rs(30000),date:at('2026-09-01')}),transfer({accountId:bank.id,toAccountId:card.id,amount:rs(5000),date:at('2026-10-10')}),transfer({accountId:bank.id,toAccountId:card.id,amount:rs(10000),date:at('2026-11-10')})];
 const safe=calculateSafeToSpend({transactions:rows,accounts:[bank,card],investments:[],incomeSources:[],goals:[],recurring:[],month:'2026-10-01',now:new Date('2026-11-15T12:00:00Z'),cycleStartDay:1});
 assert.equal(safe.cardDebtCleared,rs(5000));assert.equal(safe.positionDifference,0);
});

test('cash-position discrepancies from excluded adjustments remain explicit',()=>{
 const bank=makeAccount({openingBalance:rs(10000)});
 const safe=calculateSafeToSpend({transactions:[income({accountId:bank.id,categoryId:'adjustment',amount:rs(1234),date:at('2026-10-10')})],accounts:[bank],investments:[],incomeSources:[],recurring:[],goals:[],month,now,cycleStartDay:1});
 assert.equal(safe.positionDifference,-rs(1234));assert.equal(safe.monthlySurplus,0);
});
