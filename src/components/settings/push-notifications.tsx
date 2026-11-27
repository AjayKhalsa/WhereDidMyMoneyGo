"use client";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { notificationRequest, useNotifications } from '@/lib/hooks/use-notifications';

async function hash(endpoint:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function deviceName(){const ua=navigator.userAgent;return /iPhone|iPod/.test(ua)?'iPhone':/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'iPad':/Android/.test(ua)?'Android':/Mac/.test(ua)?'Mac':/Windows/.test(ua)?'Windows':'Browser';}
function lastSent(value:string|null){return value?new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})+' IST':'No alert sent yet';}
export function PushNotifications(){
 const {server,refresh,loading,error:statusError}=useNotifications();
 const [needsInstall,setNeedsInstall]=useState(false),[supported,setSupported]=useState(false),[permission,setPermission]=useState<NotificationPermission>('default');
 const [subscription,setSubscription]=useState<PushSubscription|null>(null),[localHash,setLocalHash]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const current=server.devices.find(d=>d.endpoint_hash===localHash),enabled=!!current&&permission==='granted';
 async function loadDevice(){
  const available='Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window;setSupported(available);
  const name=deviceName();setNeedsInstall((name==='iPhone'||name==='iPad')&&!window.matchMedia('(display-mode: standalone)').matches&&!(navigator as Navigator & {standalone?:boolean}).standalone);
  if(!available)return;
  setPermission(Notification.permission);
  const reg=await navigator.serviceWorker.getRegistration(),sub=await reg?.pushManager.getSubscription()??null;setSubscription(sub);setLocalHash(sub?await hash(sub.endpoint):'');
 }
 useEffect(()=>{void loadDevice().catch(()=>setMessage('Device status could not be loaded. Reload to try again.'));},[server.devices]);
 async function act(action:'enable'|'disable'|'test'|'reconnect'){
  setBusy(true);setMessage('');
  try{
   let sub=subscription;
   if(action==='enable'||action==='reconnect'){
    if(await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in your browser or phone settings, then try again.');
    const reg=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Reload the app to finish installing notifications.')),10000))]);
    sub=await reg.pushManager.getSubscription();
    if(action==='reconnect'&&sub){await notificationRequest({action:'disable',subscription:sub.toJSON()});await sub.unsubscribe();sub=null;}
    if(!sub){if(!server.publicKey)throw new Error('Phone alerts are not configured yet.');const key=Uint8Array.from(atob(server.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
   }
   if(!sub)throw new Error('Enable notifications on this device first.');
   await notificationRequest({action:action==='reconnect'?'enable':action,subscription:sub.toJSON(),deviceName:deviceName()});
   if(action==='disable')await sub.unsubscribe();
   setMessage(action==='test'?'Test requested. Check this device.':action==='disable'?'Alerts disabled on this device.':'Alerts enabled on this device.');
  }catch(cause){setMessage(cause instanceof Error?cause.message:'Notifications could not be updated.');}
  finally{await refresh();await loadDevice().catch(()=>{});setBusy(false);}
 }
 async function remove(key:string){setBusy(true);setMessage('');try{await notificationRequest({action:'remove-device',hash:key});await refresh();setMessage('Device removed.');}catch(cause){setMessage(cause instanceof Error?cause.message:'Device could not be removed.');}finally{setBusy(false);}}
 return <div className="space-y-3">
  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">Phone alerts</h3><span className="text-xs text-ink-secondary">{enabled?'Enabled here':'Off on this device'}</span></div>
  {needsInstall&&!enabled&&<p className="text-sm text-ink-secondary">On iPhone or iPad, add this app to your Home Screen and open it there to enable alerts.</p>}
  {loading&&!server.configured&&<p className="text-sm text-ink-secondary">Checking phone alerts…</p>}
  {!loading&&!statusError&&!server.configured&&<p className="text-sm text-ink-secondary">Phone alerts are not configured yet. Your inbox still works.</p>}
  {server.configured&&!supported&&!needsInstall&&<p className="text-sm text-ink-secondary">This browser does not support phone alerts.</p>}
  {permission==='denied'&&<p className="text-sm text-ink-secondary">Notifications are blocked. Allow them in your browser or phone settings.</p>}
  {current?.delivery_failed&&<p role="alert" className="text-sm text-danger">The last delivery failed. Try a test or reconnect this device.</p>}
  {server.configured&&supported&&(!needsInstall||enabled)&&<div className="flex flex-wrap gap-2">
   <Button disabled={busy||permission==='denied'} onClick={()=>void act(enabled?'disable':'enable')}>{enabled?'Disable here':'Enable on this device'}</Button>
   {enabled&&<Button variant="secondary" disabled={busy} onClick={()=>void act('test')}>Send test</Button>}
   {(enabled||subscription&&permission==='granted')&&<Button variant="secondary" disabled={busy} onClick={()=>void act('reconnect')}>Reconnect</Button>}
  </div>}
  {server.devices.length>0&&<details><summary className="cursor-pointer py-2 text-xs text-ink-secondary">{server.devices.length} registered {server.devices.length===1?'device':'devices'}</summary><div className="divide-y divide-line">{server.devices.map(d=><div key={d.endpoint_hash} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block text-sm">{d.device_name}{d.endpoint_hash===localHash?' · this device':''}</span><span className="block text-xs text-ink-secondary">{d.delivery_failed?'Delivery failed':lastSent(d.last_sent_at)}</span></span>{d.endpoint_hash!==localHash&&<Button variant="secondary" disabled={busy} onClick={()=>void remove(d.endpoint_hash)}>Remove</Button>}</div>)}</div></details>}
  {statusError&&<Button variant="secondary" disabled={busy||loading} onClick={()=>void refresh()}>Retry connection</Button>}
  {(message||statusError)&&<p role="status" className="break-words text-sm text-ink-secondary">{message||statusError}</p>}
 </div>;
}
