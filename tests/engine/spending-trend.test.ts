import assert from 'node:assert/strict';
import test from 'node:test';
import { spendingTrend } from '@/lib/engine/spending-trend';
import { spendingReport } from '@/lib/engine/spending-report';
import { buildCategorySeed } from '@/lib/domain/categories';
import { CATEGORY_ADDITIONS } from '@/lib/domain/category-additions';
import { expense } from '../helpers/factories';

test('pending subcategories are unique, parented and do not change the active seed',()=>{
 const rows=buildCategorySeed();assert.equal(new Set(rows.map(c=>c.id)).size,rows.length);
 for(const c of CATEGORY_ADDITIONS) assert.ok(rows.some(p=>p.id===c.parentId&&p.parentId===null));
 for(const id of ['dining','dining.dinner','bills.subscription','transport.auto']) assert.ok(rows.some(c=>c.id===id));
 assert.equal(CATEGORY_ADDITIONS.length,12);
 assert.ok(CATEGORY_ADDITIONS.every(c=>!rows.some(r=>r.id===c.id)));
 assert.equal(new Set(CATEGORY_ADDITIONS.map(c=>c.id)).size,12);
});
test('cumulative trend agrees with report including same-day repeats, refund and personal credit',()=>{
 const rows=[expense({id:'buy',amount:10000,date:'2026-10-01T12:00:00',categoryId:'dining'}),expense({amount:10000,date:'2026-10-01T13:00:00',categoryId:'dining'}),expense({type:'INCOME',amount:5000,date:'2026-10-02T12:00:00',categoryId:undefined,isRefund:true,reversesTransactionId:'buy'}),expense({type:'INCOME',amount:20000,date:'2026-10-03T12:00:00',categoryId:'dining'}),expense({type:'INVESTMENT',amount:1000000,date:'2026-10-03T12:00:00'}),expense({type:'TRANSFER',amount:1000000,date:'2026-10-03T12:00:00'})];
 const before=JSON.stringify(rows);
 const report=spendingReport(rows,buildCategorySeed(),{month:'2026-10-01',now:new Date(2026,9,4),cycleStartDay:1,dimension:'category',groupId:'dining',includeCredits:true});
 const trend=spendingTrend(report.current.transactions,rows,'2026-10-01',1,report.comparableDays);
 assert.deepEqual(trend.map(d=>d.cumulative),[20000,15000,-5000,-5000]);
 assert.equal(trend.at(-1)?.cumulative,report.current.net);assert.equal(trend[0]?.transactions.length,2);
 assert.equal(trend[1]?.returned,5000);assert.equal(JSON.stringify(rows),before);
});
test('cycle dates cross months and shorter periods do not gain fabricated days',()=>{
 const days=spendingTrend([],[],'2026-09-24',24,8);
 assert.equal(days[0]?.date,'2026-09-24');assert.equal(days.at(-1)?.date,'2026-10-01');
 assert.equal(spendingTrend([],[],'2026-02-01',1,31).length,28);
 assert.equal(spendingTrend([],[],'2026-10-01',1,null).length,31);
});
