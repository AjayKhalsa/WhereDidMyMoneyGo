import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAlert,authenticatedSender,BANK_SENDERS} from '../../src/lib/gmail/alerts';

test('current HSBC bank.in sender parses the transaction, not available limit or amount due',()=>{
 const body='Dear Customer, We are writing to confirm that your HSBC Credit Card xx1234 was used for a transaction of INR 123.45 at EXAMPLE CAFE on 15/10/26. Available limit: INR 562404.24 Amount due: INR 42595.76';
 const a=parseAlert('HSBC <hsbc@hsbc.bank.in>','Credit Card Transaction Alert',body);
 assert(a);assert.equal(a.bank,'HSBC');assert.equal(a.tail,'1234');assert.equal(a.amount,12345);assert.equal(a.merchant,'EXAMPLE CAFE');assert.equal(a.date,'2026-10-15');assert.equal(a.direction,'debit');
 assert.equal(BANK_SENDERS['hsbc@hsbc.bank.in'],'HSBC');
 assert(authenticatedSender({headers:[{name:'From',value:'HSBC <hsbc@hsbc.bank.in>'},{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.i=@hsbc.bank.in; dmarc=pass header.from=hsbc.bank.in'}]}));
 assert.equal(parseAlert('HSBC <hsbc@hsbc.bank.in>','Your HSBC Credit Card OTP',body),null);
 assert.equal(parseAlert('HSBC <hsbc@untrusted.example>','Credit Card Transaction Alert',body),null);
});

test('older HSBC purchase template supplies its actual transaction time and skips login notices',()=>{
 const body='Dear Customer, We write to confirm that your Credit card no ending with 1234,has been used for INR&nbsp;456.70 for payment to EXAMPLE STORE on 20 Jul 2026 at 13:04. If you want to report this as a fraud transaction and block your card, call your bank.';
 const a=parseAlert('HSBC India <hsbc@mail.hsbc.co.in>','You have used your HSBC Credit Card ending with 1234 for a purchase transaction',body);
 assert(a);assert.equal(a.amount,45670);assert.equal(a.tail,'1234');assert.equal(a.merchant,'EXAMPLE STORE');assert.equal(a.date,'2026-07-20');assert.equal(a.occurredAt,'2026-07-20T13:04:00');assert.equal(a.timeSource,'bank');
 assert.equal(parseAlert('HSBC <hsbc@mail.hsbc.co.in>',"Successful log on to HSBC India Mobile Banking",'You have successfully logged on using iPhone.'),null);
});
