import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAlert,automaticReason} from '@/lib/gmail/alerts';
import {nonPaymentNotice} from '@/lib/gmail/bank-notices';
test('Axis sentence credit captures money and actual clock despite repeated header date',()=>{
 const a=parseAlert('alerts@axis.bank.in','Credit transaction alert for Axis Bank A/c','29-10-2026 Dear Customer Your A/c no. XX3801 has been credited with INR 50648.00 on 29-10-2026 at 12:54:00 IST by MBB-TD/EXAMPLE/03-. To check your available balance, click here.');
 assert.equal(a?.amount,5064800);assert.equal(a?.direction,'credit');assert.equal(a?.tail,'3801');assert.equal(a?.instrument,'bank');assert.equal(a?.occurredAt,'2026-10-29T12:54:00');assert.equal(a?.timeSource,'bank');assert.equal(a?.creditKind,'unknown');
 assert.ok(automaticReason({...a!,accountId:'axis'},true,'2026-01-01'),'Deposit proceeds must not auto-log as salary');
 const d=parseAlert('alerts@axis.bank.in','Debit transaction alert','Your A/c no. XX3801 has been debited with INR 100.00 on 29-10-2026 at 13:00:00 IST by Example Store. To check your available balance, click here.');assert.equal(d?.direction,'debit');assert.equal(d?.amount,10000);
});
test('non-payment notices never turn future fees or mandate limits into payments',()=>{
 assert.ok(nonPaymentNotice('alerts@axis.bank.in','We value your feedback','Survey on your Relationship Officer Interaction'));
 assert.ok(nonPaymentNotice('alerts@axis.bank.in','Update on applicable charges for your Axis Bank account','Revised charges effective 01-12-2026: ₹200'));
 assert.ok(nonPaymentNotice('alerts@hdfcbank.bank.in','HDFC Bank NACH Debit Mandate Update','We have Accepted your HDFC Bank NACH Debit Mandate. The mandate has a value of Rs.100000.00'));
 assert.equal(nonPaymentNotice('attacker@example.com','We value your feedback','Survey on your Relationship Officer Interaction'),undefined);
 assert.equal(nonPaymentNotice('alerts@axis.bank.in','Term deposit has been successfully closed','Proceeds credited to repayment account.'),undefined);
 assert.equal(nonPaymentNotice('alerts@axis.bank.in','Credit transaction alert','INR500 credited'),undefined);
});
