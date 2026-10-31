import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRepository,setRepository} from '@/lib/data/local-adapter';
import {refreshDatabase} from '@/lib/data/store';
import {createEmptyDatabase} from '@/lib/data/seed';
import {importTransactions,type ImportRowInput} from '@/lib/data/actions';
import {accountBalance} from '@/lib/engine/analytics';
import {netSpending} from '@/lib/engine/spending';
import {expense,income,transfer,makeAccount,rs} from '../helpers/factories';
import type {StatementImportEntry,StatementImportResult} from '@/lib/import/identity';

const entry=(key:string,amount:number,over:Partial<ImportRowInput['draft']>={}):ImportRowInput=>({draft:{type:'INCOME',amount:rs(amount),date:new Date(2026,9,29),accountId:'bank',description:key,contexts:[],...over},wasCorrected:false,observation:{kind:'statement',key,accountId:'bank',direction:'credit',date:'2026-10-29'}});

test('received transfer moves both bank balances; refund lowers spending and salary alone counts as earned income',async()=>{
 const repo=new MemoryRepository();setRepository(repo);const db=createEmptyDatabase();const source=makeAccount({id:'source',openingBalance:rs(10000)}),bank=makeAccount({id:'bank',openingBalance:rs(1000)});db.accounts=[source,bank];db.transactions=[expense({id:'original-purchase',date:'2026-10-28',amount:rs(500),accountId:'bank',categoryId:'dining'})];await repo.replaceAll(db);await refreshDatabase();
 const batch=[entry('salary',5000),entry('own-transfer',2000,{type:'TRANSFER',accountId:'source',toAccountId:'bank'}),entry('refund',200,{isRefund:true,categoryId:'dining'})];
 const result=await importTransactions(batch);assert.equal(result.created.length,3);const saved=(await repo.load())!.transactions;
 assert.equal(accountBalance(source,saved),rs(8000));assert.equal(accountBalance(bank,saved),rs(7700));assert.equal(netSpending(saved),rs(300));
 assert.equal(saved.filter(t=>t.type==='INCOME'&&!t.isRefund).reduce((sum,t)=>sum+t.amount,0),rs(5000));
 assert.equal(saved.find(t=>t.description==='refund')!.type,'INCOME');assert.equal(saved.find(t=>t.description==='own-transfer')!.type,'TRANSFER');
 await importTransactions(batch);assert.equal((await repo.load())!.transactions.length,4,'The same statement cannot add another copy');
});

test('direction mismatch stops an entire cloud or local batch before the writer receives any rows',async()=>{
 class CloudLike extends MemoryRepository {calls=0;async commitStatementImport(_rows:StatementImportEntry[]):Promise<StatementImportResult>{this.calls++;return {createdIds:[],matched:0,removed:0};}}
 for(const repo of [new MemoryRepository(),new CloudLike()]){
  setRepository(repo);await repo.replaceAll(createEmptyDatabase());await refreshDatabase();
  await assert.rejects(importTransactions([entry('good-credit',200),entry('credit-turned-expense',300,{type:'EXPENSE'})]),/does not match/);
  assert.equal((await repo.load())!.transactions.length,0);
  if(repo instanceof CloudLike)assert.equal(repo.calls,0);
 }
});

test('linking received rows preserves an existing refund and investment redemption with all user-owned fields',async()=>{
 const repo=new MemoryRepository();setRepository(repo);const db=createEmptyDatabase();
 db.transactions=[income({id:'saved-refund',date:'2026-10-29',amount:rs(200),accountId:'bank',isRefund:true,categoryId:'dining.delivery',notes:'My original note'}),transfer({id:'saved-redemption',date:'2026-10-29',amount:rs(2000),accountId:'fd',toAccountId:'bank',investmentId:'holding',notes:'Principal, not earnings'})];
 const before=structuredClone(db.transactions);await repo.replaceAll(db);await refreshDatabase();
 const credits=[entry('refund-receipt',200),entry('redemption-receipt',2000)];credits[0]!.observation!.existingTransactionId='saved-refund';credits[1]!.observation!.existingTransactionId='saved-redemption';
 const result=await importTransactions(credits);assert.equal(result.created.length,0);assert.equal(result.matched,2);assert.deepEqual((await repo.load())!.transactions,before);
});
