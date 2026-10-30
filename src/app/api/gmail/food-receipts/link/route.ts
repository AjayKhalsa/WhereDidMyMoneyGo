import type {NextRequest} from 'next/server';
import {admin,checkOrigin,failure,GmailError,google,json,tokenRequest,unseal,userFor} from '@/lib/gmail/server';
import {receiptMailText,authenticatedFoodReceipt,parseFoodReceipt,possibleFoodPayments} from '@/lib/gmail/food-receipts';
import {header,type MailPart} from '@/lib/gmail/alerts';
import {domainRow} from '@/lib/gmail/learning-data';
import type {Transaction} from '@/lib/domain/types';
export const maxDuration=60;
export async function POST(request:NextRequest){
 try{
  checkOrigin(request);const session=json({}),user=await userFor(request,session),db=admin(),body=await request.json();
  if(!/^[a-f0-9]{8,64}$/.test(body.messageId??'')||typeof body.transactionId!=='string'||body.transactionId.length>200||body.confirmed!==true)throw new GmailError('Choose and confirm an existing payment.');
  const connection=await db.from('gmail_connections').select('refresh_token').eq('user_id',user.id).single();if(connection.error)throw new GmailError('Reconnect Gmail to verify this receipt.',409);
  const token=await tokenRequest({grant_type:'refresh_token',refresh_token:unseal(connection.data.refresh_token,user.id)});
  const mail=await google<{payload:MailPart;internalDate:string}>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${body.messageId}?format=full`,{headers:{Authorization:`Bearer ${token.access_token}`}});
  if(!authenticatedFoodReceipt(mail.payload))throw new GmailError('This receipt sender could not be verified.',409);
  const receipt=parseFoodReceipt(header(mail.payload,'From'),header(mail.payload,'Subject'),receiptMailText(mail.payload));
  const received=new Date(Number(mail.internalDate));if(!receipt||!Number.isFinite(received.getTime()))throw new GmailError('This email is not a supported completed receipt.',409);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(received);
  const target=await db.from('transactions').select('*').eq('user_id',user.id).eq('id',body.transactionId).single();
  if(target.error||!target.data||!possibleFoodPayments(receipt,day,[domainRow<Transaction>(target.data)]).length)throw new GmailError('That payment no longer matches the receipt. Refresh and check again.',409);
  const result=await db.rpc('link_food_receipt',{p_user:user.id,p_message:body.messageId,p_transaction:body.transactionId,p_receipt:receipt,p_received:day,p_expected:target.data,p_confirmed:true});
  if(result.error)throw new GmailError('Receipt details could not be saved. Try again later.',503);
  if(!['linked','already_linked'].includes(result.data))throw new GmailError(result.data==='dismissed'?'This email was previously dismissed. Its dismissal has been preserved.':result.data==='removed'?'This receipt or payment was previously removed. It has not been restored.':'This receipt conflicts with an existing link or a changed payment. Refresh and review it.',409);
  const response=json({status:result.data,transactionId:body.transactionId});for(const cookie of session.cookies.getAll())response.cookies.set(cookie);return response;
 }catch(error){return failure(error);}
}
