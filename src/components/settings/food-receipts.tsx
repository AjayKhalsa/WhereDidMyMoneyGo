"use client";
import {useState} from 'react';
import type {FoodReceipt} from '@/lib/gmail/food-receipts';
import {useMoneyText,usePrivacy} from '@/lib/hooks/use-privacy';
import {Button} from '@/components/ui/primitives';
interface Item {messageId:string;status:string;receipt?:FoodReceipt;receivedDay?:string;possiblePayments?:{id:string;date:string;description:string}[]}
export function FoodReceipts(){
 const [items,setItems]=useState<Item[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[summary,setSummary]=useState('');
 const money=useMoneyText(),{hidden}=usePrivacy();
 async function scan(next=false){setBusy(true);setError('');try{
  const response=await fetch('/api/gmail/food-receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next?{cursor}:{}),cache:'no-store'});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Receipt check failed.');
  setItems(old=>next?[...new Map([...old,...data.items].map((i:Item)=>[i.messageId,i])).values()]:data.items);setCursor(data.cursor);
  setSummary(`This batch: ${data.scanned} checked · ${data.failed} failed. ${data.cursor?'More receipts remain.':'Reached the end of this 30-day search.'}`);
 }catch(e){setError(e instanceof Error?e.message:'Receipt check failed.');}finally{setBusy(false);}}
 return <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Restaurant & receipt details · preview</summary>
  <div className="mt-3 space-y-3"><p className="text-xs text-ink-secondary">Check recent food receipts for richer restaurant details. This preview does not import payments, change labels or save addresses. Suggested payments require verification.</p>
  <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void scan()}>{busy?'Checking…':'Check recent receipts'}</Button>{cursor&&<Button size="sm" disabled={busy} onClick={()=>void scan(true)}>Next batch</Button>}</div>
  {error&&<p role="alert" className="text-sm text-danger">{error}</p>}{summary&&<p role="status" className="text-xs text-ink-secondary">{summary}</p>}
  {items.filter(i=>i.receipt).map(i=><article key={i.messageId} className="border-t border-line pt-3 space-y-1">
   <p className="text-sm font-medium">{i.receipt!.restaurant??i.receipt!.provider} · {money(i.receipt!.paidAmount)}</p>
   <p className="text-xs text-ink-secondary">{i.receipt!.provider} · received {i.receivedDay} · payment time unknown</p>
   {!hidden&&<p className="text-xs text-ink-secondary">Order {i.receipt!.orderId}</p>}
   {i.receipt!.outletAddress&&!hidden&&<details><summary className="text-xs cursor-pointer">Restaurant address from receipt</summary><p className="text-xs break-words">{i.receipt!.outletAddress}</p></details>}
   <p className="text-xs text-ink-secondary">{i.possiblePayments?.length?`${i.possiblePayments.length} possible ledger payment${i.possiblePayments.length===1?'':'s'}; amount and date alone do not prove a link.`:'No matching platform payment found in the comparison window. This does not prove a payment is missing.'}</p>
  </article>)}
  {items.length>0&&<p className="text-xs text-ink-tertiary">{items.filter(i=>i.status==='unsupported').length} unsupported · {items.filter(i=>i.status==='unverified').length} unverified sender. Delivery addresses are excluded.</p>}
  </div>
 </details>;
}
