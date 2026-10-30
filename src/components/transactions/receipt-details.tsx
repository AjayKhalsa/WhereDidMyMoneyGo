"use client";
import {useEffect,useState} from 'react';
import {isSupabaseConfigured} from '@/lib/data/supabase-client';
import {usePrivacy} from '@/lib/hooks/use-privacy';
interface Detail {provider:string;order_id:string;restaurant:string|null;outlet_address:string|null;matchesPayment:boolean}
export function ReceiptDetails({transactionId}:{transactionId:string}){
 const [items,setItems]=useState<Detail[]>([]);const {hidden}=usePrivacy();
 useEffect(()=>{if(!isSupabaseConfigured)return;const controller=new AbortController();setItems([]);void fetch(`/api/gmail/food-receipts?transactionId=${encodeURIComponent(transactionId)}`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(!r.ok)return;const data=await r.json();if(!controller.signal.aborted)setItems(data.items??[]);}).catch(()=>{});return()=>controller.abort();},[transactionId]);
 if(!items.length)return null;
 return <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Receipt details</summary><div className="mt-2 space-y-3">{items.map(i=><div key={`${i.provider}:${i.order_id}`} className="space-y-1">
  <p className="text-sm">{i.restaurant??i.provider}</p><p className="text-xs text-ink-secondary">{i.provider}{!hidden?` · Order ${i.order_id}`:''}</p>
  {!i.matchesPayment&&<p className="text-xs text-warning">This payment changed. Recheck the receipt link.</p>}
  {i.outlet_address&&!hidden&&<details><summary className="cursor-pointer text-xs text-ink-secondary">Restaurant address from receipt</summary><p className="mt-1 break-words text-xs text-ink-secondary">{i.outlet_address}</p></details>}
 </div>)}</div></details>;
}
