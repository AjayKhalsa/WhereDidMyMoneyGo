import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionPaymentCandidates, assertSubscriptionPayment } from '@/lib/engine/subscription-payments';
import { createEmptyDatabase } from '@/lib/data/seed';
import { MemoryRepository } from '@/lib/data/local-adapter';
import { accountBalance, monthTotals } from '@/lib/engine/analytics';
import { subscriptionOverview } from '@/lib/engine/subscription-overview';
import { expense, makeAccount, makeRecurring, rs, at } from '../helpers/factories';

test('generic billing candidates require confirmation and never claim a different account, price, month or service link',()=>{
 const rule=makeRecurring({accountId:'bank',amount:rs(1999),categoryId:'bills.subscription'});
 const match=expense({accountId:'bank',amount:rule.amount,date:at('2026-11-24'),description:'APPLE MEDIA SERVICES',categoryId:'bills.subscription'});
 const rows=[match,{...match,id:'another-bank',accountId:'other'},{...match,id:'another-price',amount:rs(195)},{...match,id:'last-month',date:at('2026-10-24')},{...match,id:'future',date:at('2026-11-30')},{...match,id:'another-service',recurringId:'different'},{...match,id:'same-price-meal',categoryId:'dining'}];
 assert.deepEqual(subscriptionPaymentCandidates(rule,rows,new Date(2026,10,26)),[match]);
 assert.equal(subscriptionPaymentCandidates({...rule,type:'INVESTMENT'},rows,new Date(2026,10,26)).length,0);
 assert.equal(subscriptionPaymentCandidates({...rule,frequency:'WEEKLY'},[{...match,date:at('2026-11-10')}],new Date(2026,10,26)).length,0);
});

test('linking retains bank amount/date/reference and one expense, while Apple services are reported separately',async()=>{
 const db=createEmptyDatabase(),bank=makeAccount({openingBalance:rs(5000)});db.accounts=[bank];
 const chat=makeRecurring({id:'chat',description:'ChatGPT',merchant:undefined,categoryId:'bills.subscription',amount:rs(1999),accountId:bank.id});
 const youtube=makeRecurring({id:'video',description:'YouTube',merchant:undefined,categoryId:'bills.subscription',amount:rs(195),accountId:bank.id});db.recurring=[chat,youtube];
 const payment=expense({id:'debit1',amount:chat.amount,accountId:bank.id,description:'APPLE MEDIA SERVICES',merchant:'APPLE MEDIA SERVICES',date:at('2026-11-24'),categoryId:'bills.subscription',notes:'bank reference 123456789012',source:'imported'});
 const second={...payment,id:'debit2',amount:youtube.amount,date:at('2026-11-25')};db.transactions=[payment,second];
 const before=monthTotals(db.transactions,'2026-11-01'),cash=accountBalance(bank,db.transactions);
 const repo=new MemoryRepository();await repo.replaceAll(db);
 await repo.linkSubscriptionPayment({transactionId:payment.id,ruleId:chat.id,amount:payment.amount,accountId:bank.id});
 await repo.linkSubscriptionPayment({transactionId:second.id,ruleId:youtube.id,amount:second.amount,accountId:bank.id});
 const result=(await repo.load())!;assert.equal(result.transactions.length,2);assert.equal(accountBalance(bank,result.transactions),cash);assert.deepEqual(monthTotals(result.transactions,'2026-11-01'),before);
 const linked=result.transactions[0]!;assert.equal(linked.amount,payment.amount);assert.equal(linked.date,payment.date);assert.equal(linked.notes,payment.notes);assert.equal(linked.merchant,payment.merchant);assert.equal(linked.recurringId,chat.id);
 const overview=subscriptionOverview({transactions:result.transactions,rules:result.recurring,categories:result.categories,month:'2026-11-01',cycleStartDay:1,now:new Date(2026,10,26)});
 assert.deepEqual(overview.services.map(s=>s.label).sort(),['ChatGPT','YouTube Premium']);
 await assert.rejects(repo.linkSubscriptionPayment({transactionId:payment.id,ruleId:youtube.id,amount:payment.amount,accountId:bank.id}),/changed/);
 assert.throws(()=>assertSubscriptionPayment(payment,chat,{amount:1,accountId:bank.id}),/changed/);
 await repo.linkSubscriptionPayment({transactionId:payment.id,ruleId:youtube.id,amount:payment.amount,accountId:bank.id,recurringId:chat.id});
 assert.equal((await repo.load())!.transactions[0]!.recurringId,youtube.id);
 assert.equal(accountBalance(bank,(await repo.load())!.transactions),cash);
 await assert.rejects(repo.linkSubscriptionPayment({transactionId:payment.id,ruleId:chat.id,amount:payment.amount,accountId:bank.id,recurringId:chat.id}),/changed/);
});

