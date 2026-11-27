import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { seal } from '@/lib/gmail/server';
import { validSubscription, syncNotice, type BrowserSubscription } from './subscription';
import type { PushNotice } from './model';

export function pushConfigured() {
 return !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && /^(mailto:|https:\/\/)/.test(process.env.VAPID_SUBJECT??'');
}
export const endpointHash=(endpoint:string)=>createHash('sha256').update(endpoint).digest('hex');
export const encryptedSubscription=(s:BrowserSubscription,user:string)=>seal(JSON.stringify(s),`push:${user}`);
export async function sendPush(s:BrowserSubscription,kind:'failed'|'incomplete'|'test'|PushNotice) {
 if(!validSubscription(s)||!pushConfigured())throw new Error('Push configuration unavailable');
 await webpush.sendNotification(s,JSON.stringify(typeof kind==='string'?syncNotice(kind):kind),{TTL:3600,timeout:5000,vapidDetails:{subject:process.env.VAPID_SUBJECT!,publicKey:process.env.VAPID_PUBLIC_KEY!,privateKey:process.env.VAPID_PRIVATE_KEY!}});
}
/** Best effort only: a notification failure must never change a sync result.
 * Claim once per IST day before sending, preventing concurrent spam. */
export async function notifySyncIssue(user:string,kind:'failed'|'incomplete') {
 if(!pushConfigured())return;
 try {
  const {dispatchSyncIssue}=await import('./dispatch');
  await dispatchSyncIssue(user,kind);
 } catch { /* No credentials, endpoint tokens or upstream messages in logs. */ }
}
