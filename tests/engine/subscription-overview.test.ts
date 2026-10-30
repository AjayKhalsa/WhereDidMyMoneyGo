import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionOverview} from '@/lib/engine/subscription-overview';
import {buildCategorySeed} from '@/lib/domain/categories';
import {detectRecurringCandidates} from '@/lib/engine/recurring-detection';
import {anniversaryMonth} from '@/lib/engine/recurring-occurrences';
import {expense,income,makeRecurring,rs,transfer} from '../helpers/factories';
const now=new Date('2026-10-30T10:00:00Z');
const charge=(date:string,amount=199,accountId:string|undefined='card',merchant='Spotify')=>expense({date,amount:rs(amount),categoryId:'bills.subscription',merchant,accountId});
const rule=(over={})=>makeRecurring({id:'spotify',merchant:'Spotify',description:'Spotify',categoryId:'bills.subscription',accountId:'card',amount:rs(199),dayOfPeriod:30,...over});
const run=(transactions:ReturnType<typeof expense>[],rules:ReturnType<typeof makeRecurring>[]=[] ,over={})=>subscriptionOverview({transactions,rules,categories:buildCategorySeed(),month:'2026-10-01',cycleStartDay:1,now,...over});

test('actual subscription payments are net of refunds and independent of schedules, salary, repayments and SIPs',()=>{
 const payment=charge('2026-10-29',199);
 const rows=[payment,income({date:'2026-10-30',amount:rs(49),isRefund:true,reversesTransactionId:payment.id,accountId:'card'}),income({date:'2026-10-29',amount:rs(60000)}),transfer({date:'2026-10-29',amount:rs(9000)}),expense({date:'2026-10-29',type:'INVESTMENT',categoryId:'bills.subscription',amount:rs(30000)})];
 const before=structuredClone(rows),out=run(rows,[rule()]);
 assert.equal(out.actual.spending,rs(150));assert.equal(out.services[0]!.count,1);
 assert.equal(out.services.reduce((sum,service)=>sum+service.net,0),out.actual.spending);
 assert.deepEqual(rows,before);assert.equal(out.monthly,rs(199));
});

test('uniquely recognised payments leave expected total; overlaps remain separate review estimates without deleting schedules',()=>{
 const payment=charge('2026-10-30'),youtube=rule({id:'yt-a',merchant:'YouTube Premium',amount:rs(195),dayOfPeriod:30}),duplicate={...youtube,id:'yt-b',dayOfPeriod:31};
 const rules=[rule(),youtube,duplicate],before=structuredClone(rules),out=run([payment],rules);
 assert.equal(out.recorded.length,1);assert.equal(out.expected,0);assert.equal(out.needsReview,rs(390));
 assert.equal(out.monthly,rs(589));assert.equal(out.overlapMonthly,rs(390));assert.equal(out.duplicateGroups.length,1);assert.equal(out.duplicateGroups[0]!.length,2);
 assert.deepEqual(rules,before);
});

test('changed-price possible payments require review instead of another expected payment',()=>{
 const out=run([charge('2026-10-30',249)],[rule()]);
 assert.equal(out.upcoming[0]!.status,'review');assert.equal(out.upcoming[0]!.possible.length,1);
 assert.equal(out.expected,0);assert.equal(out.needsReview,rs(199));
 const postedPurchase=expense({date:'2026-10-30',amount:rs(199),merchant:'Spotify',accountId:'card',categoryId:'bills.subscription'});
 const refunded=run([postedPurchase,income({date:'2026-10-30',amount:rs(20),isRefund:true,reversesTransactionId:postedPurchase.id,accountId:'card'})],[rule()]);
 assert.equal(refunded.upcoming[0]!.reviewReason,'refunded-charge');assert.equal(refunded.upcoming[0]!.refundEvidence.length,2);
 assert.equal(refunded.expected,0,'A refunded nearby charge is uncertain, not another expected payment');
});

