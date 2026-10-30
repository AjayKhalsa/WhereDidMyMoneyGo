import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatedFoodReceipt,parseFoodReceipt,possibleFoodPayments,exactFoodOrder} from '@/lib/gmail/food-receipts';
import {expense} from '../helpers/factories';
test('completed Zomato receipt distinguishes outlet address from delivery address and discounts',()=>{
 const r=parseFoodReceipt('Zomato <noreply@zomato.com>','Your Zomato order from Example Cafe','ORDER ID: 1234567890 Delivered Example Cafe Shop 1, Example Road, Mumbai 1 X Tea Total paid - ₹894.89 Delivery Address: PRIVATE HOME Discount ₹100');
 assert.equal(r?.paidAmount,89489);assert.equal(r?.restaurant,'Example Cafe');assert.equal(r?.outletAddress,'Shop 1, Example Road, Mumbai');
 assert.ok(!JSON.stringify(r).includes('PRIVATE HOME'));assert.ok(!('occurredAt' in r!));
});
test('Swiggy Bank amount is evidence and cannot turn delivery time into transaction time',()=>{
 const r=parseFoodReceipt('noreply@swiggy.in','Your Swiggy order was delivered before time','ORDER JOURNEY Example Restaurant Oct 29, 8:00 PM PRIVATE HOME Order ID: 252252441163889 BILL DETAILS Discount ₹134 Paid Via Bank ₹716');
 assert.equal(r?.paidAmount,71600);assert.equal(r?.orderId,'252252441163889');assert.equal(r?.outletAddress,undefined);assert.equal(r?.restaurant,undefined);
});
test('promotions, refunds, missing identifiers and spoofed authentication never qualify',()=>{
 assert.equal(parseFoodReceipt('noreply@swiggy.in','Your order refund','Order ID: 1234567890 delivered Paid Via Bank ₹100'),null);
 assert.equal(parseFoodReceipt('noreply@swiggy.in','Delivered','Discount ₹100'),null);
 assert.equal(parseFoodReceipt('attacker@example.com','Your Zomato order from Cafe','ORDER ID: 1234567890 Delivered Total paid - ₹100'),null);
 const part={headers:[{name:'From',value:'noreply@zomato.com'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=zomato.com'}]};
 assert.ok(authenticatedFoodReceipt(part));
 assert.ok(!authenticatedFoodReceipt({headers:[...part.headers.slice(0,1),{name:'Authentication-Results',value:'attacker; dmarc=pass header.from=zomato.com'}]}));
});
test('candidate matches preserve equal-value repeated payments and never mutate them',()=>{
 const receipt={provider:'Swiggy' as const,orderId:'1234567890',paidAmount:71600};
 const rows=[expense({merchant:'Swiggy Limited',amount:71600,date:'2026-10-29T00:00:00'}),expense({merchant:'Swiggy',amount:71600,date:'2026-10-29T00:00:00'}),expense({merchant:'Uber',amount:71600,date:'2026-10-29T00:00:00'}),expense({merchant:'Swiggy',type:'INCOME',amount:71600,date:'2026-10-29T00:00:00'})];
 const before=JSON.stringify(rows);assert.equal(possibleFoodPayments(receipt,'2026-10-29',rows).length,2);assert.equal(JSON.stringify(rows),before);
});

test('automatic identity requires an explicit provider and full labelled order ID',()=>{
 const r={provider:'Zomato' as const,orderId:'1234567890',paidAmount:50000};
 assert.equal(exactFoodOrder(expense({description:'Zomato',notes:'Order ID: 1234567890'}),r),true);
 assert.equal(exactFoodOrder(expense({description:'Zomato',notes:'RRN: 1234567890'}),r),false);
 assert.equal(exactFoodOrder(expense({description:'Different cafe',notes:'Order ID: 1234567890'}),r),false);
 assert.equal(exactFoodOrder(expense({description:'Zomato',notes:'Order ID: 123456789012'}),r),false);
});
