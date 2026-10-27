import type { RecurringTransaction, Transaction } from '@/lib/domain/types';
import type { Alert } from './alerts';
import { bankReference, eventDirection, normalizeBankReference, possibleExistingTransactions } from '@/lib/import/identity';
import { merchantKey } from '@/lib/engine/merchant-identity';

export function backfillRange(start:string,end:string,now=Date.now()) {
  const day=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!day(start)||!day(end)||end<start||Date.parse(end)-Date.parse(start)>100*86400000||Date.parse(end+'T00:00:00+05:30')>now)throw new Error('Choose a valid historical range of at most 100 days.');
  return {after:Math.floor(Date.parse(start+'T00:00:00+05:30')/1000)-1,before:Math.floor(Date.parse(end+'T00:00:00+05:30')/1000)+86400};
}
export interface SubscriptionSuggestion { ruleId?:string; status:'link'|'amount-change'|'review'; expectedAmount?:number; actualAmount:number; reason:string }
function billingKey(value:string){return merchantKey(value).replace(/^youtube premium$/,'youtube').replace(/^openai$/,'chatgpt');}
export function subscriptionSuggestion(t:Transaction,rules:RecurringTransaction[]):SubscriptionSuggestion|undefined {
  if(t.type!=='EXPENSE'||t.isRefund)return;
  if(t.recurringId){const rule=rules.find(r=>r.id===t.recurringId);return rule?{ruleId:rule.id,status:t.amount===rule.amount?'link':'amount-change',expectedAmount:rule.amount,actualAmount:t.amount,reason:'Already linked to this recurring rule.'}:undefined;}
  const key=billingKey(t.merchant||t.description);
  const matches=rules.filter(r=>r.isActive&&r.type==='EXPENSE'&&r.accountId===t.accountId&&billingKey(r.merchant||r.description)===key&&key.length>=4);
  if(matches.length!==1)return matches.length?{status:'review',actualAmount:t.amount,reason:'More than one recurring rule matches this merchant.'}:undefined;
  const r=matches[0]!;
  return {ruleId:r.id,status:t.amount===r.amount?'link':'amount-change',expectedAmount:r.amount,actualAmount:t.amount,reason:t.amount===r.amount?'Same merchant, account and actual charged amount. Proposed link only.':'Actual charge differs from the saved recurring amount; review before linking.'};
}
export function subscriptionPatterns(transactions:Transaction[]){
 const groups=new Map<string,Transaction[]>();
 for(const t of transactions){if(t.type!=='EXPENSE'||t.isRefund||t.recurringId||!t.accountId)continue;const key=billingKey(t.merchant||t.description);if(key.length<4||!(t.categoryId==='bills.subscription'||/\b(?:youtube|netflix|spotify|chatgpt|openai|icloud|airtel)\b/.test(key)))continue;const group=t.accountId+'|'+key;groups.set(group,[...(groups.get(group)??[]),t]);}
 return [...groups.entries()].flatMap(([key,rows])=>{
  const sorted=rows.sort((a,b)=>a.date.localeCompare(b.date)),months=new Set(sorted.map(t=>t.date.slice(0,7)));
  if(sorted.length<3||months.size!==sorted.length)return [];
  const gaps=sorted.slice(1).map((t,i)=>(Date.parse(t.date.slice(0,10))-Date.parse(sorted[i]!.date.slice(0,10)))/86400000);
  if(gaps.some(d=>d<25||d>35))return [];
  return [{merchant:key.split('|')[1]!,accountId:sorted[0]!.accountId,transactionIds:sorted.map(t=>t.id),amounts:sorted.map(t=>t.amount),amountChanged:new Set(sorted.map(t=>t.amount)).size>1,status:'review',reason:'Three or more real monthly charges; subscription and rule creation need confirmation.'}];
 });
}
export function backfillDisposition(a:Alert|null,authenticated:boolean,existing:{status:string;transaction_id?:string|null;reason?:string|null}|undefined,transactions:Transaction[],sources:{source_kind:string;source_key:string;transaction_id:string;account_id:string;direction:string;amount:number;bank_reference?:string|null}[],messageId:string,start:string,end:string){
  if(existing?.status==='ignored')return {status:'ignored',reason:'Existing dismissal preserved; no receipt was reset.'};
  if(existing?.status==='duplicate')return {status:'skipped',reason:'Existing duplicate receipt retained; original review or dismissal is unchanged.'};
  if(existing?.status==='logged'&&transactions.some(t=>t.id===existing.transaction_id))return {status:'matched',matched_transaction_id:existing.transaction_id,reason:'Already logged receipt; canonical entry is unchanged.'};
  if(!a)return {status:'skipped',reason:'Unsupported or non-payment email; no financial event inferred.'};
  if(!authenticated)return {status:'review',reason:'Sender authentication not verified.'};
  if(a.date<start||a.date>end)return {status:'skipped',reason:'Transaction date outside selected range.'};
  if(!a.accountId)return {status:'review',reason:'Account or card needs confirmation.'};
  const ref=normalizeBankReference(a.reference);
  const sourceIds=new Set(sources.filter(s=>(s.source_kind==='gmail'&&s.source_key===messageId)||(ref&&normalizeBankReference(s.bank_reference??undefined)===ref&&s.account_id===a.accountId&&s.amount===a.amount&&s.direction===a.direction)).map(s=>s.transaction_id));
  const hits=transactions.filter(t=>t.amount===a.amount&&eventDirection(t,a.accountId!)===a.direction&&Math.abs(Date.parse(t.date.slice(0,10))-Date.parse(a.date))<=3*86400000&&(sourceIds.has(t.id)||(ref&&bankReference((t.notes??'')+' '+t.description)===ref)));
  if(sourceIds.size&&!hits.length)return {status:'review',reason:'Source identity points to a missing or incompatible entry; retain deletion history.'};
  if(hits.length===1)return {status:'matched',matched_transaction_id:hits[0]!.id,reason:'Unique account, direction, amount and strong reference match; no ledger edit.'};
  if(hits.length>1||possibleExistingTransactions(transactions,a.accountId,a.amount,a.date,a.direction,a.reference).length)return {status:'review',reason:'Possible existing entry; do not merge by amount/date alone.'};
  if(a.direction==='credit'||a.special||a.classification?.needsReview)return {status:'review',reason:'Financial purpose or category needs review; no import yet.'};
  return {status:'proposed',reason:'Potential missing debit. Approval required; preview has not imported it.'};
}
export function backfillSummary(items:{status:string}[],discoveryComplete:boolean){
  const counts=Object.fromEntries(['pending','matched','proposed','review','ignored','skipped','failed'].map(s=>[s,items.filter(i=>i.status===s).length]));
  return {discovered:items.length,processed:items.length-counts.pending!,matched:counts.matched!,proposed:counts.proposed!,needsReview:counts.review!,ignored:counts.ignored!,skipped:counts.skipped!,failed:counts.failed!,pending:counts.pending!,imported:0,complete:discoveryComplete&&counts.pending===0&&counts.failed===0};
}

/** Refresh display against current decisions without mutating the original scan. */
export function currentBackfillItems<T extends {message_id:string;status:string;matched_transaction_id?:string|null;reason?:string}>(items:T[],receipts:{message_id:string;status:string;transaction_id?:string|null}[],transactionIds:Set<string>):T[] {
  return items.map(item=>{
    const receipt=receipts.find(r=>r.message_id===item.message_id);
    if(receipt?.status==='logged'&&receipt.transaction_id&&transactionIds.has(receipt.transaction_id))return {...item,status:'matched',matched_transaction_id:receipt.transaction_id,reason:'Already recorded in the current ledger. No action needed.'};
    if(receipt?.status==='ignored')return {...item,status:'ignored',reason:'Dismissed by you; dismissal preserved.'};
    if(receipt?.status==='duplicate')return {...item,status:'skipped',reason:'Duplicate receipt already resolved; no action needed.'};
    if(item.status==='matched'&&item.matched_transaction_id&&!transactionIds.has(item.matched_transaction_id))return {...item,status:'review',reason:'The previously matched ledger entry is no longer present. Review before importing.'};
    return item;
  });
}