test('charge changes need stable earlier monthly charges on the same known account and show original evidence',()=>{
 const rows=[charge('2026-08-05'),charge('2026-09-05'),charge('2026-10-05',249)];
 const out=run(rows);assert.equal(out.services[0]!.chargeChange?.difference,rs(50));assert.equal(out.services[0]!.chargeChange?.evidence.length,3);
 const stale=run(rows,[rule({dayOfPeriod:5})]);
 assert.equal(stale.upcoming[0]!.status,'review');assert.equal(stale.upcoming[0]!.reviewReason,'charge-change');
 assert.equal(stale.upcoming[0]!.possible.length,0,'Old charges are not presented as the next payment');
 assert.equal(stale.upcoming[0]!.chargeEvidence.length,3);assert.equal(stale.expected,0);
 for(const bad of [[rows[0]!,{...rows[1]!,accountId:'bank'},rows[2]!],rows.map(t=>({...t,accountId:undefined})),[rows[0]!,charge('2026-09-05',99),rows[2]!],[...rows,income({date:'2026-10-06',amount:rs(249),isRefund:true,reversesTransactionId:rows[2]!.id,accountId:'card'})]]){
  assert.ok(run(bad).services.every(service=>!service.chargeChange));
 }
 assert.ok(run(rows,[],{month:'2026-09-01'}).services.every(service=>!service.chargeChange),'Later charges cannot leak into a historical cycle');
});

test('repeat payment suggestions exclude refunds and respect paused plans, sub-brands and separate accounts',()=>{
 const rows=['2026-08-05','2026-09-05','2026-10-05'].map(date=>charge(date));
 assert.equal(run(rows).candidates.length,1);
 assert.equal(run(rows).candidates[0]!.suggestedDayOfPeriod,5);
 assert.equal(run(rows,[rule({isActive:false})]).candidates.length,0);
 assert.equal(run(rows,[rule({merchant:undefined,description:'Spotify subscription'})]).candidates.length,0,'The same service in a description field is not a missing reminder');
 assert.equal(run([...rows,income({date:'2026-10-06',amount:rs(199),isRefund:true,reversesTransactionId:rows[2]!.id})]).candidates.length,0);
 const prime=rows.map(t=>({...t,merchant:'Amazon Prime Membership'}));
 const retail=rule({merchant:'Amazon',description:'Amazon retail',categoryId:'shopping'});
 assert.equal(detectRecurringCandidates(prime,[retail],now).length,1,'An unrelated parent-brand schedule cannot suppress Prime');
 assert.equal(run(rows.map(t=>({...t,accountId:undefined}))).candidates.length,0);
});

test('weekly/yearly schedules, paused plans, custom children and India day boundaries keep their distinct meanings',()=>{
 const categories=[...buildCategorySeed(),{id:'my-subscription',name:'My service',parentId:'bills.subscription',order:1,system:false}];
 const rules=[rule({id:'weekly',amount:rs(10),frequency:'WEEKLY',dayOfPeriod:5}),rule({id:'annual',amount:rs(1200),frequency:'YEARLY',createdAt:'2026-11-01',dayOfPeriod:1}),rule({id:'paused',isActive:false}),rule({id:'sip',type:'INVESTMENT',amount:rs(10000)}),rule({id:'custom',merchant:'My service',categoryId:'my-subscription',amount:rs(50)})];
 const out=run([],rules,{categories});assert.equal(out.active.length,3);assert.equal(out.annual,rs(2320));
 assert.equal(out.upcoming.filter(slot=>slot.rule.id==='weekly').length,5);
 assert.equal(out.upcoming.find(slot=>slot.rule.id==='annual')!.date,'2026-11-01');
 const midnight=run([],[],{now:new Date('2026-10-30T20:00:00Z')});assert.equal(midnight.horizon.from,'2026-10-31');
 assert.equal(anniversaryMonth('2026-10-31T20:00:00Z'),10,'Creation timestamp is November in India');
 assert.equal(anniversaryMonth('2026-11-01'),10,'Date-only metadata retains November in every host timezone');
 const future=run([],rules,{categories,month:'2026-12-01'});
 assert.equal(future.actual.spending,0);assert.deepEqual(future.period,{from:'2026-12-01',to:'2026-12-31'});
});

test('routing banks in UPI descriptions cannot manufacture a service or clear its reminder',()=>{
 const names=['Person Alpha','Person Beta','Person Gamma'];
 const rows=['2026-08-30','2026-09-30','2026-10-30'].map((date,i)=>({...charge(date),merchant:undefined,description:`UPI/${names[i]}/person@upi/UPI/AIRTEL PAY/123456789012`}));
 assert.equal(detectRecurringCandidates(rows,[],now).length,0);
 const out=run(rows,[rule({merchant:'Airtel',description:'Airtel subscription'})]);
 assert.equal(out.recorded.length,0);assert.equal(out.expected,rs(199));
 assert.equal(out.services[0]!.label,'Person Gamma');
});
