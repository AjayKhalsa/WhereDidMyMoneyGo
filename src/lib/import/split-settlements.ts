import type {Transaction} from '@/lib/domain/types';
import {bankReference,eventDirection,normalizeBankReference,type EventDirection,type StatementImportEntry} from './identity';

export interface RecordedSplit {
  id:string;
  rows:Transaction[];
  date:string;
  total:number;
}

/** Legacy backed-up split repairs explicitly list their companion IDs on
 * every component. Amount sums alone never establish a split or a source link. */
function companions(notes:string|undefined):string[]|undefined {
  const matches=[...(notes??'').matchAll(/\bCompanion ledger entries:\s*([A-Za-z0-9_, -]+)\./g)];
  if(matches.length!==1)return;
  const ids=matches[0]![1]!.split(',').map(id=>id.trim());
  if(ids.length<2||ids.length>12||new Set(ids).size!==ids.length||ids.some(id=>!/^[-\w]{1,200}$/.test(id)))return;
  return ids.sort();
}

function dayStamp(value:string):number {
  const date=value.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return NaN;
  const stamp=Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date?stamp:NaN;
}

export function recordedSplitGroups(transactions:Transaction[]):RecordedSplit[] {
  const byId=new Map(transactions.map(t=>[t.id,t]));
  const duplicateIds=new Set<string>(),seen=new Set<string>();
  for(const row of transactions){if(seen.has(row.id))duplicateIds.add(row.id);seen.add(row.id);}
  const result=new Map<string,RecordedSplit>();
  for(const row of transactions) {
    const ids=companions(row.notes);if(!ids||!ids.includes(row.id))continue;
    const id=ids.join('|');if(result.has(id))continue;
    const rows=ids.map(id=>byId.get(id));
    if(rows.some((t,i)=>!t||duplicateIds.has(ids[i]!)||companions(t.notes)?.join('|')!==id||
      !Number.isSafeInteger(t.amount)||t.amount<=0||t.categoryId==='adjustment'||t.isRefund||
      !['TRANSFER','INCOME','EXPENSE','INVESTMENT'].includes(t.type)||
      t.date.slice(0,10)!==row.date.slice(0,10)||t.accountId===t.toAccountId))continue;
    const components=rows as Transaction[];
    const total=components.reduce((sum,t)=>sum+t.amount,0);
    if(!Number.isSafeInteger(total))continue;
    const references=new Set(components.map(t=>bankReference(`${t.notes??''} ${t.description}`)).filter(Boolean));
    if(references.size>1)continue;
    result.set(id,{id,rows:components,date:row.date.slice(0,10),total});
  }
  return [...result.values()];
}

/** A review candidate, never an automatic match or a persisted source receipt. */
export function possibleRecordedSplits(groups:RecordedSplit[],accountId:string,amount:number,date:string,direction:EventDirection,reference?:string):RecordedSplit[] {
  const day=dayStamp(date),ref=normalizeBankReference(reference);
  if(!Number.isFinite(day)||!Number.isSafeInteger(amount)||amount<=0)return [];
  return groups.filter(group=>{
    const groupDay=dayStamp(group.date);
    if(group.total!==amount||!Number.isFinite(groupDay)||Math.abs(groupDay-day)>3*86400000)return false;
    return group.rows.every(row=>{
      const other=bankReference(`${row.notes??''} ${row.description}`);
      return eventDirection(row,accountId)===direction&&(!ref||!other||ref===other);
    });
  });
}

/** Rechecked against a fresh repository load before either cloud or local import.
 * Existing single-entry links remain subject to the existing writer validation. */
export function assertSplitReview(entries:StatementImportEntry[],transactions:Transaction[]):void {
  const groups=recordedSplitGroups(transactions);
  for(const {transaction,observation:o} of entries) {
    if(o.existingTransactionId||o.allowSeparate)continue;
    if(possibleRecordedSplits(groups,o.accountId,transaction.amount,o.date,o.direction,o.reference).length)
      throw new Error('This statement row may already be recorded as a split payout. Refresh and reopen the statement to review its entries or confirm a separate payment.');
  }
}
