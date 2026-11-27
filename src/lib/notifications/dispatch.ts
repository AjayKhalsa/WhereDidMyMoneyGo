import { indiaNow } from '@/lib/domain/transaction-time';
import { unseal } from '@/lib/gmail/server';
import { notificationAdmin, notificationStatus, loadNotificationDatabase } from './data';
import { inQuietHours, moneyPushNotice, pushEligible, type MoneyNotification } from './model';
import { moneyNotifications, syncNotification } from './rules';
import { pushConfigured, sendPush } from './server';
import type { BrowserSubscription } from './subscription';

type Client=ReturnType<typeof notificationAdmin>;
type Status=Awaited<ReturnType<typeof notificationStatus>>;
interface Delivery {configured:()=>boolean;decode:(value:string,user:string)=>BrowserSubscription;send:typeof sendPush}
const delivery:Delivery={configured:pushConfigured,decode:(value,user)=>JSON.parse(unseal(value,`push:${user}`)) as BrowserSubscription,send:sendPush};
export async function dispatchAlerts(client:Client,user:string,alerts:MoneyNotification[],status:Status,now:Date,transport:Delivery=delivery) {
  if(!transport.configured()||inQuietHours(status.preferences,now))return 0;
  const eligible=pushEligible(alerts,status.states,status.preferences);
  const devices=await client.from('push_subscriptions').select('endpoint_hash,subscription').eq('user_id',user).limit(8);
  if(devices.error)throw new Error('Notification devices unavailable.');
  if(!devices.data?.length)return 0;
  let sent=0;
  for(const channel of ['money','sync'] as const){
    const batch=eligible.filter(a=>channel==='sync'?a.kind==='sync':a.kind!=='sync').slice(0,50);
    if(!batch.length)continue;
    const day=indiaNow(now).slice(0,10);
    const claim=await client.rpc('claim_notification_dispatch',{p_user:user,p_day:day,p_channel:channel,p_keys:batch.map(a=>a.key)});
    if(claim.error)throw new Error('Notification dispatch could not be claimed.');
    if(!claim.data)continue;
    const payload=moneyPushNotice(batch,status.preferences,day,channel);
    const outcomes=await Promise.all(devices.data.map(async device=>{
      try {
        const subscription=transport.decode(device.subscription,user);
        await transport.send(subscription,payload);
        await client.from('push_subscriptions').update({last_sent_at:new Date().toISOString(),delivery_failed:false}).eq('user_id',user).eq('endpoint_hash',device.endpoint_hash);
        return true;
      }catch(error){
        const code=(error as {statusCode?:number}).statusCode;
        if(code===404||code===410)await client.from('push_subscriptions').delete().eq('user_id',user).eq('endpoint_hash',device.endpoint_hash);
        else await client.from('push_subscriptions').update({delivery_failed:true}).eq('user_id',user).eq('endpoint_hash',device.endpoint_hash);
        return false;
      }
    }));
    const accepted=outcomes.some(Boolean);
    const done=await client.rpc('finish_notification_dispatch',{p_user:user,p_day:day,p_channel:channel,p_token:claim.data,p_sent:accepted});
    if(done.error||done.data!==true)throw new Error('Notification dispatch result could not be saved.');
    if(accepted)sent++;
  }
  return sent;
}
export async function checkMoneyNotifications(user:string,now=new Date()) {
  const client=notificationAdmin();
  const [data,status]=await Promise.all([loadNotificationDatabase(client,user),notificationStatus(client,user)]);
  const alerts=moneyNotifications(data,now,status.preferences,status.sync);
  // Insert defaults only when absent; never overwrite a concurrently edited preference.
  const initial=await client.from('notification_preferences').upsert({user_id:user},{onConflict:'user_id',ignoreDuplicates:true});
  if(initial.error)throw new Error('Notification check could not be recorded.');
  const touched=await client.from('notification_preferences').update({last_checked_at:new Date().toISOString()}).eq('user_id',user);
  if(touched.error)throw new Error('Notification check could not be recorded.');
  return {alerts:alerts.length,sent:await dispatchAlerts(client,user,alerts,status,now)};
}
export async function dispatchSyncIssue(user:string,kind:'failed'|'incomplete',now=new Date()) {
  const client=notificationAdmin(),status=await notificationStatus(client,user);
  const alert=syncNotification({state:kind},now,status.preferences);
  if(alert)await dispatchAlerts(client,user,[alert],status,now);
}
