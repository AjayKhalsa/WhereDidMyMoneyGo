import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedSplitGroups,possibleRecordedSplits,assertSplitReview} from '@/lib/import/split-settlements';
import {buildImportDrafts} from '@/lib/import/build-drafts';
import {income,transfer,rs} from '../helpers/factories';
import type {Transaction} from '@/lib/domain/types';
import type {StatementImportEntry} from '@/lib/import/identity';

function payout(prefix='fd'):Transaction[] {
 const notes=`Confirmed principal and interest. Companion ledger entries: ${prefix}_principal, ${prefix}_interest.`;
 return [transfer({id:`${prefix}_principal`,date:'2026-10-29T12:54:00',amount:rs(50000),accountId:'fd-tracking',toAccountId:'bank',investmentId:'holding',notes}),income({id:`${prefix}_interest`,date:'2026-10-29T12:54:00',amount:rs(648),accountId:'bank',notes})];
}
const find=(rows:Transaction[],over:Partial<{account:string;amount:number;date:string;direction:'credit'|'debit';ref:string}>={})=>possibleRecordedSplits(recordedSplitGroups(rows),over.account??'bank',over.amount??rs(50648),over.date??'2026-10-29',over.direction??'credit',over.ref);
const entry=(over:Partial<StatementImportEntry['observation']>={}):StatementImportEntry=>({transaction:income({date:'2026-10-29',amount:rs(50648),accountId:'bank'}),observation:{kind:'statement',key:'file-row-1',accountId:'bank',direction:'credit',date:'2026-10-29',...over}});

test('explicit principal and interest remain two canonical entries behind a gross statement credit',()=>{
 const rows=payout(),before=structuredClone(rows),matches=find(rows);
 assert.equal(matches.length,1);assert.equal(matches[0]!.total,rs(50648));assert.deepEqual(matches[0]!.rows.map(t=>t.id).sort(),['fd_interest','fd_principal']);
 const draft=buildImportDrafts([{date:'2026-10-29',narration:'MBB-TD closure',withdrawal:0,deposit:rs(50648)}],'bank',rows,[])[0]!;
 assert.equal(draft.possibleMatchIds.length,0);assert.equal(draft.possibleSplitIds.length,1);assert.equal(draft.isLikelyDuplicate,false,'A possible split is not a confirmed duplicate');assert.deepEqual(rows,before);
});

test('amount coincidence, one-sided notes, missing or edited companions and malformed groups never establish a split',()=>{
 for(const change of [
  (r:Transaction[])=>r.map(t=>({...t,notes:undefined})),
  (r:Transaction[])=>[{...r[0]!,notes:undefined},r[1]!],
  (r:Transaction[])=>r.slice(0,1),
  (r:Transaction[])=>[{...r[0]!,amount:rs(49000)},r[1]!],
  (r:Transaction[])=>r.map(t=>({...t,notes:'Companion ledger entries: fd_principal, fd_principal.'})),
  (r:Transaction[])=>[...r,r[0]!],
  (r:Transaction[])=>[{...r[0]!,amount:-rs(50000)},r[1]!],
  (r:Transaction[])=>[{...r[0]!,categoryId:'adjustment'},r[1]!],
  (r:Transaction[])=>[r[0]!,{...r[1]!,isRefund:true}],
 ])assert.equal(find(change(payout())).length,0);
});

test('direction, account, dates and known distinct references protect separate financial events',()=>{
 const rows=payout();assert.equal(find(rows,{direction:'debit'}).length,0);assert.equal(find(rows,{account:'other-bank'}).length,0);
 assert.equal(find(rows,{date:'2026-11-01'}).length,1);assert.equal(find(rows,{date:'2026-11-02'}).length,0);assert.equal(find(rows,{date:'2026-02-30'}).length,0);
 assert.equal(find([rows[0]!,{...rows[1]!,date:'2026-10-30'}]).length,0);
 const withRef=rows.map(t=>({...t,notes:`${t.notes} reference: 123456789012`}));
 assert.equal(find(withRef,{ref:'123456789012'}).length,1);assert.equal(find(withRef,{ref:'999999999999'}).length,0);
 assert.equal(find([withRef[0]!,{...withRef[1]!,notes:`${rows[1]!.notes} reference: 999999999999`}]).length,0);
});

test('multiple equal payouts remain ambiguous and are never paired or consumed automatically',()=>{
 const rows=[...payout('one'),...payout('two')];assert.equal(find(rows).length,2);
 const drafts=buildImportDrafts(Array.from({length:2},()=>({date:'2026-10-29',narration:'TD closure',withdrawal:0,deposit:rs(50648)})),'bank',rows,[]);
 assert.deepEqual(drafts.map(d=>d.possibleSplitIds.length),[2,2]);assert.equal(rows.length,4);
});

test('fresh import preflight blocks unchecked splits, permits explicit separate events or validated single links',()=>{
 assert.throws(()=>assertSplitReview([entry()],payout()),/split payout/);
 assert.doesNotThrow(()=>assertSplitReview([entry({allowSeparate:true})],payout()));
 assert.doesNotThrow(()=>assertSplitReview([entry({existingTransactionId:'another-gross-entry'})],payout()),'Existing single-entry link is still validated by the existing writer');
 assert.doesNotThrow(()=>assertSplitReview([entry()],[]));
 assert.throws(()=>assertSplitReview([entry({allowSeparate:true}),entry({key:'file-row-2'})],payout()),/split payout/,'One confirmed separate row does not authorise another');
});
