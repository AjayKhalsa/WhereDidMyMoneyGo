import type {SupabaseClient} from '@supabase/supabase-js';
import type {Transaction} from '@/lib/domain/types';
import {completeLoad} from '@/lib/data/complete-load';
import {domainRow} from './learning-data';
import {header,type MailPart} from './alerts';
import {receiptMailText,authenticatedFoodReceipt,exactFoodOrder,parseFoodReceipt,possibleFoodPayments} from './food-receipts';
import {GmailError,GoogleRequestError,google} from './server';

// A separate cursor keeps financial discovery independent. Only IDs and scan
// bounds live here: no raw email, credentials or customer addresses.
export interface ReceiptScan {
  after?:number; before?:number; token?:string; pending?:string[];
  next?:string; loaded?:boolean; completedAt?:string;
}
const DAY=86400000;
export const FOOD_RECEIPT_QUERY='((from:noreply@zomato.com subject:"Your Zomato order from") OR (from:noreply@swiggy.in subject:"order was delivered"))';

/** Caller must hold the mailbox lease. Every consumed ID is checkpointed only
 * after processing; replay after a crash is safe through link_food_receipt. */
export async function syncFoodReceipts(input:{
  db:SupabaseClient; userId:string; lease:string; accessToken:string;
  state:ReceiptScan; startDate:string; deadline:number; now?:()=>number;
}) {
  const {db,userId,lease,accessToken,deadline}=input,now=input.now??Date.now;
  let state:ReceiptScan={...input.state},checked=0,linked=0;
  const save=async(next:ReceiptScan)=>{
    const result=await db.from('gmail_connections').update({receipt_scan:next})
      .eq('user_id',userId).eq('lease_id',lease).gt('lease_until',new Date(now()).toISOString())
      .select('user_id').maybeSingle();
    if(result.error)throw result.error;
    if(!result.data)throw new GmailError('Receipt sync paused safely. Retry to continue.',409);
    state=next;
  };
  if(deadline-now()<12000)return {checked,linked,more:true};
  if(!state.before){
    const started=now(),start=Date.parse(input.startDate+'T00:00:00+05:30');
    // Initial 30-day catch-up; seven-day overlap subsequently retries receipts
    // whose bank alerts arrived late. Never scan before the connected range.
    const previous=state.completedAt?Date.parse(state.completedAt):NaN;
    await save({completedAt:state.completedAt,after:Math.floor(Math.max(start-DAY,Number.isFinite(previous)?previous-7*DAY:started-30*DAY)/1000),before:Math.ceil(started/1000)});
  }
  const base='https://gmail.googleapis.com/gmail/v1/users/me',headers={Authorization:`Bearer ${accessToken}`};
  if(!state.loaded){
    const params=new URLSearchParams({q:`after:${state.after} before:${state.before} -in:spam -in:trash ${FOOD_RECEIPT_QUERY}`,maxResults:'8'});
    if(state.token)params.set('pageToken',state.token);
    type Page={messages?:{id:string}[];nextPageToken?:string};let page:Page;
    try{page=await google<Page>(`${base}/messages?${params}`,{headers});}
    catch(error){
      if(!state.token||!(error instanceof GoogleRequestError)||error.upstreamStatus!==400)throw error;
      // Expired cursor: replay the same fixed interval, never move its boundary.
      await save({...state,token:undefined});params.delete('pageToken');
      page=await google<Page>(`${base}/messages?${params}`,{headers});
    }
    // Durably queue the whole page before consuming or moving its cursor.
    await save({...state,loaded:true,pending:[...new Set((page.messages??[]).map(m=>m.id))],next:page.nextPageToken});
  }
  let ledger:Awaited<ReturnType<typeof loadLedger>>|undefined;
  async function loadLedger(){return completeLoad(async(from,to)=>await db.from('transactions').select('*',{count:'exact'}).eq('user_id',userId).order('id').range(from,to),r=>r.id);}
  for(const messageId of [...state.pending??[]]){
    if(deadline-now()<12000)break;
    let mail:{payload:MailPart;internalDate:string}|null;
    try{mail=await google<{payload:MailPart;internalDate:string}>(`${base}/messages/${encodeURIComponent(messageId)}?format=full`,{headers});}
    catch(error){if(error instanceof GoogleRequestError&&error.upstreamStatus===404)mail=null;else throw error;}
    if(mail&&authenticatedFoodReceipt(mail.payload)){
      const receipt=parseFoodReceipt(header(mail.payload,'From'),header(mail.payload,'Subject'),receiptMailText(mail.payload));
      const received=new Date(Number(mail.internalDate));
      if(receipt&&Number.isFinite(received.getTime())){
        const receivedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(received);
        ledger??=await loadLedger();
        const transactions=ledger.data.map(r=>domainRow<Transaction>(r));
        // A previously confirmed order can corroborate a second receipt. The
        // RPC still rejects deleted/dismissed sources and conflicting details.
        const saved=await db.from('food_receipt_details').select('transaction_id').eq('user_id',userId).eq('provider',receipt.provider).eq('order_id',receipt.orderId).maybeSingle();
        if(saved.error)throw saved.error;
        const eligible=possibleFoodPayments(receipt,receivedDay,transactions);
        const matches=saved.data?.transaction_id?eligible.filter(t=>t.id===saved.data!.transaction_id):eligible.filter(t=>exactFoodOrder(t,receipt));
        if(matches.length===1){
          const row=ledger.data.find(t=>t.id===matches[0]!.id)!;
          const result=await db.rpc('link_food_receipt',{p_user:userId,p_message:messageId,p_transaction:row.id,p_receipt:receipt,p_received:receivedDay,p_expected:row,p_confirmed:false});
          if(result.error)throw result.error;
          if(result.data==='linked')linked++;
          // All non-error statuses are deliberate decisions. Weak/conflicting
          // matches stay available in the existing manual receipt preview.
        }
      }
    }
    await save({...state,pending:state.pending!.filter(id=>id!==messageId)});checked++;
  }
  if(state.pending?.length)return {checked,linked,more:true};
  if(state.next){await save({completedAt:state.completedAt,after:state.after,before:state.before,token:state.next});return {checked,linked,more:true};}
  await save({completedAt:new Date(state.before!*1000).toISOString()});
  return {checked,linked,more:false};
}
