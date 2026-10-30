import type {NextRequest} from 'next/server';
import {admin,checkOrigin,failure,GmailError,google,json,tokenRequest,unseal,userFor} from '@/lib/gmail/server';
import {header,mailText,type MailPart} from '@/lib/gmail/alerts';
import {authenticatedFoodReceipt,parseFoodReceipt,possibleFoodPayments,exactFoodOrder} from '@/lib/gmail/food-receipts';
import {completeLoad} from '@/lib/data/complete-load';
import {domainRow} from '@/lib/gmail/learning-data';
import type {Transaction} from '@/lib/domain/types';
import {FOOD_RECEIPT_QUERY} from '@/lib/gmail/receipt-sync';
export const maxDuration=60;
export async function POST(request:NextRequest){
 try{
  checkOrigin(request);const session=json({}),user=await userFor(request,session),db=admin();
  const body=await request.json();if(body.cursor!==undefined&&(typeof body.cursor!=='string'||body.cursor.length>2048))throw new GmailError('Invalid receipt cursor.');
  const connection=await db.from('gmail_connections').select('refresh_token').eq('user_id',user.id).single();if(connection.error)throw new GmailError('Connect Gmail first.',409);
  const token=await tokenRequest({grant_type:'refresh_token',refresh_token:unseal(connection.data.refresh_token,user.id)});
  const headers={Authorization:`Bearer ${token.access_token}`},base='https://gmail.googleapis.com/gmail/v1/users/me';
  const params=new URLSearchParams({q:`newer_than:30d -in:spam -in:trash ${FOOD_RECEIPT_QUERY}`,maxResults:'8'});if(body.cursor)params.set('pageToken',body.cursor);
  const page=await google<{messages?:{id:string}[];nextPageToken?:string}>(`${base}/messages?${params}`,{headers});
  const ledger=await completeLoad(async(from,to)=>await db.from('transactions').select('*',{count:'exact'}).eq('user_id',user.id).order('id').range(from,to),r=>r.id);
  const transactions=ledger.data.map(r=>domainRow<Transaction>(r));
  const results=await Promise.allSettled((page.messages??[]).map(async m=>{
   const mail=await google<{payload:MailPart;internalDate:string}>(`${base}/messages/${m.id}?format=full`,{headers});
   if(!authenticatedFoodReceipt(mail.payload))return {messageId:m.id,status:'unverified' as const};
   const receipt=parseFoodReceipt(header(mail.payload,'From'),header(mail.payload,'Subject'),mailText(mail.payload));
   if(!receipt)return {messageId:m.id,status:'unsupported' as const};
   const received=new Date(Number(mail.internalDate));if(!Number.isFinite(received.getTime()))return {messageId:m.id,status:'unsupported' as const};
   const receivedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(received);
   return {messageId:m.id,status:'evidence' as const,receipt,receivedDay,paymentTime:'unknown',possiblePayments:possibleFoodPayments(receipt,receivedDay,transactions).map(t=>({id:t.id,date:t.date.slice(0,10),description:t.description,accountId:t.accountId}))};
  }));
  const items=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  const orderIds=items.filter(i=>'receipt' in i&&i.receipt).map(i=>('receipt' in i?i.receipt?.orderId:'')??'');
  const saved=orderIds.length?await db.from('food_receipt_details').select('provider,order_id,transaction_id,paid_amount').eq('user_id',user.id).in('order_id',orderIds):{data:[],error:null};
  const messageIds=items.map(i=>i.messageId);
  const [dismissed,removed]=messageIds.length?await Promise.all([
   db.from('gmail_messages').select('message_id').eq('user_id',user.id).in('message_id',messageIds).in('status',['ignored','duplicate']),
   db.from('transaction_sources').select('source_key').eq('user_id',user.id).eq('source_kind','gmail').in('source_key',messageIds).is('transaction_id',null),
  ]):[{data:[],error:null},{data:[],error:null}];
  const linkingAvailable=!saved.error&&!dismissed.error&&!removed.error;
  const enriched=items.map(i=>{if(dismissed.data?.some(d=>d.message_id===i.messageId))return {...i,status:'dismissed' as const};if(!('receipt' in i)||!i.receipt)return i;if(removed.data?.some(s=>s.source_key===i.messageId))return {...i,link:{status:'removed',transactionId:null}};const link=saved.data?.find(l=>l.provider===i.receipt?.provider&&l.order_id===i.receipt?.orderId);return {...i,link:link?{status:link.paid_amount!==i.receipt.paidAmount?'conflict':link.transaction_id?'linked':'removed',transactionId:link.transaction_id}:null};});
  let automaticLinked=0,automaticFailed=0;
  for(const i of enriched){
   if(!linkingAvailable||i.status!=='evidence'||!('receipt' in i)||!i.receipt||!('receivedDay' in i)||!i.receivedDay||('link' in i&&i.link))continue;
   const receipt=i.receipt;
   const matches=possibleFoodPayments(receipt,i.receivedDay,transactions).filter(t=>exactFoodOrder(t,receipt));
   if(matches.length!==1)continue;
   const row=ledger.data.find(t=>t.id===matches[0]!.id)!;
   const linked=await db.rpc('link_food_receipt',{p_user:user.id,p_message:i.messageId,p_transaction:row.id,p_receipt:receipt,p_received:i.receivedDay,p_expected:row,p_confirmed:false});
   if(linked.error){automaticFailed++;continue;}
   if(['linked','already_linked'].includes(linked.data)){Object.assign(i,{link:{status:'linked',transactionId:row.id}});automaticLinked++;}
  }
  const response=json({items:enriched,linkingAvailable,automaticLinked,automaticFailed,failed:results.filter(r=>r.status==='rejected').length,cursor:page.nextPageToken??null,scanned:results.length});
  for(const cookie of session.cookies.getAll())response.cookies.set(cookie);return response;
 }catch(error){return failure(error);}
}

export async function GET(request:NextRequest){
 try{
  const session=json({}),user=await userFor(request,session),db=admin(),id=request.nextUrl.searchParams.get('transactionId');
  if(!id||id.length>200)throw new GmailError('Choose a transaction.');
  const result=await db.from('food_receipt_details').select('provider,order_id,restaurant,outlet_address,paid_amount,received_on').eq('user_id',user.id).eq('transaction_id',id).limit(20);
  if(result.error)throw new GmailError('Receipt details are temporarily unavailable.',503);
  const target=await db.from('transactions').select('type,amount,date').eq('user_id',user.id).eq('id',id).maybeSingle();
  if(target.error)throw new GmailError('Receipt details are temporarily unavailable.',503);
  const response=json({items:(result.data??[]).map(i=>({...i,matchesPayment:!!target.data&&target.data.type==='EXPENSE'&&target.data.amount===i.paid_amount&&Math.abs(Date.parse(target.data.date.slice(0,10)+'T12:00:00Z')-Date.parse(i.received_on+'T12:00:00Z'))<=86400000}))});for(const cookie of session.cookies.getAll())response.cookies.set(cookie);return response;
 }catch(error){return failure(error);}
}
