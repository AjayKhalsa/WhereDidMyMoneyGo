import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImportDrafts} from '@/lib/import/build-drafts';
import {creditPurposeHint,reviewCreditPurpose,reviewImportCategory} from '@/lib/import/credit-purpose';
import {assertStatementDirection} from '@/lib/import/identity';
import {income,expense,transfer,rs} from '../helpers/factories';

const draft=(narration='UPI credit from a person',debit=false)=>buildImportDrafts([{date:'2026-10-29',narration,withdrawal:debit?rs(200):0,deposit:debit?0:rs(200)}],'bank',[],[])[0]!;

test('explicit salary and bank interest can be income; unknown credits and refund hints require purpose review',()=>{
 for(const narration of ['NEFT SALARY FINICITY','NEFT SAL OCT 26 FINICITY','INT.PD:01JUL2026-30SEP2026','Interest credited']){
  const row=draft(narration);assert.equal(row.type,'INCOME');assert.equal(row.needsCreditReview,false);assert.equal(row.isRefund,undefined);
 }
 for(const narration of ['UPI from Kathakali','NEFT redemption','ACH MUTUAL FUND SIP','CREDIT CARD PAYMENT','SALON SERVICES','FD closure principal plus interest credit','NEFT LOAN SALARY FINANCE','UPI SALARY CAFE','Transfer from salary account','NEFT RETURN SALARY','NEFT RETURNED SALARY']){
  const row=draft(narration);assert.equal(row.type,'INCOME');assert.equal(row.needsCreditReview,true);assert.equal(row.isRefund,undefined);
 }
 const refund=draft('ZOMATO REFUND');assert.equal(refund.suggestedCreditPurpose,'refund');assert.equal(refund.needsCreditReview,true);assert.equal(refund.isRefund,undefined);
 assert.equal(creditPurposeHint('SALARY REFUND'),'refund');
 assert.equal(draft('Interest paid',true).type,'EXPENSE','A bank debit must never become an income credit');
});

test('refund classification and category editing preserve bank credit direction, amount, date and identity evidence',()=>{
 const row=draft('ZOMATO REFUND'),before=structuredClone(row);
 const refund=reviewCreditPurpose(row,'refund');assert.equal(refund.type,'INCOME');assert.equal(refund.isRefund,true);assert.equal(refund.categoryId?.startsWith('dining'),true);
 const edited=reviewImportCategory(refund,'shopping.clothing');assert.equal(edited.type,'INCOME');assert.equal(edited.isRefund,true);assert.equal(edited.categoryId,'shopping.clothing');
 for(const key of ['date','amount','direction','rawNarration','reference','possibleMatchIds','possibleSplitIds'] as const)assert.deepEqual(edited[key],row[key]);
 assert.deepEqual(row,before);
 assert.throws(()=>reviewImportCategory(row,'dining'),/Choose Refund/,'Categorisation cannot silently decide an ordinary credit is spending');
});

test('purpose switches clear stale transfer/refund fields and outgoing categories retain the debit',()=>{
 const refund=reviewCreditPurpose(draft(),'refund');const moved=reviewCreditPurpose({...refund,toAccountId:'old-destination',fromAccountId:'old-source'},'transfer');
 assert.equal(moved.type,'TRANSFER');assert.equal(moved.categoryId,undefined);assert.equal(moved.isRefund,undefined);assert.equal(moved.fromAccountId,undefined);assert.equal(moved.toAccountId,undefined);
 const earned=reviewCreditPurpose(moved,'income');assert.equal(earned.type,'INCOME');assert.equal(earned.needsCreditReview,false);assert.equal(earned.isRefund,undefined);
 const spent=reviewImportCategory({...draft('CRED card payment',true),toAccountId:'card'},'dining.delivery');assert.equal(spent.type,'EXPENSE');assert.equal(spent.toAccountId,undefined);
 assert.throws(()=>reviewCreditPurpose(spent,'income'),/Only a bank credit/);
});

test('both import writers reject reversed direction, invalid refunds and incomplete or self transfers before committing',()=>{
 const observation={kind:'statement' as const,key:'row1',accountId:'bank',direction:'credit' as const,date:'2026-10-29'};
 for(const transaction of [expense({accountId:'bank'}),transfer({accountId:'bank',toAccountId:'other'}),transfer({accountId:'bank',toAccountId:'bank'}),transfer({accountId:undefined,toAccountId:'bank'}),transfer({accountId:'other',toAccountId:'bank',isRefund:true})])assert.throws(()=>assertStatementDirection([{transaction,observation}]),/does not match/);
 assert.doesNotThrow(()=>assertStatementDirection([{transaction:income({accountId:'bank',isRefund:true}),observation},{transaction:transfer({accountId:'other',toAccountId:'bank'}),observation}]));
});
