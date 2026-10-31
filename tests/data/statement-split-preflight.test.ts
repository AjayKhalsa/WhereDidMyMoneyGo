import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryRepository,setRepository} from '@/lib/data/local-adapter';
import {initStore,refreshDatabase,getSnapshot} from '@/lib/data/store';
import {createEmptyDatabase} from '@/lib/data/seed';
import {importTransactions,type ImportRowInput} from '@/lib/data/actions';
import {income,transfer,rs} from '../helpers/factories';
import type {StatementImportEntry,StatementImportResult} from '@/lib/import/identity';

function splitRows(){const notes='Companion ledger entries: principal, interest.';return [transfer({id:'principal',date:'2026-10-29',amount:rs(50000),accountId:'fd',toAccountId:'bank',investmentId:'holding',notes}),income({id:'interest',date:'2026-10-29',amount:rs(648),accountId:'bank',notes})];}
const input=(allowSeparate=false):ImportRowInput=>({draft:{type:'INCOME',amount:rs(50648),date:new Date(2026,9,29),accountId:'bank',description:'Gross bank payout',contexts:[]},wasCorrected:false,observation:{kind:'statement',key:'test-file-row-1',accountId:'bank',direction:'credit',date:'2026-10-29',allowSeparate}});

test('cloud import catches a split added after review and stops before the RPC; failed reload also prevents writing',async()=>{
 class CloudLike extends MemoryRepository {
  calls=0;failLoad=false;
  override async load(){if(this.failLoad)throw new Error('Load interrupted');return super.load();}
  async commitStatementImport(_entries:StatementImportEntry[]):Promise<StatementImportResult>{this.calls++;return {createdIds:[],matched:0,removed:0};}
 }
 const repo=new CloudLike();setRepository(repo);await repo.replaceAll(createEmptyDatabase());await initStore(createEmptyDatabase);await refreshDatabase();
 const externallyUpdated=structuredClone((await repo.load())!);externallyUpdated.transactions=splitRows();await repo.replaceAll(externallyUpdated);
 assert.equal(getSnapshot().data!.transactions.length,0,'Open review still has its stale snapshot');
 const before=await repo.load();
 await assert.rejects(importTransactions([input()]),/split payout/);assert.equal(repo.calls,0);assert.deepEqual(await repo.load(),before);
 repo.failLoad=true;await assert.rejects(importTransactions([input(true)]),/Load interrupted/);assert.equal(repo.calls,0);
 repo.failLoad=false;await importTransactions([input(true)]);assert.equal(repo.calls,1,'Explicit separate event reaches the existing RPC');
});

test('local import preserves the split and adds a gross credit only after explicit separate-event confirmation',async()=>{
 const repo=new MemoryRepository();setRepository(repo);const db=createEmptyDatabase();db.transactions=splitRows();await repo.replaceAll(db);await refreshDatabase();
 const before=structuredClone(db.transactions);
 await assert.rejects(importTransactions([input()]),/split payout/);assert.deepEqual((await repo.load())!.transactions,before);
 const result=await importTransactions([input(true)]);assert.equal(result.created.length,1);
 const after=(await repo.load())!.transactions;assert.equal(after.length,3);assert.deepEqual(after.filter(t=>t.id==='principal'||t.id==='interest'),before);
 await importTransactions([input(true)]);assert.equal((await repo.load())!.transactions.length,3,'Same statement source remains repeat safe');
});
