import test from 'node:test';
import assert from 'node:assert/strict';
import { accountForAlert, authenticatedSender, automaticReason, financialSendersQuery, parseAlert } from '@/lib/gmail/alerts';
import { reviewDefaults } from '@/lib/gmail/review-defaults';
import {suggestCategory} from '@/lib/gmail/classification';

// Synthetic details, preserving the independently observed email layouts.
const icici = 'We have received payment of INR 12,345.67 on your ICICI Bank Credit Card account 1234 XXXX XXXX 4321 on 26-Oct-2026.';
const axis = "26-10-2026 Dear Customer, Here's the summary of your transaction: Amount Debited: INR 64000.00 Account Number: XX9876 Date & Time: 26-10-2026, 09:17:21 IST Transaction Info: UPI/P2M/123456789012/CRED Club If this transaction was not initiated by you: Call us.";
const cred = 'Your credit card payment was successful in 4.9 seconds HSBC Bank •••• 4321 payment details amount paid ₹64,000.00 payment date Oct 26, 2026 credited to card Oct 26, 2026 transaction summary Order ID: TEST123456 Payment Method: UPI UTR No.: PROVIDER12345678 latest statement detected bill amount 24th October, 2026 1,20,000.00';
const credSubject = 'your credit card bill payment was successful';

test('ICICI card receipt is a repayment credit, never salary, refund or another purchase', () => {
 const a = parseAlert('credit_cards@icici.bank.in', 'Payment received on your ICICI Bank Credit Card.', icici)!;
 assert.equal(a.amount, 1234567); assert.equal(a.tail, '4321'); assert.equal(a.date, '2026-10-26');
 assert.equal(a.instrument, 'credit_card'); assert.equal(a.direction, 'credit'); assert.equal(a.creditKind, 'repayment');
 assert.equal(a.timeSource, 'unknown'); assert.equal(a.special, true);
 assert.match(automaticReason({...a,accountId:'card'},true,'2026-10-01')!,/repayment.*existing transfer/i);
 assert.deepEqual(reviewDefaults({...a,accountId:'card'}),{kind:'TRANSFER',accountId:'',toAccountId:'card'});
});

test('Axis bank debit preserves exact transaction time, reference and source account identity', () => {
 const a = parseAlert('alerts@axis.bank.in', 'INR 64000.00 was debited from your A/c no. XX9876.', axis)!;
 assert.equal(a.amount,6400000); assert.equal(a.instrument,'bank'); assert.equal(a.direction,'debit');
 assert.equal(a.reference,'123456789012'); assert.equal(a.occurredAt,'2026-10-26T09:17:21'); assert.equal(a.timeSource,'bank');
 assert.equal(a.special,true); assert.equal(a.paymentRail,'UPI');
 assert.deepEqual(reviewDefaults({...a,accountId:'bank'}),{kind:'TRANSFER',accountId:'bank',toAccountId:''});
 const credit = parseAlert('alerts@axis.bank.in','Account credit',axis.replace('Amount Debited','Amount Credited'))!;
 assert.equal(credit.direction,'credit'); assert.equal(credit.creditKind,'unknown');
});

test('explicit Axis P2P names qualify for Auto without a VPA; P2M merchants do not',()=>{
 const body=axis.replace('64000.00','149.99').replace('P2M','P2P').replace('CRED Club','Example Person');
 const a=parseAlert('alerts@axis.bank.in','Account debit',body)!;
 assert.equal(a.merchant,'Example Person');assert.equal(a.upiRecipientKind,'person');assert.equal(a.reference,'123456789012');
 const categories=[{id:'other'},{id:'transport'},{id:'transport.auto'}];
 assert.equal(suggestCategory(a,[],categories).categoryId,'transport.auto');
 const merchant=parseAlert('alerts@axis.bank.in','Account debit',body.replace('P2P','P2M'))!;
 assert.equal(merchant.upiRecipientKind,'merchant');assert.notEqual(suggestCategory(merchant,[],categories).source,'small-upi');
});

test('CRED successful receipt uses amount paid, not full statement due, and does not invent a bank RRN', () => {
 const a = parseAlert('CRED <protect@cred.club>',credSubject,cred)!;
 assert.equal(a.bank,'HSBC'); assert.equal(a.tail,'4321'); assert.equal(a.amount,6400000);
 assert.equal(a.direction,'credit'); assert.equal(a.creditKind,'repayment'); assert.equal(a.providerReference,'CRED:TEST123456');
 assert.equal(a.reference,undefined); assert.equal(a.timeSource,'unknown');
 assert.equal(accountForAlert(a,[{id:'hsbc',name:'HSBC Travel One',hint:'4321',type:'CREDIT_CARD',isActive:true}],{}),'hsbc');
 const received = parseAlert('protect@cred.club',credSubject,cred,Date.parse('2026-10-26T03:47:30Z'))!;
 assert.equal(received.timeSource,'gmail'); assert.equal(received.timeConfidence,'fallback');
 assert.deepEqual(reviewDefaults({...a,accountId:'hsbc'}),{kind:'TRANSFER',accountId:'',toAccountId:'hsbc'});
});

test('CRED reminders, processing/failure notices, spoofed senders and malformed amounts never become payments', () => {
 for(const subject of ['Your bill is due','payment processing','Payment failed','Your card statement',credSubject+' reminder']) assert.equal(parseAlert('protect@cred.club',subject,cred),null);
 for(const body of [cred.replace('was successful','is pending'),cred.replace('credited to card Oct 26, 2026','expected credit Oct 26, 2026'),cred.replace('64,000.00','64,000.001')]) assert.equal(parseAlert('protect@cred.club',credSubject,body),null);
 assert.equal(parseAlert('protect@cred.club.evil.example',credSubject,cred),null);
 assert.equal(parseAlert('credit_cards@icici.bank.in','Payment received',icici.replace('12,345.67','12,345.678')),null);
});

test('provider discovery is limited to successful receipts and still requires authenticated aligned sender', () => {
 assert.match(financialSendersQuery(),/\(from:protect@cred\.club subject:"your credit card bill payment was successful"\)/);
 const part={headers:[{name:'From',value:'CRED <protect@cred.club>'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=cred.club'}]};
 assert.equal(authenticatedSender(part),true);
 part.headers[1]!.value='mx.google.com; dmarc=pass header.from=evil.example'; assert.equal(authenticatedSender(part),false);
 const html=cred.replace('₹','&#8377;').replaceAll('•','&bull;');
 assert.equal(parseAlert('protect@cred.club',credSubject,html)?.amount,6400000);
});
