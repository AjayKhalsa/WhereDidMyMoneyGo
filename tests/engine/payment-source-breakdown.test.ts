import assert from 'node:assert/strict';
import test from 'node:test';
import {categoryPaymentSources} from '@/lib/engine/payment-source-breakdown';
import {spendByGroup} from '@/lib/engine/analytics';
import {expense,income,transfer,investmentTxn,makeAccount,makeCard,rs} from '../helpers/factories';
const bank=makeAccount(), card=makeCard(), cash=makeAccount({type:'CASH'});
const group=(id:string)=>id.split('.')[0]!;
const accounts=[bank,card,cash];

test('category source amounts preserve repeated purchases and exclude repayments and investments',()=>{
 const rows=[expense({accountId:card.id,categoryId:'dining.restaurant',amount:rs(700)}),expense({accountId:bank.id,categoryId:'dining.tea',amount:rs(300)}),expense({accountId:bank.id,categoryId:'dining.tea',amount:rs(300)}),transfer({accountId:bank.id,toAccountId:card.id,categoryId:'dining.restaurant',amount:rs(700)}),investmentTxn({accountId:bank.id,categoryId:'dining.tea',amount:rs(9999)}),expense({categoryId:'adjustment',accountId:bank.id,amount:rs(8888)})];
 const original=structuredClone(rows),parts=categoryPaymentSources(rows,rows,accounts,group).get('dining')!;
 assert.equal(parts.find(p=>p.source==='card')!.net,rs(700));assert.equal(parts.find(p=>p.source==='bank')!.net,rs(600));assert.equal(parts.flatMap(p=>p.transactions).length,3);assert.deepEqual(rows,original);
});

test('credits retain their actual receiving account and negative source totals are never clamped',()=>{
 const purchase=expense({accountId:card.id,categoryId:'dining.restaurant',amount:rs(1000),date:'2026-09-01T00:00:00'});
 const refund=income({accountId:bank.id,amount:rs(1500),isRefund:true,reversesTransactionId:purchase.id});
 const credit=income({accountId:bank.id,categoryId:'family',amount:rs(80000)});
 const rows=[refund,credit,expense({accountId:card.id,categoryId:'family',amount:rs(140000)})];
 const parts=categoryPaymentSources(rows,[purchase,...rows],accounts,group);
 assert.equal(parts.get('dining')![0]!.source,'bank');assert.equal(parts.get('dining')![0]!.net,-rs(1500));
 assert.equal(parts.get('family')!.reduce((n,p)=>n+p.net,0),rs(60000));
 for(const s of spendByGroup(rows,id=>id,[purchase,...rows],true,group))assert.equal(parts.get(s.id)!.reduce((n,p)=>n+p.net,0),s.amount);
});

test('cash and unresolved sources remain distinct, including archived card identities',()=>{
 const archived={...card,isActive:false};
 const rows=[expense({accountId:cash.id,categoryId:'dining',amount:rs(100)}),expense({accountId:'missing',categoryId:'dining',amount:rs(200)}),expense({accountId:archived.id,categoryId:'dining',amount:rs(300)})];
 const parts=categoryPaymentSources(rows,rows,[bank,archived,cash],group).get('dining')!;
 assert.equal(parts.find(p=>p.source==='cash')!.net,rs(100));assert.equal(parts.find(p=>p.source==='unknown')!.net,rs(200));assert.equal(parts.find(p=>p.source==='card')!.net,rs(300));
});

test('uncategorized purchases still split while uncategorized salary is excluded',()=>{
 const rows=[expense({accountId:bank.id,categoryId:undefined,amount:rs(100)}),income({accountId:bank.id,amount:rs(100000)}),income({accountId:bank.id,categoryId:'other',amount:rs(2000)})];
 const parts=categoryPaymentSources(rows,rows,accounts,group);
 assert.equal(parts.get('other')![0]!.net,rs(100));assert.equal(parts.size,1);
});
