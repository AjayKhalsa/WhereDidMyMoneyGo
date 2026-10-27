import { randomUUID } from 'node:crypto';
import type { Account, RecurringTransaction, Transaction } from '@/lib/domain/types';
import { accountForAlert,authenticatedSender,financialSendersQuery,header,mailText,parseAlert,type MailPart } from './alerts';
import { admin,GmailError,google,tokenRequest,unseal } from './server';
import { domainRow,learningData } from './learning-data';
import { classifiedAlert } from './classification';
import { merchantKey } from '@/lib/engine/merchant-identity';
import { backfillDisposition,backfillRange,backfillSummary,subscriptionSuggestion,subscriptionPatterns,currentBackfillItems } from './backfill-plan';

type DB=ReturnType<typeof admin>;
// Explicit paging: never silently treat Supabase's default first 1000 as all history.
async function allRows(db:DB,table:string,user:string,order:string,run?:string){
 const rows:Record<string,any>[]=[];
 for(let offset=0;offset<=10000;offset+=1000){
  let q=db.from(table).select('*').eq('user_id',user).order(order).range(offset,offset+999);if(table==='transaction_sources')q=q.order('source_kind');if(run)q=q.eq('run_id',run);
  const r=await q;if(r.error)throw r.error;rows.push(...r.data??[]);if((r.data?.length??0)<1000)return rows;
 }
 throw new GmailError('Preview exceeds 10,000 records; use a narrower date range.',409);
}
export async function backfillReport(user:string){
 const db=admin(),run=await db.from('gmail_backfill_runs').select('*').eq('user_id',user).order('created_at',{ascending:false}).limit(1).maybeSingle();if(run.error)throw run.error;
 if(!run.data)return {run:null,items:[],subscriptions:[]};
 const staged=await allRows(db,'gmail_backfill_items',user,'message_id',run.data.id);
 const [tx,rr,receipts]=await Promise.all([allRows(db,'transactions',user,'id'),allRows(db,'recurring',user,'id'),allRows(db,'gmail_messages',user,'message_id')]);
 const items=currentBackfillItems(staged as ({message_id:string;status:string}&Record<string,any>)[],receipts as any,new Set(tx.map(t=>String(t.id))));
 const rules=rr.map(r=>domainRow<RecurringTransaction>(r));
 const subscriptions=tx.filter(t=>t.date.slice(0,10)>=run.data.start_date&&t.date.slice(0,10)<=run.data.end_date).flatMap(t=>{const suggestion=subscriptionSuggestion(domainRow<Transaction>(t),rules);return suggestion?[{transactionId:t.id,merchant:t.merchant||t.description,date:t.date, ...suggestion}]:[];});
 const patterns=subscriptionPatterns(tx.filter(t=>t.date.slice(0,10)>=run.data.start_date&&t.date.slice(0,10)<=run.data.end_date).map(t=>domainRow<Transaction>(t)));
 return {run:{...run.data,query:undefined,page_token:undefined},summary:backfillSummary(items.map(i=>({status:String(i.status)})),run.data.discovery_complete),items,subscriptions,patterns};
}
export async function scanBackfill(user:string,input?:{start:string;end:string;refresh?:boolean}){
 const db=admin(),lease=randomUUID(),lock=await db.rpc('gmail_acquire_lease',{p_user:user,p_lease:lease});if(lock.error)throw lock.error;if(!lock.data)throw new GmailError('A Gmail job is running, or Gmail is disconnected. Retry shortly.',409);
 let runId:string|undefined;
 const begun=Date.now();
 try{
  const c=await db.from('gmail_connections').select('refresh_token,aliases').eq('user_id',user).single();if(c.error)throw c.error;
  let found=await db.from('gmail_backfill_runs').select('*').eq('user_id',user).neq('status','complete').maybeSingle();if(found.error)throw found.error;
  if(!found.data){
   // Ordinary retries reuse a completed report. An explicit refresh starts a
   // new immutable preview so parser updates can reconsider unresolved mail.
   const previous=await db.from('gmail_backfill_runs').select('*').eq('user_id',user).order('created_at',{ascending:false}).limit(1).maybeSingle();if(previous.error)throw previous.error;
   if(previous.data&&(!input||(!input.refresh&&input.start===previous.data.start_date&&input.end===previous.data.end_date)))return await backfillReport(user);
   if(!input)throw new GmailError('Choose the historical date range.');
   let bounds;try{bounds=backfillRange(input.start,input.end);}catch{throw new GmailError('Choose a historical range of at most 100 days.');}
   const query=`after:${bounds.after} before:${bounds.before} -in:spam -in:trash -subject:OTP -subject:statement ${financialSendersQuery()}`;
   const inserted=await db.from('gmail_backfill_runs').insert({id:randomUUID(),user_id:user,start_date:input.start,end_date:input.end,query}).select('*').single();if(inserted.error)throw inserted.error;found=inserted;
  }else if(input&&(input.start!==found.data.start_date||input.end!==found.data.end_date))throw new GmailError('Finish the current preview before choosing another range.',409);
  const run=found.data!;runId=run.id;
  const token=await tokenRequest({grant_type:'refresh_token',refresh_token:unseal(c.data.refresh_token,user)});
  const headers={Authorization:`Bearer ${token.access_token}`},base='https://gmail.googleapis.com/gmail/v1/users/me';
  if(!run.discovery_complete){
   const params=new URLSearchParams({q:run.query,maxResults:'25'});if(run.page_token)params.set('pageToken',run.page_token);
   let page:{messages?:{id:string}[];nextPageToken?:string};
   try{page=await google<typeof page>(`${base}/messages?${params}`,{headers});}
   catch(error){
    // A stale Gmail cursor can be discarded without losing queued observations.
    // Replay uses the immutable query and duplicate-safe item keys.
    if(run.page_token){const reset=await db.from('gmail_backfill_runs').update({page_token:null}).eq('id',run.id).eq('user_id',user);if(reset.error)throw reset.error;}
    throw error;
   }
   if(page.messages?.length){const insert=await db.from('gmail_backfill_items').upsert(page.messages.map(m=>({run_id:run.id,user_id:user,message_id:m.id})),{onConflict:'run_id,message_id',ignoreDuplicates:true});if(insert.error)throw insert.error;}
   const cursor=await db.from('gmail_backfill_runs').update({page_token:page.nextPageToken??null,discovery_complete:!page.nextPageToken}).eq('id',run.id).eq('user_id',user);if(cursor.error)throw cursor.error;
  }
  const [transactions,sources,receipts,accounts,recurring,learned]=await Promise.all([
   allRows(db,'transactions',user,'id'),allRows(db,'transaction_sources',user,'source_key'),allRows(db,'gmail_messages',user,'message_id'),allRows(db,'accounts',user,'id'),allRows(db,'recurring',user,'id'),learningData(db,user),
  ]);
  const tx=transactions.map(r=>domainRow<Transaction>(r)),rules=recurring.map(r=>domainRow<RecurringTransaction>(r));
  const profile=await db.from('profiles').select('name').eq('id',user).single();if(profile.error)throw profile.error;
  const queue=await db.from('gmail_backfill_items').select('message_id,attempts').eq('run_id',run.id).eq('user_id',user).in('status',['pending','failed']).lt('attempts',3).order('message_id').limit(25);if(queue.error)throw queue.error;
  for(const item of queue.data??[]){
   if(Date.now()-begun>35000)break;
   let record:Record<string,unknown>;
   try{
    const existing=receipts.find(r=>r.message_id===item.message_id);
    if(existing?.status==='ignored')record={status:'ignored',reason:'Existing dismissal preserved; not reprocessed.'};
    else if(existing?.status==='duplicate')record={status:'skipped',reason:'Existing duplicate receipt retained; no reprocessing.'};
    else if(existing?.status==='logged'&&tx.some(t=>t.id===existing.transaction_id))record={status:'matched',matched_transaction_id:existing.transaction_id,reason:'Already logged receipt; retained canonical entry.'};
    else{
     const mail=await google<{payload:MailPart;internalDate?:string}>(`${base}/messages/${encodeURIComponent(item.message_id)}?format=full`,{headers});
     const subject=header(mail.payload,'Subject').slice(0,250),a=parseAlert(header(mail.payload,'From'),subject,mailText(mail.payload),mail.internalDate?Number(mail.internalDate):undefined);
     if(a){a.accountId=accountForAlert(a,accounts.map(r=>domainRow<Account>(r)),c.data.aliases??{});const self=merchantKey(profile.data.name);if(self.length>=3&&merchantKey(a.merchant).includes(self))a.special=true;Object.assign(a,classifiedAlert(a,learned.rules,learned.categories,[profile.data.name]));}
     const disposition=backfillDisposition(a,authenticatedSender(mail.payload),existing as any,tx,sources as any,item.message_id,run.start_date,run.end_date);
     const canonical=tx.find(t=>t.id===disposition.matched_transaction_id);
     const proposed=a&&a.direction==='debit'&&!a.special&&a.accountId?({id:item.message_id,type:'EXPENSE',amount:a.amount,accountId:a.accountId,merchant:a.merchant,description:a.merchant,date:a.date} as Transaction):undefined;
     record={...disposition,subject,candidate:a,subscription:canonical||proposed?subscriptionSuggestion((canonical??proposed)!,rules)??null:null};
    }
   }catch{record={status:'failed',reason:'Message could not be processed. Retry; no ledger entry was added.'};}
   const saved=await db.from('gmail_backfill_items').update({...record,attempts:item.attempts+1}).eq('run_id',run.id).eq('user_id',user).eq('message_id',item.message_id);if(saved.error)throw saved.error;
  }
  const report=await backfillReport(user),summary=report.summary!;
  const state=summary.complete?'complete':summary.failed&&!summary.pending&&report.run!.discovery_complete?'attention':'scanning';
  const updated=await db.from('gmail_backfill_runs').update({status:state,completed_at:summary.complete?new Date().toISOString():null,last_error:null}).eq('id',run.id).eq('user_id',user);if(updated.error)throw updated.error;
  return {...report,run:{...report.run,status:state},more:state==='scanning'};
 }catch(error){if(runId)await db.from('gmail_backfill_runs').update({last_error:error instanceof GmailError?error.message:'Preview interrupted. Resume safely; the ledger is unchanged.'}).eq('id',runId).eq('user_id',user);throw error;
 }finally{await db.from('gmail_connections').update({lease_id:null,lease_until:null}).eq('user_id',user).eq('lease_id',lease);}
}
