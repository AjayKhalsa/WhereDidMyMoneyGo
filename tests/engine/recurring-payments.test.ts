import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRecurringPayments,overlappingRecurringRules} from '@/lib/engine/recurring-payments';
import {recurringStatuses} from '@/lib/engine/recurring';
import {upcomingRecurring} from '@/lib/engine/safe-to-spend';
import {paymentCalendar} from '@/lib/engine/payment-calendar';
import {expense,income,makeRecurring,rs} from '../helpers/factories';
const start=new Date(2026,9,1),end=new Date(2026,9,31),now=new Date(2026,9,5,12);
const rule=makeRecurring({id:'spotify',merchant:'Spotify',description:'Spotify',accountId:'card',categoryId:'bills.subscription',dayOfPeriod:5,amount:rs(199)});
const payment=expense({id:'payment',merchant:'Spotify Limited',accountId:'card',categoryId:'bills.subscription',date:'2026-10-04',amount:rs(199)});
test('an existing exact subscription payment clears one forecast without editing the ledger',()=>{
 const rows=[payment],before=JSON.stringify(rows),slots=resolveRecurringPayments([rule],rows,start,end,now);
 assert.equal(slots[0]?.transaction?.id,'payment');assert.equal(slots[0]?.basis,'recognised');assert.equal(JSON.stringify(rows),before);assert.equal(payment.recurringId,undefined);
 assert.equal(upcomingRecurring([rule],rows,'2026-10-01',now).length,0);
 const status=recurringStatuses([rule],rows,'2026-10-01',now)[0]!;assert.equal(status.paidThisMonth,true);assert.equal(status.recognisedCount,1);assert.equal(status.lastCharge?.id,'payment');
 const event=paymentCalendar([rule],[],[],rows,now)[0]!;assert.equal(event.status,'recorded');assert.deepEqual(event.transactionIds,['payment']);assert.equal(event.amount,rs(199));
});
test('unknown accounts/categories, different charges, generic names, future rows and refunds never satisfy automatic recognition',()=>{
 const variants=[{...payment,accountId:undefined},{...payment,accountId:'other'},{...payment,amount:rs(249)},{...payment,categoryId:'other'},{...payment,type:'TRANSFER' as const},{...payment,date:'2026-10-06'},{...payment,recurringId:'another-rule'},{...payment,merchant:'Google Play'},{...payment,categoryId:'adjustment'}];
 for(const t of variants)assert.equal(resolveRecurringPayments([rule],[t],start,end,now)[0]?.transaction,undefined,JSON.stringify(t));
 assert.equal(resolveRecurringPayments([rule],[payment,income({date:'2026-10-05',amount:payment.amount,isRefund:true,reversesTransactionId:'payment'})],start,end,now)[0]?.transaction,undefined);
 const rent=makeRecurring({...rule,id:'rent',merchant:undefined,description:'Rent'});assert.equal(resolveRecurringPayments([rent],[{...payment,merchant:undefined,description:'Rent'}],start,end,now)[0]?.transaction,undefined);
 const investment={...rule,type:'INVESTMENT' as const};assert.equal(resolveRecurringPayments([investment],[{...payment,type:'INVESTMENT'}],start,end,now)[0]?.transaction,undefined);
 const changed=recurringStatuses([rule],[{...payment,amount:rs(249)}],'2026-10-01',now)[0]!;assert.equal(changed.paidThisMonth,false);assert.equal(changed.possiblePayments.length,1,'Price changes need review rather than another expense');
 const mealRule={...rule,merchant:'Swiggy',categoryId:'dining.delivery'};assert.equal(resolveRecurringPayments([mealRule],[{...payment,merchant:'Swiggy',categoryId:'dining.delivery'}],start,end,now)[0]?.transaction,undefined);
});
test('two possible payments or overlapping schedules remain unresolved, including cycle-boundary overlaps',()=>{
 const duplicate={...rule,id:'duplicate',dayOfPeriod:6};
 assert.deepEqual(overlappingRecurringRules([rule,duplicate]).get('spotify'),['duplicate']);
 assert.equal(resolveRecurringPayments([rule,duplicate],[payment],start,end,now).filter(s=>s.transaction).length,0);
 const duplicateStatus=recurringStatuses([rule,duplicate],[payment],'2026-10-01',now);assert.equal(duplicateStatus[0]?.possiblePayments.length,1);assert.equal(duplicateStatus[0]?.paidThisMonth,false);
 assert.equal(resolveRecurringPayments([rule],[payment,{...payment,id:'other'}],start,end,now)[0]?.transaction,undefined);
 assert.equal(resolveRecurringPayments([rule,{...duplicate,dayOfPeriod:4}],[payment],new Date(2026,9,5),end,now)[0]?.transaction,undefined,'A duplicate just outside the window still requires review');
 const otherAccount={...rule,id:'other-account',accountId:'bank'};assert.equal(overlappingRecurringRules([rule,otherAccount]).size,0);assert.equal(resolveRecurringPayments([rule,otherAccount],[payment],start,end,now).filter(s=>s.transaction).length,1);
 assert.equal(overlappingRecurringRules([{...rule,dayOfPeriod:31},{...duplicate,dayOfPeriod:1}]).size,2,'Month-end overlaps must also be caught across the cycle boundary');
 assert.equal(overlappingRecurringRules([rule,{...duplicate,frequency:'WEEKLY'}]).size,2,'Different cadences cannot reuse one payment');
});
test('weekly paid counts and actual dates stay consistent; a late occurrence does not clear the earliest one',()=>{
 const weekly=makeRecurring({...rule,id:'weekly',frequency:'WEEKLY',dayOfPeriod:1});
 const late=expense({...payment,id:'late',recurringId:'weekly',date:'2026-10-12'}),on=new Date(2026,9,12,12);
 const status=recurringStatuses([weekly],[late],'2026-10-01',on)[0]!;assert.equal(status.paidThisMonth,false);assert.equal(status.paidCount,1);assert.equal(status.occurrenceCount,4);
 const remaining=upcomingRecurring([weekly],[late],'2026-10-01',on);assert.deepEqual(remaining.map(s=>s.dueDate.getDate()),[19,26]);
});
test('explicit user links preserve early-payment and changed-price evidence and outrank another schedule',()=>{
 const early={...payment,recurringId:rule.id,date:'2026-10-01',amount:rs(249)};
 assert.equal(resolveRecurringPayments([rule,{...rule,id:'duplicate'}],[early],start,end,now).find(s=>s.rule.id===rule.id)?.basis,'explicit');
 assert.equal(resolveRecurringPayments([rule],[early],start,end,now)[0]?.transaction?.amount,rs(249));
});
test('a late prior-period payment cannot clear the next calendar occurrence',()=>{
 const monthly={...rule,dayOfPeriod:24};const late={...payment,recurringId:rule.id,date:'2026-10-30'};
 const events=paymentCalendar([monthly],[],[],[late],new Date(2026,9,30,12));assert.equal(events[0]?.date,'2026-11-24');assert.equal(events[0]?.status,'expected');
});
