import type {NextRequest} from 'next/server';
import {admin,checkOrigin,failure,GmailError,google,json,tokenRequest,unseal,userFor} from '@/lib/gmail/server';
import {header,mailText,type MailPart} from '@/lib/gmail/alerts';
import {authenticatedFoodReceipt,parseFoodReceipt,possibleFoodPayments} from '@/lib/gmail/food-receipts';
import {completeLoad} from '@/lib/data/complete-load';
import {domainRow} from '@/lib/gmail/learning-data';
import type {Transaction} from '@/lib/domain/types';
export const maxDuration=60;
export async function POST(request:NextRequest){
 try{
  checkOrigin(request);const session=json({}),user=await userFor(request,session),db=admin();
  const body=await request.json();if(body.cursor!==undefined&&(typeof body.cursor!=='string'||body.cursor.length>2048))throw new GmailError('Invalid receipt cursor.');
  const connection=await db.from('gmail_connections').select('refresh_token').eq('user_id',user.id).single();if(connection.error)throw new GmailError('Connect Gmail first.',409);
  const token=await tokenRequest({grant_type:'refresh_token',refresh_token:unseal(connection.data.refresh_token,user.id)});
  const headers={Authorization:`Bearer ${token.access_token}`},base='https://gmail.googleapis.com/gmail/v1/users/me';
  const params=new URLSearchParams({q:'newer_than:30d -in:spam -in:trash ((from:noreply@zomato.com subject:"Your Zomato order from") OR (from:noreply@swiggy.in subject:"order was delivered"))',maxResults:'8'});if(body.cursor)params.set('pageToken',body.cursor);
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
   return {messageId:m.id,status:'evidence' as const,receipt,receivedDay,paymentTime:'unknown',possiblePayments:possibleFoodPayments(receipt,receivedDay,transactions).map(t=>({id:t.id,date:t.date.slice(0,10),description:t.description}))};
  }));
  const response=json({items:results.filter(r=>r.status==='fulfilled').map(r=>r.value),failed:results.filter(r=>r.status==='rejected').length,cursor:page.nextPageToken??null,scanned:results.length});
  for(const cookie of session.cookies.getAll())response.cookies.set(cookie);return response;
 }catch(error){return failure(error);}
}
