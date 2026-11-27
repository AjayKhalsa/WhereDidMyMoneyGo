"use client";

import Link from 'next/link';
import { Bell, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, Section } from '@/components/ui/primitives';
import { InfoButton } from '@/components/ui/info-button';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { isSupabaseConfigured } from '@/lib/data/supabase-client';
import { validNotificationPreferences, type NotificationPreferences } from '@/lib/notifications/model';
import { PushNotifications } from './push-notifications';

export function NotificationSettings(){
 const {server,unread,savePreferences,error}=useNotifications();
 const [draft,setDraft]=useState(server.preferences),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const savedPreferences=JSON.stringify(server.preferences);
 useEffect(()=>{setDraft(server.preferences);},[savedPreferences]);
 const changed=JSON.stringify(draft)!==JSON.stringify(server.preferences);
 function toggle(key:keyof NotificationPreferences,value:boolean){setDraft(p=>({...p,[key]:value}));setMessage('');}
 async function save(){setBusy(true);setMessage('');try{await savePreferences(draft);setMessage('Preferences saved.');}catch{}finally{setBusy(false);}}
 return <div id="notifications" className="scroll-mt-8"><Section title="Notifications" action={<InfoButton title="Money alerts"><p>Scheduled checks group money alerts into at most one push a day. Sync issues have a separate daily limit. Quiet hours use India time.</p><p>Reminders use recorded payments and saved schedules. Card reminders distinguish issuer bills from estimates. Check your bank before paying.</p><p>Reading or dismissing an alert stops that alert being pushed. Resolved alerts leave the active list. A later due-date reminder can appear again.</p></InfoButton>}>
  <Card className="overflow-hidden">
   <Link href="/notifications" className="flex min-h-16 items-center gap-3 p-4 hover:bg-surface-hover"><Bell className="h-5 w-5" strokeWidth={1.8}/><span className="flex-1 text-sm font-medium">Notification inbox</span><span className="text-xs text-ink-secondary">{unread?`${unread} unread`:'All caught up'}</span><ChevronRight className="h-4 w-4"/></Link>
   <details className="border-t border-line">
    <summary className="cursor-pointer p-4 text-sm font-medium">Alert preferences</summary>
    <div className="space-y-4 px-4 pb-4">
     <div className="divide-y divide-line">
      {([['bills','Bills & cards','Due-date checks for unpaid bills and card statements.'],['budgets','Budget warnings','Limits reached, or close to the limit ahead of pace.'],['weeklyRecap','Weekly recap','Last week’s personal spending and investments.'],['syncIssues','Sync issues','Failed, overdue or unfinished email imports.']] as const).map(([key,label,description])=><label key={key} className="flex cursor-pointer items-center gap-3 py-3"><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-ink-secondary">{description}</span></span><input type="checkbox" checked={draft[key]} onChange={e=>toggle(key,e.target.checked)} className="h-5 w-5 accent-ink"/></label>)}
     </div>
     <label className="flex items-center justify-between gap-4 text-sm">Send money alerts to my devices<input type="checkbox" checked={draft.moneyPush} onChange={e=>toggle('moneyPush',e.target.checked)} className="h-5 w-5 accent-ink"/></label>
     <label className="flex items-center justify-between gap-4 text-sm">Show amounts and names in phone alerts<input type="checkbox" checked={draft.showDetails} onChange={e=>toggle('showDetails',e.target.checked)} className="h-5 w-5 accent-ink"/></label>
     <p className="text-xs text-ink-secondary">Off by default. Phone alerts stay generic; details are in the app.</p>
     <label className="flex items-center justify-between gap-4 text-sm">Quiet hours<input type="checkbox" checked={draft.quietHours} onChange={e=>toggle('quietHours',e.target.checked)} className="h-5 w-5 accent-ink"/></label>
     {draft.quietHours&&<div className="flex flex-wrap items-center gap-3 text-sm">{(['quietStart','quietEnd'] as const).map((key,i)=><label key={key}>{i?'Until':'From'}<select aria-label={i?'Quiet hours end':'Quiet hours start'} value={draft[key]} onChange={e=>{setDraft(p=>({...p,[key]:Number(e.target.value)}));setMessage('');}} className="ml-2 rounded-xl border border-line bg-surface p-2">{Array.from({length:24},(_,hour)=><option key={hour} value={hour}>{`${hour%12||12} ${hour<12?'am':'pm'}`}</option>)}</select></label>)}<span className="text-xs text-ink-secondary">IST</span></div>}
     {!validNotificationPreferences(draft)&&<p role="alert" className="text-xs text-danger">Choose different start and end times.</p>}
     <Button disabled={busy||!changed||!validNotificationPreferences(draft)} onClick={()=>void save()}>{busy?'Saving…':'Save preferences'}</Button>
     {(message||error)&&<p role={error?'alert':'status'} className="text-sm text-ink-secondary">{message||error}</p>}
    </div>
   </details>
   {isSupabaseConfigured&&<div className="border-t border-line p-4"><PushNotifications/></div>}
  </Card>
 </Section></div>;
}
