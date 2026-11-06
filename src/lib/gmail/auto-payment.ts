import {accountForAlert,authenticatedSender,header,mailText,parseAlert,type Alert,type MailPart} from './alerts';
import type {admin} from './server';
import {automaticTransfer,personalIncome,type PaymentEvidence} from './payment-policy';

/** Only the authenticated sync worker calls this. Financial writes still use
 * the existing owner-serialized, source-idempotent import and link RPCs. */
export async function tryAutomaticPayment(input:{db:ReturnType<typeof admin>;userId:string;messageId:string;alert:Alert;authenticated:boolean;startDate:string;accounts:Parameters<typeof accountForAlert>[1];selfNames:string[];aliases:Record<string,string>;deadline:number;fetchMail:(id:string)=>Promise<{payload:MailPart;internalDate?:string}>}) {
 const {db,userId,messageId,alert:a}=input;
 const today=new Date(Date.now()+330*60000).toISOString().slice(0,10);
 if(!input.authenticated||!a.accountId||a.date<input.startDate||a.date>today||a.refundStatus||a.creditKind==='refund'||!input.accounts.some(x=>x.id===a.accountId&&x.isActive))return;
 if(a.creditKind==='income'||a.instrument!=='bank'&&a.creditKind!=='repayment')return;
 const needsPair=a.creditKind==='repayment'||!!a.special||a.direction==='credit';
 let plan:ReturnType<typeof automaticTransfer>;
 if(needsPair){
  const low=new Date(Date.parse(a.date)-3*86400000).toISOString().slice(0,10),high=new Date(Date.parse(a.date)+3*86400000).toISOString().slice(0,10);
  const result=await db.from('gmail_messages').select('message_id,candidate,transaction_id,status',{count:'exact'}).eq('user_id',userId).in('status',['review','logged']).eq('candidate->>amount',String(a.amount)).gte('candidate->>date',low).lte('candidate->>date',high).order('message_id').limit(9);
  if(result.error)throw result.error;
  // No incomplete peer set may establish uniqueness, including for income.
  if(result.count===null||result.count>8||result.data?.length!==result.count)return;
  const evidence:PaymentEvidence[]=[];
  for(const row of result.data??[]){
   if(row.message_id===messageId)continue;
   if(input.deadline-Date.now()<12000)return;
   if(row.status==='logged'&&!row.transaction_id)return;
   const saved=row.candidate as Alert;
   if(!saved?.accountId||saved.accountId===a.accountId||saved.amount!==a.amount)continue;
   // Pre-filter only; re-fetch and authenticate every possible companion.
   if(!automaticTransfer(a,messageId,[{messageId:row.message_id,alert:saved}],input.accounts))continue;
   const mail=await input.fetchMail(row.message_id);
   const fresh=parseAlert(header(mail.payload,'From'),header(mail.payload,'Subject'),mailText(mail.payload),mail.internalDate);
   if(!fresh||!authenticatedSender(mail.payload))return;
   fresh.accountId=accountForAlert(fresh,input.accounts as Parameters<typeof accountForAlert>[1],input.aliases);
   if(fresh.accountId!==saved.accountId||fresh.amount!==saved.amount||fresh.date!==saved.date||fresh.direction!==saved.direction||fresh.reference!==saved.reference||fresh.providerReference!==saved.providerReference)return;
   if(row.transaction_id){
    const existing=await db.from('transactions').select('id,type,amount,account_id,to_account_id,date').eq('user_id',userId).eq('id',row.transaction_id).maybeSingle();
    if(existing.error)throw existing.error;
    const t=existing.data,p=automaticTransfer(a,messageId,[{messageId:row.message_id,alert:fresh}],input.accounts);
    if(!t||!p||t.type!=='TRANSFER'||t.amount!==a.amount||t.account_id!==p.from||t.to_account_id!==p.to)return;
   }
   evidence.push({messageId:row.message_id,alert:fresh,transactionId:row.transaction_id??undefined});
  }
  // Include same-side rows when checking repeated equal CRED payments.
  const sameSide=(result.data??[]).filter(r=>r.message_id!==messageId&&r.candidate?.direction===a.direction).map(r=>({messageId:r.message_id,alert:r.candidate as Alert}));
  plan=automaticTransfer(a,messageId,[...evidence,...sameSide],input.accounts);
 }
 if(plan){
  if(plan.peer.transactionId){
   const linked=await db.rpc('gmail_match_existing',{p_user:userId,p_message:messageId,p_account:a.accountId,p_transaction:plan.peer.transactionId});
   if(linked.error)throw linked.error;return linked.data as string;
  }
  // The outgoing bank leg owns the financial date/clock. A later card or
  // bank receipt must not move the debit into a different day or cycle.
  const canonicalMessage=a.direction==='debit'?messageId:plan.peer.messageId;
  const result=await db.rpc('gmail_commit',{p_user:userId,p_message:canonicalMessage,p_type:'TRANSFER',p_account:plan.from,p_destination:plan.to,p_category:null,p_refund:false,p_reviewed:true,p_allow_duplicate:false});
  if(result.error)throw result.error;
  if(canonicalMessage!==messageId&&(result.data==='logged'||result.data==='matched')){
   const saved=await db.from('gmail_messages').select('transaction_id').eq('user_id',userId).eq('message_id',canonicalMessage).maybeSingle();
   if(saved.error)throw saved.error;if(!saved.data?.transaction_id)throw new Error('Canonical transfer source is unavailable');
   const linked=await db.rpc('gmail_match_existing',{p_user:userId,p_message:messageId,p_account:a.accountId,p_transaction:saved.data.transaction_id});
   if(linked.error)throw linked.error;
   return result.data==='logged'&&linked.data==='matched'?'logged':linked.data as string;
  }
  // Durably retry the other side through its normal authenticated pass.
  // No financial fields or intentional dismissals are changed here.
  if(result.data==='logged'||result.data==='matched'){
   const retry=await db.from('gmail_messages').update({parser_version:0}).eq('user_id',userId).eq('message_id',plan.peer.messageId).eq('status','review');
   if(retry.error)throw retry.error;
  }
  return result.data as string;
 }
 if(personalIncome(a,input.selfNames)){
  const result=await db.rpc('gmail_commit',{p_user:userId,p_message:messageId,p_type:'INCOME',p_account:a.accountId,p_destination:null,p_category:null,p_refund:false,p_reviewed:true,p_allow_duplicate:false});
  if(result.error)throw result.error;return result.data as string;
 }
}
