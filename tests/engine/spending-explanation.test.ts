import test from 'node:test';
import assert from 'node:assert/strict';
import {spendingDrivers} from '@/lib/engine/spending-drivers';
import {explainSpending} from '@/lib/engine/spending-explanation';
import {buildCategorySeed} from '@/lib/domain/categories';
import {expense,income,transfer,rs} from '../helpers/factories';
const report=(rows:ReturnType<typeof expense>[])=>spendingDrivers({transactions:rows,categories:buildCategorySeed(),accounts:[],month:'2026-10-24',cycleStartDay:24,now:new Date('2026-11-08T12:00:00Z')});
const purchases=(amounts:number[],previous=false)=>amounts.map((amount,i)=>expense({id:`${previous?'previous':'current'}-${i}`,date:previous?'2026-09-26':'2026-10-26',amount:rs(amount)}));
test('same ticket size attributes extra spending to purchase count',()=>{
 const a=explainSpending(report([...purchases([100,100],true),...purchases([100,100,100])]));
 assert.equal(a.effects.find(e=>e.id==='frequency')?.amount,rs(100));assert.equal(a.effects.find(e=>e.id==='ticket')?.amount,0);assert.equal(a.dominant?.id,'frequency');
});
test('same count attributes gross change to average size, refunds stay separate',()=>{
 const r=report([...purchases([100,100],true),...purchases([200,200]),income({date:'2026-10-27',amount:rs(250),isRefund:true})]);
 const a=explainSpending(r);assert.equal(a.effects.find(e=>e.id==='ticket')?.amount,rs(200));assert.equal(a.effects.find(e=>e.id==='refunds')?.amount,-rs(250));assert.equal(a.dominant?.id,'refunds');assert.equal(a.effects.reduce((n,e)=>n+e.amount,0),-rs(50));
});
test('mixed count, size and refund effects reconcile to the paise, including zero and opposing effects',()=>{
 for(const [before,after] of [[[100.01,19.99,40.03],[17.05,200.03]],[[10,10],[20]],[[100],[50,50]],[[10],[2,3,4,5]]] as [number[],number[]][]){
  const r=report([...purchases(before,true),...purchases(after),income({date:'2026-09-27',amount:137,isRefund:true}),income({date:'2026-10-27',amount:39,isRefund:true})]);
  const a=explainSpending(r);assert.equal(a.effects.reduce((n,e)=>n+e.amount,0),r.difference);assert.ok(a.effects.every(e=>Number.isInteger(e.amount)));
  if(a.dominant)assert.equal(Math.sign(a.dominant.amount),Math.sign(r.difference));
 }
});
test('absent history and refund-only periods do not invent frequency or average comparisons',()=>{
 const a=explainSpending(report(purchases([100,200])));assert.equal(a.effects.length,0);assert.equal(a.previousAverage,null);assert.equal(a.canSeparate,false);
 const r=report([...purchases([100],true),income({date:'2026-10-27',amount:rs(200),isRefund:true})]);const b=explainSpending(r);assert.equal(b.currentAverage,null);assert.equal(b.canSeparate,false);assert.equal(b.effects.reduce((n,e)=>n+e.amount,0),-rs(300));
});
test('largest purchase concentration excludes credits, investments and repayments and preserves the ledger',()=>{
 const rows=[...purchases([100,200,300,400]),income({date:'2026-10-27',amount:rs(500),isRefund:true}),income({date:'2026-10-27',amount:rs(10000)}),transfer({date:'2026-10-27',amount:rs(20000)}),expense({type:'INVESTMENT',date:'2026-10-27',amount:rs(30000)})];
 const before=structuredClone(rows),a=explainSpending(report(rows));assert.equal(a.purchaseCount,4);assert.equal(a.largestAmount,rs(900));assert.equal(a.largestShare,90);assert.equal(a.largest.length,3);assert.deepEqual(rows,before);
});
