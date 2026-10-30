import assert from 'node:assert/strict';
import test from 'node:test';
import {generateInsights,calculateFinancialScore,type InsightInput} from '@/lib/engine/insights';
import {detectRecurringCandidates} from '@/lib/engine/recurring-detection';
import {expense,income,transfer,makeAccount,makeCard,rs,makeRecurring} from '../helpers/factories';
const bank=makeAccount({id:'bank'}),card=makeCard({id:'card'});
const base:InsightInput={transactions:[],accounts:[bank,card],goals:[],investments:[],month:'2026-10-01',now:new Date('2026-10-30T08:00:00Z'),cycleStartDay:1,groupLabel:id=>id};
const insights=(transactions:InsightInput['transactions'])=>generateInsights({...base,transactions});
test('food and payment-source insights reconcile refunds without counting repayments, salary or investments',()=>{
 const delivery=expense({id:'order',amount:rs(1000),merchant:'Swiggy',categoryId:'dining.dinner',accountId:'card',date:'2026-10-20'});
 const rows=[delivery,expense({amount:rs(2000),merchant:'Zepto',categoryId:'dining.groceries',accountId:'bank',date:'2026-10-21'}),income({amount:rs(200),isRefund:true,reversesTransactionId:'order',date:'2026-10-22',accountId:'card'}),transfer({amount:rs(9999),date:'2026-10-23',accountId:'bank',toAccountId:'card'}),income({amount:rs(60000),date:'2026-10-24'}),expense({type:'INVESTMENT',amount:rs(10000),date:'2026-10-24'}),expense({categoryId:'adjustment',amount:rs(50000),date:'2026-10-25'})];
 const before=JSON.stringify(rows),out=insights(rows),food=out.find(i=>i.kind==='food-mix')!,split=out.find(i=>i.kind==='payment-source')!;
 assert.equal(food.amount,rs(2800));assert.equal(food.transactions.length,3);assert.match(food.body,/800/);assert.match(food.body,/2,000/);
 assert.equal(split.amount,rs(2800));assert.equal(split.transactions.length,3);assert.match(split.body,/Credit cards: ₹800/);assert.match(split.body,/Bank accounts: ₹2,000/);assert.equal(JSON.stringify(rows),before);
});
const subscription=(date:string,amount:number,accountId='card')=>expense({date,amount:rs(amount),merchant:'Netflix',categoryId:'bills.subscription',accountId});
test('subscription charge change needs two stable monthly payments on the same account',()=>{
 const rows=[subscription('2026-08-05',499),subscription('2026-09-05',499),subscription('2026-10-05',649)];
 const change=insights(rows).find(i=>i.kind==='subscription-change')!;assert.equal(change.amount,rs(649));assert.equal(change.comparison?.difference,rs(150));assert.equal(change.transactions.length,1);
 for(const bad of [[rows[0]!,rows[2]!],[rows[0]!,subscription('2026-09-05',499,'bank'),rows[2]!],[rows[0]!,subscription('2026-09-05',399),rows[2]!],[rows[0]!,rows[1]!,subscription('2026-11-05',649)]])assert.equal(insights(bad).some(i=>i.kind==='subscription-change'),false);
 assert.equal(insights([...rows,income({date:'2026-10-06',isRefund:true,amount:rs(649),reversesTransactionId:rows[2]!.id})]).some(i=>i.kind==='subscription-change'),false);
 assert.equal(insights(rows.map(t=>({...t,accountId:undefined}))).some(i=>i.kind==='subscription-change'),false,'Unknown accounts cannot prove a same-account plan change');
});
test('recurring candidates reject irregular median-only patterns, future entries and adjustments',()=>{
 const now=new Date('2026-10-30T08:00:00Z');
 assert.equal(detectRecurringCandidates([subscription('2026-07-01',499),subscription('2026-07-02',499),subscription('2026-08-01',499),subscription('2026-09-01',499)],[],now).length,0);
 assert.equal(detectRecurringCandidates([subscription('2026-09-05',499),subscription('2026-10-05',499),subscription('2026-11-05',499)],[],now).length,0);
 assert.equal(detectRecurringCandidates(['2026-08-05','2026-09-05','2026-10-05'].map(date=>({...subscription(date,499),categoryId:'adjustment'})),[],now).length,0);
 const separate=[subscription('2026-08-05',499),subscription('2026-09-05',499,'bank'),subscription('2026-10-05',499)];assert.equal(detectRecurringCandidates(separate,[],now).length,0);
 const valid=['2026-08-05','2026-09-05','2026-10-05'].map(date=>subscription(date,499));assert.equal(detectRecurringCandidates(valid,[],now).length,1);
 assert.equal(detectRecurringCandidates(valid,[makeRecurring({merchant:'Netflix',accountId:'bank'})],now).length,1,'A different account plan must not suppress this candidate');
});
test('FD principal returned never hides SIP contributions or inflates the savings factor',()=>{
 const rows=[income({amount:rs(100000),date:'2026-10-01'}),expense({type:'INVESTMENT',amount:rs(30000),date:'2026-10-26'}),expense({amount:rs(50000),date:'2026-10-27'})];
 const principal=transfer({amount:rs(50000),investmentId:'fd',accountId:'investment',toAccountId:'bank',date:'2026-10-29'});
 const out=insights([...rows,principal]).find(i=>i.kind==='investment-rate')!;assert.equal(out.amount,rs(30000));assert.equal(out.transactions.length,1);assert.match(out.body,/principal was returned/);
 const score=(transactions:typeof rows)=>calculateFinancialScore({...base,transactions,creditCards:[],incomeBasis:rs(100000),consistency:60,netWorthNow:rs(100000),netWorthAtCycleStart:rs(100000)});
 const factors=(transactions:typeof rows)=>score(transactions).factors.filter(f=>['investment','savings'].includes(f.id));
 assert.deepEqual(factors(rows),factors([...rows,principal]));
});
