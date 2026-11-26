"use client";
import { useEffect, useState } from 'react';
import { InfoButton } from '@/components/ui/info-button';
import { Button, Card, Section } from '@/components/ui/primitives';

interface PushStatus {configured:boolean;publicKey?:string;devices?:{endpoint_hash:string;delivery_failed:boolean;last_sent_at?:string}[]}
async function request(action?:string,subscription?:PushSubscription){
 const response=await fetch('/api/notifications',{method:action?'POST':'GET',cache:'no-store',headers:action?{'Content-Type':'application/json'}:undefined,body:action?JSON.stringify({action,subscription:subscription?.toJSON()}):undefined});
 const body=await response.json();if(!response.ok)throw new Error(body.error??'Could not set up notifications.');return body;
}
async function hash(endpoint:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function PushNotifications(){
 const [needsInstall,setNeedsInstall]=useState(false);
 const [status,setStatus]=useState<PushStatus>();const [supported,setSupported]=useState(false);const [subscription,setSubscription]=useState<PushSubscription|null>(null);const [enabled,setEnabled]=useState(false);const [deliveryFailed,setDeliveryFailed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function load(){
  const next:PushStatus=await request();setStatus(next);
  setNeedsInstall(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.matchMedia('(display-mode: standalone)').matches&&!(navigator as Navigator & {standalone?:boolean}).standalone);
  const supported='Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window;setSupported(supported);
  if(!supported)return;
  const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager.getSubscription()??null;setSubscription(sub);
  const key=sub?await hash(sub.endpoint):undefined;const saved=next.devices?.find(d=>d.endpoint_hash===key);
  setEnabled(!!saved&&Notification.permission==='granted');setDeliveryFailed(saved?.delivery_failed??false);
 }
 useEffect(()=>{void load().catch(e=>setMessage(e.message));},[]);
 async function act(action:'enable'|'disable'|'test'){
  setBusy(true);setMessage('');
  try{
   let sub=subscription;
   if(action==='enable'){
    if(await Notification.requestPermission()!=='granted')throw new Error('Notifications were not allowed. You can enable them in your browser or phone settings.');
    const reg=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Reload the app to finish installing its notification service.')),10000))]);
    sub=await reg.pushManager.getSubscription();
    if(!sub){const key=Uint8Array.from(atob(status!.publicKey!.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
   }
   if(!sub)throw new Error('Enable notifications on this device first.');
   await request(action,sub);
   if(action==='disable')await sub.unsubscribe();
   await load();setMessage(action==='test'?'Test notification requested. Check this device.':action==='enable'?'Sync alerts enabled on this device.':'Sync alerts disabled on this device.');
  }catch(error){setMessage(error instanceof Error?error.message:'Could not configure notifications.');}finally{setBusy(false);}
 }
 return <Section title="Sync notifications" description="Alerts when email imports need attention." action={<InfoButton title="Sync notifications"><p>Alerts can arrive while the app is closed. They include no amounts or transaction details, and are limited to one sync-issue alert a day.</p><p>Alerts depend on the scheduled check running. They cannot report a check that never starts; use Gmail’s last-checked time to monitor freshness.</p></InfoButton>}>
  <Card className="space-y-3 p-4 sm:p-5">
   {needsInstall&&!enabled&&<p className="text-sm text-ink-secondary">On iPhone or iPad, open the installed Home Screen app to enable alerts.</p>}
   {status&&!status.configured&&<p className="text-sm text-ink-secondary">Notifications are not set up yet.</p>}
   {status?.configured&&!supported&&<p className="text-sm text-ink-secondary">Notifications are unavailable in this browser. Try the installed app.</p>}
   {deliveryFailed&&<p role="alert" className="text-sm text-danger">The last delivery attempt failed. Send a test notification or reconnect this device.</p>}
   {status?.configured&&supported&&<div className="flex flex-wrap gap-2">
    <Button disabled={busy} onClick={()=>void act(enabled?'disable':'enable')}>{enabled?'Disable on this device':'Enable on this device'}</Button>
    {enabled&&<Button variant="secondary" disabled={busy} onClick={()=>void act('test')}>Send test</Button>}
   </div>}
   {message&&<p role="status" className="text-sm text-ink-secondary break-words">{message}</p>}
  </Card>
 </Section>;
}
