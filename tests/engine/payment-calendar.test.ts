import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentCalendar} from '@/lib/engine/payment-calendar';
import {makeRecurring,makeIncomeSource,expense} from '../helpers/factories';
import type {CreditCardSummary} from '@/lib/engine/analytics';
test('weekly obligations repeat, inactive rules disappear and forecasts never mutate ledger',()=>{
 const now=new Date(2026,9,29,12),rules=[makeRecurring({id:'weekly',frequency:'WEEKLY',dayOfPeriod:4}),makeRecurring({isActive:false})];
 const rows=[expense({recurringId:'weekly',date:'2026-10-29T10:00:00'})],before=JSON.stringify(rows);
 const events=paymentCalendar(rules,[],[],rows,now);
 assert.equal(events.length,5);assert.equal(events[0]?.status,'recorded');assert.equal(events[1]?.status,'expected');
 assert.equal(events[0]?.transactionIds[0],rows[0]?.id);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(paymentCalendar(rules,[],[],rows,now),events);
});
test('unlinked, future and wrong-type payments cannot complete a scheduled obligation',()=>{
 const rule=makeRecurring({id:'r',dayOfPeriod:29});
 for(const payment of [expense({date:'2026-10-29T10:00:00'}),expense({recurringId:'r',date:'2026-10-30T23:00:00'}),expense({recurringId:'r',type:'TRANSFER',date:'2026-10-29T10:00:00'})])assert.equal(paymentCalendar([rule],[],[],[payment],new Date(2026,9,29,12))[0]?.status,'expected');
});
test('month-end income dates clamp; deductions reduce expected net and never imply receipt',()=>{
 const events=paymentCalendar([],[makeIncomeSource({dayOfMonth:31,amount:10000,deductions:1000})],[],[],new Date(2026,1,1));
 assert.equal(events[0]?.date,'2026-02-28');assert.equal(events[0]?.amount,9000);assert.equal(events[0]?.status,'expected');
});
test('card payment reminders use remaining statement dues and exclude settled statements',()=>{
 const card={account:{id:'c',name:'Card'},dueDate:new Date(2026,9,28),lastStatement:{spent:100000,paidAmount:40000,paidInFull:false}} as CreditCardSummary;
 const events=paymentCalendar([],[],[card],[],new Date(2026,9,29));
 assert.equal(events[0]?.amount,60000);assert.ok(events[0]?.note.includes('overdue'));assert.equal(events[0]?.kind,'card');
 assert.equal(paymentCalendar([],[],[{...card,lastStatement:{...card.lastStatement!,paidInFull:true}}],[],new Date(2026,9,29)).length,0);
});
