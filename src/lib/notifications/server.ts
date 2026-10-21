import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { admin, seal, unseal } from '@/lib/gmail/server';
import { indiaNow } from '@/lib/domain/transaction-time';
import { validSubscription, syncNotice, type BrowserSubscription } from './subscription';

export function pushConfigured() {
 return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && /^(mailto:|https:\/\/)/.test(process.env.VAPID_SUBJECT??'');
}
export const endpointHash=(endpoint:string)=>createHash('sha256').update(endpoint).digest('hex');
export const encryptedSubscription=(s:BrowserSubscription,user:string)=>seal(JSON.stringify(s),`push:${user}`);
export async function sendPush(s:BrowserSubscription,kind:'failed'|'incomplete'|'test') {
 if(!validSubscription(s)||!pushConfigured())throw new Error('Push configuration unavailable');
 await webpush.sendNotification(s,JSON.stringify(syncNotice(kind)),{TTL:3600,timeout:5000,vapidDetails:{subject:process.env.VAPID_SUBJECT!,publicKey:process.env.VAPID_PUBLIC_KEY!,privateKey:process.env.VAPID_PRIVATE_KEY!}});
}
/** Best effort only: a notification failure must never change a sync result.
 * Claim once per IST day before sending, preventing concurrent spam. */
export async function notifySyncIssue(user:string,kind:'failed'|'incomplete') {
 if(!pushConfigured())return;
 try {
  const db=admin(),key=indiaNow().slice(0,10);
  const result=await db.from('push_subscriptions').select('endpoint_hash,subscription').eq('user_id',user).limit(8);
  if(result.error)return;
  await Promise.all((result.data??[]).map(async row=>{
   const claimed=await db.from('push_subscriptions').update({last_notice:key}).eq('user_id',user).eq('endpoint_hash',row.endpoint_hash).or(`last_notice.is.null,last_notice.neq.${key}`).select('endpoint_hash');
   if(claimed.error||!claimed.data?.length)return;
   try {
    const s=JSON.parse(unseal(row.subscription,`push:${user}`));await sendPush(s,kind);
    await db.from('push_subscriptions').update({last_sent_at:new Date().toISOString(),delivery_failed:false}).eq('user_id',user).eq('endpoint_hash',row.endpoint_hash);
   } catch(error) {
    const status=(error as {statusCode?:number}).statusCode;
    if(status===404||status===410)await db.from('push_subscriptions').delete().eq('user_id',user).eq('endpoint_hash',row.endpoint_hash);
    else await db.from('push_subscriptions').update({delivery_failed:true}).eq('user_id',user).eq('endpoint_hash',row.endpoint_hash);
   }
  }));
 } catch { /* No credentials, endpoint tokens or upstream messages in logs. */ }
}
