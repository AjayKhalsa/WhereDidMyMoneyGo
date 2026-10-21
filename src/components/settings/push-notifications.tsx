"use client";
import { useEffect, useState } from 'react';
import { Button, Card, Section } from '@/components/ui/primitives';

interface PushStatus {configured:boolean;publicKey?:string;devices?:{endpoint_hash:string;delivery_failed:boolean;last_sent_at?:string}[]}
async function request(action?:string,subscription?:PushSubscription){
 const response=await fetch('/api/notifications',{method:action?'POST':'GET',cache:'no-store',headers:action?{'Content-Type':'application/json'}:undefined,body:action?JSON.stringify({action,subscription:subscription?.toJSON()}):undefined});
 const body=await response.json();if(!response.ok)throw new Error(body.error??'Could not set up notifications.');return body;
}
async function hash(endpoint:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function PushNotifications(){
 const [status,setStatus]=useState<PushStatus>();const [supported,setSupported]=useState(false);const [subscription,setSubscription]=useState<PushSubscription|null>(null);const [enabled,setEnabled]=useState(false);const [deliveryFailed,setDeliveryFailed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function load(){
  const next:PushStatus=await request();setStatus(next);
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
   await load();setMessage(action==='test'?'Test notification sent to your push provider. Check this device.':action==='enable'?'Sync alerts enabled on this device.':'Sync alerts disabled on this device.');
  }catch(error){setMessage(error instanceof Error?error.message:'Could not configure notifications.');}finally{setBusy(false);}
 }
 return <Section title="Phone & browser notifications" description="Get an alert when a scheduled Gmail sync fails or leaves a backlog.">
  <Card className="space-y-3 p-4 sm:p-5">
   <p className="text-sm text-ink-secondary">Alerts can arrive while the app is closed. They contain no amounts or transaction details. On iPhone or iPad, add this app to your Home Screen and open it there before enabling notifications.</p>
   {status&&!status.configured&&<p className="text-sm text-ink-secondary">Push notifications are not ready on the server yet. Once setup is complete, you can enable this device here.</p>}
   {status?.configured&&!supported&&<p className="text-sm text-ink-secondary">This browser does not currently support push notifications. Try the installed Home Screen app on a supported device.</p>}
   {deliveryFailed&&<p role="alert" className="text-sm text-danger">The last delivery attempt failed. Send a test notification or reconnect this device.</p>}
   {status?.configured&&supported&&<div className="flex flex-wrap gap-2">
    <Button disabled={busy} onClick={()=>void act(enabled?'disable':'enable')}>{enabled?'Disable on this device':'Enable on this device'}</Button>
    {enabled&&<Button variant="secondary" disabled={busy} onClick={()=>void act('test')}>Send test notification</Button>}
   </div>}
   {message&&<p role="status" className="text-sm text-ink-secondary break-words">{message}</p>}
   <p className="text-xs text-ink-tertiary">At most one sync issue alert per day. These alerts depend on the scheduled job running; they cannot detect a scheduler that never starts.</p>
  </Card>
 </Section>;
}
