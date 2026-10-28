import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillDisposition,backfillRange,backfillSummary,subscriptionSuggestion,subscriptionPatterns,currentBackfillItems } from '../../src/lib/gmail/backfill-plan';
import type { Transaction,RecurringTransaction } from '../../src/lib/domain/types';
import type { Alert } from '../../src/lib/gmail/alerts';
const a:Alert={bank:'HDFC',instrument:'bank',tail:'1234',amount:10000,date:'2026-08-01',merchant:'Example',direction:'debit',accountId:'bank',categoryId:'other',reference:'123456789012'};
const globalTransaction={id:'manual',type:'EXPENSE',amount:10000,date:'2026-08-01',description:'Reviewed payee',notes:'ref 123456789012',accountId:'bank',categoryId:'health',contexts:[]} as unknown as Transaction;
const decide=(alert:Alert|null=a,existing?:any,tx:Transaction[]=[globalTransaction],sources:any[]=[])=>backfillDisposition(alert,true,existing,tx,sources,'abc','2026-07-18','2026-10-18');
test('current ledger decisions remove resolved snapshot cases without rewriting evidence or guessing matches',()=>{
 const staged=[{message_id:'saved',status:'review'},{message_id:'dismissed',status:'proposed'},{message_id:'gone',status:'matched',matched_transaction_id:'deleted'},{message_id:'uncertain',status:'review'}];
 const before=JSON.stringify(staged);
 const shown=currentBackfillItems(staged,[{message_id:'saved',status:'logged',transaction_id:'manual'},{message_id:'dismissed',status:'ignored'}],new Set(['manual']));
 assert.deepEqual(shown.map(i=>i.status),['matched','ignored','review','review']);
 assert.equal(shown[0]!.matched_transaction_id,'manual');assert.equal(JSON.stringify(staged),before);
});
test('recurring patterns require actual monthly debits and expose changing amounts',()=>{
 const charges=['2026-07-25','2026-08-25','2026-09-25'].map((date,i)=>({...globalTransaction,id:String(i),date,description:'Spotify',amount:i===2?20000:10000}));
 assert.equal(subscriptionPatterns(charges).length,1);assert.equal(subscriptionPatterns(charges)[0]!.amountChanged,true);
 assert.equal(subscriptionPatterns(charges.slice(0,2)).length,0);
 assert.equal(subscriptionPatterns(charges.map(t=>({...t,type:'INCOME'}))).length,0);
 assert.equal(subscriptionPatterns(charges.map(t=>({...t,description:'Unproven shop'}))).length,0);
});
test('backfill uses exact IST inclusive dates and rejects invalid or unbounded ranges',()=>{const r=backfillRange('2026-07-18','2026-10-18',Date.parse('2026-10-19'));assert.equal(r.after,Date.parse('2026-07-18T00:00:00+05:30')/1000-1);assert.equal(r.before,Date.parse('2026-10-19T00:00:00+05:30')/1000);assert.throws(()=>backfillRange('2026-02-30','2026-10-18'));assert.throws(()=>backfillRange('2026-01-01','2026-10-18'));});
test('strong matched history preserves canonical manual category; weak collisions stay reviewable',()=>{assert.equal(decide().matched_transaction_id,'manual');assert.equal(globalTransaction.categoryId,'health');assert.equal(decide({...a,reference:undefined}).status,'review');assert.equal(decide(a,undefined,[globalTransaction,{...globalTransaction,id:'second'}]).status,'review');});
test('dismissals and orphan source tombstones never propose new money',()=>{assert.equal(decide(a,{status:'ignored',reason:'Dismissed by you.'}).status,'ignored');assert.equal(decide(a,{status:'duplicate'}).status,'skipped');assert.equal(decide(a,undefined,[],[{source_kind:'gmail',source_key:'abc',transaction_id:'deleted'}]).status,'review');assert.equal(decide(a,{status:'logged',transaction_id:'manual'}).status,'matched');});
test('unsupported, unauthenticated, credits and special events cannot become proposed expenses',()=>{assert.equal(decide(null).status,'skipped');assert.equal(backfillDisposition(a,false,undefined,[],[],'abc','2026-07-18','2026-10-18').status,'review');assert.equal(decide({...a,direction:'credit'},undefined,[]).status,'review');assert.equal(decide({...a,special:true},undefined,[]).status,'review');assert.equal(decide(a,undefined,[]).status,'proposed');});
test('completion requires last discovery page, empty queue and no failures; previews import zero',()=>{assert.equal(backfillSummary([],false).complete,false);assert.equal(backfillSummary([{status:'pending'}],true).complete,false);assert.equal(backfillSummary([{status:'failed'}],true).complete,false);const s=backfillSummary([{status:'matched'},{status:'ignored'},{status:'proposed'}],true);assert.equal(s.complete,true);assert.equal(s.imported,0);assert.equal(s.processed,3);});
test('subscription links require actual expense, exact merchant/account and unique rule; changes are reviewable',()=>{const t={...globalTransaction,description:'Example'};const rule={id:'r',description:'Example',accountId:'bank',amount:10000,type:'EXPENSE',isActive:true} as RecurringTransaction;assert.equal(subscriptionSuggestion(t,[rule])?.status,'link');assert.equal(subscriptionSuggestion({...t,type:'INCOME'},[rule]),undefined);assert.equal(subscriptionSuggestion({...t,isRefund:true},[rule]),undefined);assert.equal(subscriptionSuggestion({...t,accountId:'card'},[rule]),undefined);assert.equal(subscriptionSuggestion({...t,amount:20000},[rule])?.status,'amount-change');assert.equal(subscriptionSuggestion(t,[rule,{...rule,id:'other'}])?.status,'review');assert.equal(subscriptionSuggestion({...t,description:'Other Example'},[rule]),undefined);});

