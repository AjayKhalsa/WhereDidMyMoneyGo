import type { NextRequest, NextResponse } from 'next/server';
import { checkOrigin, GmailError, json, userFor } from '@/lib/gmail/server';
import { endpointHash, encryptedSubscription, pushConfigured, sendPush } from '@/lib/notifications/server';
import { validSubscription } from '@/lib/notifications/subscription';
import { notificationAdmin, notificationStateRow, notificationStatus } from '@/lib/notifications/data';
import { validNotificationKey, validNotificationPreferences } from '@/lib/notifications/model';

function cookies(response:NextResponse,session:NextResponse){for(const c of session.cookies.getAll())response.cookies.set(c);return response;}
function failed(error:unknown,session:NextResponse){return cookies(json({error:error instanceof GmailError?error.message:'Notifications could not be updated. Reload and try again.'},error instanceof GmailError?error.status:503),session);}
export async function GET(request:NextRequest){
  const session=json({});
  try{
    const user=await userFor(request,session),client=notificationAdmin();
    const [status,devices]=await Promise.all([notificationStatus(client,user.id),client.from('push_subscriptions').select('endpoint_hash,device_name,last_sent_at,last_test_at,delivery_failed,created_at').eq('user_id',user.id)]);
    if(devices.error)throw new Error('Devices unavailable');
    return cookies(json({...status,configured:pushConfigured(),publicKey:pushConfigured()?process.env.VAPID_PUBLIC_KEY:undefined,devices:devices.data}),session);
  }catch(error){return failed(error,session);}
}
export async function POST(request:NextRequest){
  const session=json({});
  try{
    checkOrigin(request);const user=await userFor(request,session),client=notificationAdmin();
    if(Number(request.headers.get('content-length')??0)>16384)throw new GmailError('Invalid notification request.');
    const text=await request.text();if(text.length>16384)throw new GmailError('Invalid notification request.');
    let body;try{body=JSON.parse(text);}catch{throw new GmailError('Invalid notification request.');}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new GmailError('Invalid notification request.');
    if(body.action==='preferences'){
      if(!validNotificationPreferences(body.preferences))throw new GmailError('Check the alert options and choose different quiet-hours start and end times.');
      const saved=await client.from('notification_preferences').upsert({user_id:user.id,settings:body.preferences,updated_at:new Date().toISOString()},{onConflict:'user_id'});
      if(saved.error)throw new Error('Preferences unavailable');
      return cookies(json({ok:true,preferences:body.preferences}),session);
    }
    if(['read','dismiss','restore'].includes(body.action)){
      if(!Array.isArray(body.keys)||!body.keys.length||body.keys.length>50||!body.keys.every(validNotificationKey))throw new GmailError('Invalid notification selection.');
      const result=await client.rpc('mark_notification_state',{p_user:user.id,p_keys:[...new Set(body.keys)],p_action:body.action});
      if(result.error)throw new Error('Read status unavailable');
      return cookies(json({ok:true,states:(result.data??[]).map(notificationStateRow)}),session);
    }
    if(body.action==='remove-device'){
      if(typeof body.hash!=='string'||!/^[a-f0-9]{64}$/.test(body.hash))throw new GmailError('Invalid device.');
      const result=await client.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint_hash',body.hash);
      if(result.error)throw new Error('Device unavailable');
      return cookies(json({ok:true}),session);
    }
    if(!['enable','disable','test'].includes(body.action))throw new GmailError('Invalid notification action.');
    if(!pushConfigured())throw new GmailError('Phone alerts are not configured yet.',503);
    const subscription=body.subscription;if(!validSubscription(subscription))throw new GmailError('This push provider or subscription is not supported.');
    const hash=endpointHash(subscription.endpoint);
    if(body.action==='disable'){
      const result=await client.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint_hash',hash);if(result.error)throw new Error('Device unavailable');
    }else if(body.action==='enable'){
      const result=await client.rpc('register_push_subscription',{p_user:user.id,p_hash:hash,p_subscription:encryptedSubscription(subscription,user.id)});if(result.error)throw new Error('Device registration failed');
      const name=typeof body.deviceName==='string'&&body.deviceName.trim().length>0&&body.deviceName.length<=80&&!/[\x00-\x1f]/.test(body.deviceName)?body.deviceName.trim():'Browser';
      const named=await client.from('push_subscriptions').update({device_name:name}).eq('user_id',user.id).eq('endpoint_hash',hash);if(named.error)throw new Error('Device update failed');
    }else if(body.action==='test'){
      const registered=await client.from('push_subscriptions').select('endpoint_hash').eq('user_id',user.id).eq('endpoint_hash',hash).maybeSingle();
      if(registered.error||!registered.data)throw new GmailError('Enable notifications on this device first.');
      const requestedAt=new Date().toISOString(),cutoff=new Date(Date.now()-60000).toISOString();
      const claim=await client.from('push_subscriptions').update({last_test_at:requestedAt}).eq('user_id',user.id).eq('endpoint_hash',hash).or(`last_test_at.is.null,last_test_at.lt.${cutoff}`).select('endpoint_hash').maybeSingle();
      if(claim.error)throw new Error('Test request failed');
      if(!claim.data)throw new GmailError('Wait a minute before sending another test.',429);
      try{
        await sendPush(subscription,'test');
        await client.from('push_subscriptions').update({last_sent_at:requestedAt,delivery_failed:false}).eq('user_id',user.id).eq('endpoint_hash',hash);
      }catch(error){
        const code=(error as {statusCode?:number}).statusCode;
        if(code===404||code===410){await client.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint_hash',hash);throw new GmailError('This subscription expired. Reconnect this device.',410);}
        await client.from('push_subscriptions').update({delivery_failed:true}).eq('user_id',user.id).eq('endpoint_hash',hash);
        throw new GmailError('The test could not be sent. Try again later or reconnect this device.',503);
      }
    }else throw new GmailError('Invalid notification action.');
    return cookies(json({ok:true}),session);
  }catch(error){return failed(error,session);}
}
