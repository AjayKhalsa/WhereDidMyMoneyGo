import test from 'node:test';
import assert from 'node:assert/strict';
import {spendingDrivers} from '@/lib/engine/spending-drivers';
import {buildCategorySeed} from '@/lib/domain/categories';
import {expense,income,transfer,makeAccount,makeCard,rs} from '../helpers/factories';
const bank=makeAccount({id:'bank'}),card=makeCard({id:'card',isActive:false});
const options={categories:buildCategorySeed(),accounts:[bank,card],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-10-30T18:00:00Z')};
const run=(transactions:ReturnType<typeof expense>[],over={})=>spendingDrivers({...options,transactions,...over});

test('spending, source and merchant totals reconcile after refunds without salary, SIPs or repayments',()=>{
 const purchase=expense({id:'order',date:'2026-10-26',amount:rs(1000),merchant:'ZOMATO LTD',accountId:'card',categoryId:'dining.delivery'});
 const rows=[purchase,expense({date:'2026-10-27',amount:rs(400),merchant:'Tea Post',accountId:'bank',categoryId:'dining.tea'}),income({date:'2026-10-28',amount:rs(200),isRefund:true,reversesTransactionId:'order',accountId:'card'}),income({date:'2026-10-28',amount:rs(9000),categoryId:'gifts'}),transfer({date:'2026-10-28',amount:rs(30000),accountId:'bank',toAccountId:'card'}),expense({date:'2026-10-28',amount:rs(30000),type:'INVESTMENT'}),expense({date:'2026-10-28',amount:rs(90000),categoryId:'adjustment'})];
 const before=structuredClone(rows),report=run(rows);
 assert.equal(report.current.spending,rs(1200));assert.equal(report.currentRows.length,3);
 assert.equal(report.sources.reduce((n,s)=>n+s.net,0),report.current.spending);
 assert.equal(report.merchants.reduce((n,m)=>n+m.net,0),report.current.spending);
 assert.equal(report.sources.find(s=>s.source==='card')!.net,rs(800),'Archived card type is retained');
 assert.equal(report.merchants.find(m=>m.label==='Zomato')!.count,1);assert.deepEqual(rows,before);
});

test('equal cycle days exclude later previous-cycle purchases and category changes sum to the delta',()=>{
 const rows=[expense({date:'2026-10-25',amount:rs(700),categoryId:'dining'}),expense({date:'2026-09-25',amount:rs(100),categoryId:'shopping'}),expense({date:'2026-10-10',amount:rs(9999),categoryId:'shopping'})];
 const report=run(rows);assert.equal(report.days,7);assert.equal(report.previousRange.to,'2026-09-30');
 assert.equal(report.previous.spending,rs(100));assert.equal(report.difference,rs(600));
 assert.equal(report.drivers.reduce((n,d)=>n+d.difference,0),report.difference);
 assert.equal(report.drivers.find(d=>d.id==='shopping')!.difference,-rs(100),'Previous-only categories explain reductions');
});

test('unequal cycle lengths compare equal prefixes while full current-cycle merchant/source totals stay complete',()=>{
 const rows=[expense({date:'2026-03-30',amount:rs(100)}),expense({date:'2026-03-31',amount:rs(200)}),expense({date:'2026-02-28',amount:rs(50)})];
 const report=run(rows,{month:'2026-03-01',cycleStartDay:1,now:new Date('2026-04-10T12:00:00Z')});
 assert.equal(report.days,28);assert.equal(report.current.spending,rs(300));assert.equal(report.compared.spending,0);assert.equal(report.previous.spending,rs(50));
 assert.equal(report.comparisonRange.to,'2026-03-28');assert.equal(report.currentRange.to,'2026-03-31');
});

test('refunds stay on the returned date, inherit the merchant/category, and can make a period negative',()=>{
 const old=expense({id:'old',date:'2026-09-27',amount:rs(500),merchant:'Zomato',categoryId:'dining.delivery',accountId:'card'});
 const credit=income({date:'2026-10-27',amount:rs(600),isRefund:true,reversesTransactionId:'old',accountId:'bank'});
 const report=run([old,credit]);assert.equal(report.current.spending,-rs(600));assert.equal(report.merchants[0]!.label,'Zomato');assert.equal(report.merchants[0]!.count,0);
 assert.equal(report.drivers[0]!.current,-rs(600));assert.equal(report.sources[0]!.source,'bank');assert.equal(report.percent,null);
});

test('future entries, future exact times, absent history and missing merchants/accounts are handled explicitly',()=>{
 const rows=[expense({date:'2026-10-31',amount:rs(90000)}),expense({date:'2026-10-30T23:59:00',timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'},amount:rs(80000)}),expense({date:'2026-10-25',amount:rs(10),merchant:undefined,accountId:undefined,description:'Do not infer a merchant'})];
 const report=run(rows);assert.equal(report.current.spending,rs(10));assert.equal(report.hasComparison,false);assert.equal(report.percent,null);
 assert.equal(report.merchants[0]!.label,'Merchant not recorded');assert.equal(report.sources[0]!.source,'unknown');
 assert.equal(run(rows,{month:'2026-11-24'}).currentRows.length,0);
});

test('India day boundaries, clamped pay cycles and separate unknown merchant digits remain stable',()=>{
 const rows=[expense({date:'2026-10-31',merchant:'Shop 1'}),expense({date:'2026-10-31',merchant:'Shop 2'})];
 const report=run(rows,{month:'2026-10-31',cycleStartDay:31,now:new Date('2026-10-30T20:00:00Z')});
 assert.equal(report.elapsed,1);assert.equal(report.days,1);assert.equal(report.previousRange.from,'2026-09-30');assert.equal(report.merchants.length,2);
});
