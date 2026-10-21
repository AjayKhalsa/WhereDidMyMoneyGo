import type { NextRequest } from 'next/server';
import { admin, checkOrigin, configured, GmailError, json, userFor } from '@/lib/gmail/server';
import { endpointHash, encryptedSubscription, pushConfigured, sendPush } from '@/lib/notifications/server';
import { validSubscription } from '@/lib/notifications/subscription';
function failed(error:unknown) {return json({error:error instanceof GmailError?error.message:'Notifications could not be configured. Check migration 0021 and the server push settings.'},error instanceof GmailError?error.status:503);}
export async function GET(request:NextRequest) {
 try {
  const response=json({}),user=await userFor(request,response);
  if(!configured()||!pushConfigured())return json({configured:false});
  const r=await admin().from('push_subscriptions').select('endpoint_hash,last_sent_at,delivery_failed').eq('user_id',user.id);
  if(r.error)throw r.error;
  const out=json({configured:true,publicKey:process.env.VAPID_PUBLIC_KEY,devices:r.data});
  for(const cookie of response.cookies.getAll())out.cookies.set(cookie);
  return out;
 }catch(error){return failed(error);}
}
export async function POST(request:NextRequest) {
 try {
  checkOrigin(request);const session=json({}),user=await userFor(request,session);
  if(!configured()||!pushConfigured())throw new GmailError('Push notifications need server configuration first.',503);
  if(Number(request.headers.get('content-length')??0)>8192)throw new GmailError('Invalid subscription.');
  const text=await request.text();if(text.length>8192)throw new GmailError('Invalid subscription.');
  const body=JSON.parse(text),s=body.subscription;
  if(!validSubscription(s))throw new GmailError('This push provider or subscription is not supported.');
  const db=admin(),hash=endpointHash(s.endpoint);
  if(body.action==='disable') {
   const r=await db.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint_hash',hash);if(r.error)throw r.error;
  }else if(body.action==='enable'){
   const r=await db.rpc('register_push_subscription',{p_user:user.id,p_hash:hash,p_subscription:encryptedSubscription(s,user.id)});if(r.error)throw r.error;
  }else if(body.action==='test'){
   // Tests require an existing subscription owned by this signed-in user.
   const r=await db.from('push_subscriptions').select('endpoint_hash').eq('user_id',user.id).eq('endpoint_hash',hash).maybeSingle();if(r.error||!r.data)throw new GmailError('Enable notifications on this device first.');
   await sendPush(s,'test');
  }else throw new GmailError('Invalid notification action.');
  const response=json({ok:true});for(const c of session.cookies.getAll())response.cookies.set(c);return response;
 }catch(error){return failed(error);}
}