test('current report recognizes newly recorded cross-source events without editing manual ledger data',()=>{
 const ledger={...globalTransaction,notes:undefined,categoryId:'manual-category'};
 const source={source_kind:'statement',source_key:'row-1',transaction_id:ledger.id,account_id:'bank',direction:'debit',amount:a.amount,bank_reference:a.reference};
 const staged=[{message_id:'late-email',status:'proposed',candidate:a,reason:'Potential missing debit.'}];
 const original=structuredClone({ledger,staged});
 const result=currentBackfillItems(staged,[],new Set([ledger.id]),{transactions:[ledger],sources:[source]});
 assert.equal(result[0]?.status,'matched');
 assert.equal((result[0] as {matched_transaction_id?:string}).matched_transaction_id,ledger.id);
 assert.deepEqual({ledger,staged},original,'Display matching must never rewrite money or user labels');
});

test('equal payments keep distinct reference identities; amount/date/merchant similarities do not hide them',()=>{
 const ids=['111122223333','444455556666','777788889999'];
 const ledger=ids.map((ref,i)=>({...globalTransaction,id:'legitimate-'+i,notes:'Bank reference '+ref}));
 const staged=ids.map((ref,i)=>({message_id:'mail-'+i,status:'review',candidate:{...a,reference:ref},reason:'Possible existing entry.'}));
 const projected=currentBackfillItems(staged,[],new Set(ledger.map(t=>t.id)),{transactions:ledger,sources:[]});
 assert.equal(projected.filter(i=>i.status==='matched').length,3);
 assert.deepEqual(projected.map(i=>(i as {matched_transaction_id?:string}).matched_transaction_id),ledger.map(t=>t.id));
 const weak=currentBackfillItems([{...staged[0]!,candidate:{...a,reference:undefined}}],[],new Set(ledger.map(t=>t.id)),{transactions:ledger,sources:[]});
 assert.equal(weak[0]?.status,'review');
});

test('reference ambiguity, missing canonical rows, authentication issues and incompatible bank details stay visible',()=>{
 const staged=[{message_id:'email',status:'review',candidate:a,reason:'Possible existing entry.'}];
 for(const transactions of [
  [{...globalTransaction,accountId:'different-bank'}],
  [{...globalTransaction,type:'INCOME' as const}],
  [{...globalTransaction,date:'2026-01-01T00:00:00'}],
  [globalTransaction,{...globalTransaction,id:'duplicate-reference'}],
 ]){
  assert.equal(currentBackfillItems(staged,[],new Set(transactions.map(t=>t.id)),{transactions,sources:[]})[0]?.status,'review');
 }
 assert.equal(currentBackfillItems([{...staged[0]!,reason:'Sender authentication not verified.'}],[],new Set([globalTransaction.id]),{transactions:[globalTransaction],sources:[]})[0]?.status,'review');
 assert.equal(currentBackfillItems(staged,[{message_id:'email',status:'ignored'}],new Set([globalTransaction.id]),{transactions:[globalTransaction],sources:[]})[0]?.status,'ignored');
 const removed={source_kind:'gmail',source_key:'email',transaction_id:null,account_id:'bank',direction:'debit',amount:a.amount};
 assert.equal(currentBackfillItems(staged,[],new Set(),{transactions:[],sources:[removed]})[0]?.status,'review');
});

test('provider-order identity can match a repayment but never a substring of another order',()=>{
 const credit={...a,instrument:'credit_card' as const,accountId:'card',direction:'credit' as const,reference:undefined,providerReference:'CRED:EXAMPLE123456'};
 const transfer={...globalTransaction,type:'TRANSFER' as const,accountId:'bank',toAccountId:'card',notes:'Payment provider reference CRED:EXAMPLE123456; verified.'};
 const staged=[{message_id:'receipt',status:'review',candidate:credit,reason:'Card repayment received.'}];
 const project=(notes:string)=>currentBackfillItems(staged,[],new Set([transfer.id]),{transactions:[{...transfer,notes}],sources:[]});
 assert.equal(project(transfer.notes)[0]?.status,'matched');
 assert.equal(project('Provider reference CRED:EXAMPLE1234567')[0]?.status,'review');
});
