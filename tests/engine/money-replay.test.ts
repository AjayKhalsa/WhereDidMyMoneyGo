import test from 'node:test';
import assert from 'node:assert/strict';
import {moneyReplay} from '@/lib/engine/money-replay';
import {spendingSummary} from '@/lib/engine/spending';
import {buildCategorySeed} from '@/lib/domain/categories';
import {expense,income,transfer,makeAccount,makeCard,rs} from '../helpers/factories';
const input={categories:buildCategorySeed(),accounts:[makeAccount({id:'bank'}),makeCard({id:'card',isActive:false})],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-10-30T18:00:00Z')};
const run=(transactions:ReturnType<typeof expense>[],over={})=>moneyReplay({...input,transactions,...over});

test('stories describe exact recorded spending, repeated merchants and small purchases with reconciling evidence',()=>{
 const rows=[expense({id:'previous',date:'2026-09-25',amount:rs(500),merchant:'Zomato',categoryId:'dining.delivery',accountId:'card'}),expense({id:'order',date:'2026-10-25',amount:rs(1000),merchant:'ZOMATO LTD',categoryId:'dining.delivery',accountId:'card'}),expense({date:'2026-10-26',amount:rs(600),merchant:'Zomato',categoryId:'dining.delivery',accountId:'card'}),income({date:'2026-10-27',amount:rs(200),isRefund:true,reversesTransactionId:'order',accountId:'card'}),...[1,2,3].map(i=>expense({id:`tea-${i}`,date:'2026-10-28',amount:rs(100),merchant:'Tea Post',categoryId:'dining.tea',accountId:'bank'})),income({date:'2026-10-29',amount:rs(150000)}),transfer({date:'2026-10-29',amount:rs(64000),accountId:'bank',toAccountId:'card'}),expense({date:'2026-10-29',type:'INVESTMENT',amount:rs(30000)}),expense({date:'2026-10-29',categoryId:'adjustment',amount:rs(999999)})];
 const before=structuredClone(rows),stories=run(rows);
 assert.equal(stories[0]!.amount,rs(1700));assert.equal(stories.find(s=>s.id==='regular')!.title,'Tea Post');assert.equal(stories.find(s=>s.id==='regular')!.rows.length,3);
 assert.equal(stories.find(s=>s.id==='small')!.amount,rs(300));assert.equal(stories.find(s=>s.id==='source')!.amount,rs(1400));assert.equal(stories.find(s=>s.id==='change')!.amount,rs(1200));
 for(const story of stories){
  const expected=story.basis==='net'?spendingSummary(story.rows,rows).spending:story.basis==='gross'?story.rows.reduce((n,t)=>n+t.amount,0):story.basis==='refunds'?story.rows.reduce((n,t)=>n+t.amount,0):spendingSummary(story.currentRows!,rows).spending-spendingSummary(story.previousRows!,rows).spending;
  assert.equal(story.amount,expected,story.id);assert.equal(new Set(story.rows.map(t=>t.id)).size,story.rows.length);
  assert.equal(story.rows.every(t=>t.type==='EXPENSE'||t.type==='INCOME'&&t.isRefund),true);
 }
 assert.deepEqual(rows,before);
});

test('refund-only chapters preserve returned dates, prior merchant attribution and negative spending without inventing a purchase day',()=>{
 const old=expense({id:'old',date:'2026-09-25',amount:rs(500),merchant:'Tea Post',categoryId:'dining.tea'}),returned=income({date:'2026-10-26',amount:rs(500),isRefund:true,reversesTransactionId:'old',accountId:'bank'});
 const stories=run([old,returned]);assert.equal(stories[0]!.amount,-rs(500));assert.equal(stories.find(s=>s.id==='refund')!.amount,rs(500));assert.equal(stories.some(s=>['day','category','small','regular','source'].includes(s.id)),false);
 assert.deepEqual(stories[0]!.rows.map(t=>t.id),[returned.id]);
});

test('full-cycle category chapter is not truncated to the shorter equal-day comparison',()=>{
 const rows=[expense({date:'2026-03-30',amount:rs(300),categoryId:'dining'}),expense({date:'2026-02-28',amount:rs(50),categoryId:'dining'})];
 const stories=run(rows,{month:'2026-03-01',cycleStartDay:1,now:new Date('2026-04-10T12:00:00Z')});assert.equal(stories.find(s=>s.id==='category')!.amount,rs(300));assert.equal(stories.find(s=>s.id==='change')!.amount,-rs(50));assert.equal(stories.find(s=>s.id==='change')!.currentRows!.length,0);
});

test('future dates, verified future clocks and future cycles do not become stories; unknown clocks remain day facts in India',()=>{
 const rows=[expense({date:'2026-10-31T23:59:00',timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'},amount:rs(90000)}),expense({date:'2026-10-31',amount:rs(50)}),expense({date:'2026-11-01',amount:rs(99999)})];
 assert.equal(run(rows,{now:new Date('2026-10-30T20:00:00Z')})[0]!.amount,rs(50));assert.equal(run(rows,{month:'2026-11-24'}).length,0);
});

test('unknown merchant digits remain distinct, absent merchants are not invented and the small-purchase cutoff is strict',()=>{
 const rows=[...['Shop 1','Shop 2'].flatMap(merchant=>[expense({date:'2026-10-25',merchant,amount:rs(150)}),expense({date:'2026-10-25',merchant,amount:rs(150)})]),expense({date:'2026-10-26',merchant:undefined,description:'Tea Post',amount:rs(20)})];
 const stories=run(rows);assert.equal(stories.find(s=>s.id==='regular')!.title,'Shop 1');assert.equal(stories.find(s=>s.id==='regular')!.rows.length,2);assert.equal(stories.some(s=>s.id==='small'),false);
 assert.equal(run([expense({date:'2026-10-25',merchant:undefined,description:'Tea Post'}),expense({date:'2026-10-26',merchant:undefined,description:'Tea Post'})]).some(s=>s.id==='regular'),false);
});
