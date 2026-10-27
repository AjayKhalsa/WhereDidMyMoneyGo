import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReason,isSalaryAlert,isSalaryNarration,parseAlert} from '@/lib/gmail/alerts';
import {classifiedAlert} from '@/lib/gmail/classification';
import {reviewDefaults} from '@/lib/gmail/review-defaults';

const salary='You have received a credit in your HDFC Bank account. Details of the transaction: Amount received: INR 1,20,345.67 Account: XX1234 Date: 22-OCT-2026 Reference Details: NEFT Cr-BANK0000104-SAL OCT 26 EXAMPLE EMPLOYER-EXAMPLE PERSON-INXXXXXXXXXX9876 Available Balance: INR 1,50,000.00';
const reversal='A transaction reversal of Rs. 2399.00 has been initiated to your HDFC Bank Credit Card ending 5678 From Merchant: MYNTRA DESIGNS PRIVATE Date Time: 22 Oct, 2026 at 17:00:56 Please allow up to 48 hours for the reversal to reflect in your card statement.';

test('explicit salary bank credits use the actual deposit amount and can log without a manual purpose choice',()=>{
 const a=parseAlert('alerts@hdfcbank.bank.in','New Deposit Alert',salary,Date.parse('2026-10-21T22:02:54Z'))!;
 assert.equal(a.amount,12034567);assert.equal(a.incomeKind,'salary');assert.equal(a.creditKind,'income');assert.equal(a.direction,'credit');
 assert.equal(isSalaryAlert(a),true);assert.equal(a.date,'2026-10-22');assert.equal(a.timeSource,'gmail');assert.equal(a.timeConfidence,'fallback');
 const identified=classifiedAlert({...a,accountId:'bank'},[],[{id:'other'}]);
 assert.equal(identified.classification!.needsReview,false);assert.match(identified.classification!.reason,/Salary explicitly/);
 assert.equal(automaticReason(identified,true,'2026-10-01'),null);
 assert.deepEqual(reviewDefaults(identified),{kind:'INCOME',accountId:'bank',toAccountId:''});
 assert.match(automaticReason(identified,false,'2026-10-01')!,/authentication/);
 assert.match(automaticReason({...identified,accountId:undefined},true,'2026-10-01')!,/Match this/);
 assert.match(automaticReason(identified,true,'2026-10-23')!,/predates/);
 assert.match(automaticReason({...identified,date:'2099-01-01'},true,'2026-10-01')!,/future/);
});

test('salary heuristics never turn ordinary transfers, interest, refunds, loans or merchant names into salary',()=>{
 for(const value of ['NEFT Cr-SALARY ACCOUNT TRANSFER','EXAMPLE SALARY STORE','NEFT Cr-SAL OCT EMPLOYER','SAL OCT 26 loan','SAL OCT 26 refund','SAL OCT 26 self-transfer'])assert.equal(isSalaryNarration(value),false,value);
 const interest=parseAlert('alerts@hdfcbank.bank.in','Deposit alert',salary.replace('NEFT Cr-BANK0000104-SAL OCT 26 EXAMPLE EMPLOYER-EXAMPLE PERSON-INXXXXXXXXXX9876','Int.Pd:30-06-2026 to 29-09-2026'))!;
 assert.equal(interest.creditKind,'income');assert.equal(interest.incomeKind,undefined);assert.ok(automaticReason({...interest,accountId:'bank'},true,'2026-10-01'));
 const transfer=parseAlert('alerts@hdfcbank.bank.in','Deposit alert',salary.replace('SAL OCT 26 EXAMPLE EMPLOYER','SELF TRANSFER'))!;
 assert.equal(transfer.incomeKind,undefined);assert.ok(automaticReason({...transfer,accountId:'bank'},true,'2026-10-01'));
});

test('HDFC refund initiation retains merchant, card, amount and actual bank time but cannot auto-post',()=>{
 const a=parseAlert('alerts@hdfcbank.bank.in','A refund was processed to your Credit Card from the merchant',reversal)!;
 assert.equal(a.amount,239900);assert.equal(a.tail,'5678');assert.equal(a.instrument,'credit_card');assert.equal(a.direction,'credit');
 assert.equal(a.merchant,'MYNTRA DESIGNS PRIVATE');assert.equal(a.creditKind,'refund');assert.equal(a.refundStatus,'initiated');
 assert.equal(a.refundInitiatedAt,'2026-10-22T17:00:56');assert.equal(a.occurredAt,undefined);assert.equal(a.timeSource,'unknown');
 assert.match(automaticReason({...a,accountId:'card'},true,'2026-10-01')!,/Refund initiated.*48 hours/);
 assert.deepEqual(reviewDefaults({...a,accountId:'card'}),{kind:'REFUND',accountId:'card',toAccountId:''});
});

test('only posted reversal evidence can auto-credit a card, and refund time never becomes meal-time evidence',()=>{
 const a=parseAlert('alerts@hdfcbank.bank.in','Credit card refund',reversal.replace('initiated','credited').replace(' Please allow up to 48 hours for the reversal to reflect in your card statement.',''))!;
 assert.equal(a.refundStatus,'posted');assert.equal(automaticReason({...a,accountId:'card'},true,'2026-10-01'),null);
 const ambiguous=parseAlert('alerts@hdfcbank.bank.in','Credit card refund',reversal.replace('initiated','credited'))!;
 assert.equal(ambiguous.refundStatus,'initiated','The wait-for-posting warning outranks a vague processed subject');
 const food=classifiedAlert({...a,merchant:'ZOMATO',accountId:'card'},[],[{id:'other'},{id:'dining'},{id:'dining.snacks'},{id:'dining.dinner'}]);
 assert.equal(food.categoryId,'dining','Refund time must not pick a meal subcategory');
});
