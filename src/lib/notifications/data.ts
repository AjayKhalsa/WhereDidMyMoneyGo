import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/domain/types';
import { completeLoad } from '@/lib/data/complete-load';
import { domainRow } from '@/lib/gmail/learning-data';
import { notificationPreferences, type NotificationState, type NotificationSync } from './model';

export function notificationAdmin() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Notification server configuration unavailable.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
type Client=ReturnType<typeof notificationAdmin>;
export function notificationStateRow(row: Record<string, unknown>): NotificationState {
  return {key:String(row.event_key),readAt:row.read_at as string|null,dismissedAt:row.dismissed_at as string|null,pushedAt:row.pushed_at as string|null,updatedAt:String(row.updated_at)};
}
export async function notificationStatus(client: Client,user: string) {
  const [preferences,states,sync]=await Promise.all([
    client.from('notification_preferences').select('settings,last_checked_at').eq('user_id',user).maybeSingle(),
    completeLoad<Record<string,unknown>>((from,to)=>client.from('notification_state').select('event_key,read_at,dismissed_at,pushed_at,updated_at',{count:'exact'}).eq('user_id',user).order('event_key').range(from,to),r=>String(r.event_key)),
    client.rpc('notification_sync_status',{p_user:user}),
  ]);
  if(preferences.error||sync.error)throw new Error('Notification status could not be loaded.');
  return {preferences:notificationPreferences(preferences.data?.settings),states:Object.fromEntries(states.data.map(row=>{const value=notificationStateRow(row);return[value.key,value]})),sync:sync.data as NotificationSync,lastCheckedAt:preferences.data?.last_checked_at as string|null??null};
}
/** Counted, ordered, owner-scoped loads. A partial financial snapshot cannot trigger reminders. */
export async function loadNotificationDatabase(client: Client,user: string): Promise<Database> {
  const load=(table:string)=>completeLoad<Record<string,unknown>>((from,to)=>client.from(table).select('*',{count:'exact'}).eq('user_id',user).order('id').range(from,to),r=>String(r.id));
  const [profile,...collections]=await Promise.all([client.from('profiles').select('*').eq('id',user).single(),...['accounts','credit_cards','categories','transactions','recurring','goals','investments','income_sources','money_links'].map(load)]);
  if(profile.error||!profile.data)throw new Error('Notification financial data could not be loaded.');
  const [accounts,creditCards,categories,transactions,recurring,goals,investments,incomeSources,moneyLinks]=collections.map(c=>(c as Awaited<ReturnType<typeof load>>).data.map(row=>domainRow(row)));
  return {profile:domainRow(profile.data),accounts,creditCards,categories,transactions,recurring,goals,investments,incomeSources,moneyLinks,rules:[],people:[],splits:[]} as Database;
}