test('record-payment action refuses duplicate debits and linking publishes a single unchanged bank charge',async()=>{
 const {setRepository}=await import('@/lib/data/local-adapter');
 const {refreshDatabase,getSnapshot}=await import('@/lib/data/store');
 const {markRecurringPaid,linkSubscriptionPayment}=await import('@/lib/data/actions');
 const repo=new MemoryRepository(),db=createEmptyDatabase(),bank=makeAccount();
 const rule=makeRecurring({id:'action-service',accountId:bank.id,amount:rs(195),categoryId:'bills.subscription'});
 const payment=expense({id:'action-bank-charge',accountId:bank.id,amount:rule.amount,description:'APPLE MEDIA SERVICES',date:at('2026-11-25'),categoryId:'bills.subscription'});
 db.accounts=[bank];db.recurring=[rule];db.transactions=[payment];await repo.replaceAll(db);setRepository(repo);await refreshDatabase();
 await assert.rejects(markRecurringPaid(rule,new Date(2026,10,26)),/already recorded/);
 assert.equal((await repo.load())!.transactions.length,1);
 await linkSubscriptionPayment(payment.id,rule.id);
 assert.equal(getSnapshot().data!.transactions[0]!.recurringId,rule.id);
 assert.equal(getSnapshot().data!.transactions[0]!.amount,payment.amount);
 await assert.rejects(markRecurringPaid(rule,new Date(2026,10,26)),/already recorded/);
 await markRecurringPaid(rule,new Date(2026,10,26),{allowSeparate:true});
 assert.equal((await repo.load())!.transactions.length,2,'Only an explicit additional-payment confirmation can create another charge');
});

test('subscription-name search returns the original bank row without changing its description',async()=>{
 const {filterTransactions}=await import('@/lib/engine/search');
 const payment=expense({id:'apple-search',description:'APPLE MEDIA SERVICES',categoryId:'bills.subscription'});
 assert.deepEqual(filterTransactions([payment],{text:'chatgpt'},new Map([[payment.id,'ChatGPT']])),[payment]);
 assert.equal(payment.description,'APPLE MEDIA SERVICES');
 assert.equal(filterTransactions([payment],{text:'youtube'},new Map([[payment.id,'ChatGPT']])).length,0);
});

test('a bank debit imported after the screen loaded blocks a stale Mark paid action',async()=>{
 const {setRepository}=await import('@/lib/data/local-adapter');
 const {refreshDatabase,getSnapshot}=await import('@/lib/data/store');
 const {markRecurringPaid}=await import('@/lib/data/actions');
 const db=createEmptyDatabase(),bank=makeAccount(),rule=makeRecurring({id:'late-alert-rule',accountId:bank.id,amount:rs(195),categoryId:'bills.subscription'});
 db.accounts=[bank];db.recurring=[rule];const repo=new MemoryRepository();await repo.replaceAll(db);setRepository(repo);await refreshDatabase();
 const payment=expense({id:'late-bank-alert',accountId:bank.id,amount:rule.amount,date:at('2026-11-25'),description:'APPLE MEDIA SERVICES',categoryId:'bills.subscription'});
 await repo.put('transactions',payment);
 await assert.rejects(markRecurringPaid(rule,new Date(2026,10,26)),/already recorded/);
 assert.equal((await repo.load())!.transactions.length,1);
 assert.ok(getSnapshot().data!.transactions.some(t=>t.id===payment.id));
});


test('billing matches use the Indian calendar at a UTC month boundary',()=>{
 const rule=makeRecurring({accountId:'bank',amount:rs(195),categoryId:'bills.subscription'});
 const december=expense({accountId:'bank',amount:rule.amount,description:'APPLE MEDIA SERVICES',date:at('2026-12-01'),categoryId:'bills.subscription'});
 const november={...december,id:'prior-month',date:at('2026-11-30')};
 assert.deepEqual(subscriptionPaymentCandidates(rule,[november,december],new Date('2026-11-30T19:00:00Z')),[december]);
});
