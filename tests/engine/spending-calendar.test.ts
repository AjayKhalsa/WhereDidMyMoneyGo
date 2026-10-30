import test from 'node:test';
import assert from 'node:assert/strict';
import {spendingCalendar} from '@/lib/engine/spending-calendar';
import {expense,income,transfer,makeAccount,makeCard,rs} from '../helpers/factories';

const options={accounts:[makeAccount({id:'bank'}),makeCard({id:'card',isActive:false})],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-10-30T18:00:00Z')};
const run=(transactions:ReturnType<typeof expense>[],over={})=>spendingCalendar({...options,transactions,...over});

test('daily net and source sums reconcile, repeated equal purchases survive, and non-spending never appears',()=>{
 const rows=[expense({id:'one',date:'2026-10-26',amount:rs(1000),accountId:'card'}),expense({id:'two',date:'2026-10-26',amount:rs(1000),accountId:'card'}),expense({date:'2026-10-26',amount:rs(400),accountId:'bank'}),income({date:'2026-10-26',amount:rs(200),isRefund:true,accountId:'card'}),income({date:'2026-10-26',amount:rs(150000),categoryId:'gifts'}),transfer({date:'2026-10-26',amount:rs(10000)}),expense({type:'INVESTMENT',date:'2026-10-26',amount:rs(10000)}),expense({categoryId:'adjustment',date:'2026-10-26',amount:rs(50000)})];
 const before=structuredClone(rows),report=run(rows),day=report.days.find(d=>d.date==='2026-10-26')!;
 assert.equal(report.summary.spending,rs(2200));assert.equal(day.count,3);assert.equal(day.rows.length,4);
 assert.equal(day.sources.find(s=>s.source==='card')!.net,rs(1800));assert.equal(day.sources.find(s=>s.source==='bank')!.net,rs(400));
 assert.equal(report.days.reduce((sum,d)=>sum+d.spending,0),report.summary.spending);
 assert.equal(day.sources.reduce((sum,s)=>sum+s.net,0),day.spending);assert.equal(report.recordedDays,1);
 assert.deepEqual(rows,before);
});

test('refunds post on their own dates and accounts, including earlier purchases and net-negative days',()=>{
 const rows=[expense({id:'old',date:'2026-09-25',amount:rs(500),accountId:'card',categoryId:'shopping'}),income({date:'2026-10-27',amount:rs(500),accountId:'bank',categoryId:'adjustment',isRefund:true,reversesTransactionId:'old'}),income({date:'2026-10-28',amount:rs(100),isRefund:true,accountId:undefined})];
 const report=run(rows);assert.equal(report.summary.spending,-rs(600));assert.equal(report.highest,null);
 assert.equal(report.days.find(d=>d.date==='2026-10-27')!.sources[0]!.source,'bank');
 assert.equal(report.days.find(d=>d.date==='2026-10-28')!.sources[0]!.source,'unknown');assert.equal(report.maxPositive,0);
 assert.equal(report.rows.length,2);
});

test('India boundaries exclude future days and proven future clocks, while unknown clocks remain date facts',()=>{
 const report=run([expense({id:'unknown',date:'2026-10-31T23:59:00',amount:rs(20)}),expense({id:'later',date:'2026-10-31T23:59:00',amount:rs(90000),timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'}}),expense({date:'2026-11-01',amount:rs(99999)})],{now:new Date('2026-10-30T20:00:00Z')});
 assert.equal(report.summary.spending,rs(20));assert.equal(report.rows[0]!.id,'unknown');
 assert.equal(report.days.find(d=>d.today)!.date,'2026-10-31');assert.equal(report.days.find(d=>d.date==='2026-11-01')!.future,true);
});

test('clamped pay cycles, leap days, weekdays and future empty cycles retain every date exactly once',()=>{
 const report=run([],{month:'2028-02-29',cycleStartDay:31,now:new Date('2028-04-01T12:00:00Z')});
 assert.equal(report.days.length,31);assert.equal(report.from,'2028-02-29');assert.equal(report.to,'2028-03-30');assert.equal(report.days[0]!.weekday,2);
 assert.equal(new Set(report.days.map(d=>d.date)).size,31);assert.equal(report.days.some(d=>d.future),false);
 const future=run([expense({date:'2026-12-01',amount:rs(90000)})],{month:'2026-11-24'});
 assert.equal(future.days.length,30);assert.equal(future.days.every(d=>d.future&&d.rows.length===0),true);assert.equal(future.summary.spending,0);
});

test('zero net activity remains visible and highest day uses net consumption rather than gross purchases',()=>{
 const report=run([expense({date:'2026-10-25',amount:rs(1000)}),income({date:'2026-10-25',amount:rs(1000),isRefund:true}),expense({date:'2026-10-26',amount:rs(200)}),expense({date:'2026-10-27',amount:rs(3000)}),income({date:'2026-10-27',amount:rs(2900),isRefund:true})]);
 assert.equal(report.recordedDays,3);assert.equal(report.days.find(d=>d.date==='2026-10-25')!.rows.length,2);
 assert.equal(report.highest!.date,'2026-10-26');assert.equal(report.highest!.spending,rs(200));
});
