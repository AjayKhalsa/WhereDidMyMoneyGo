"use client";
import {useState} from 'react';
import type {FoodReceipt} from '@/lib/gmail/food-receipts';
import {useMoneyText,usePrivacy} from '@/lib/hooks/use-privacy';
import {useFinance} from '@/lib/hooks/use-finance';
import {Button} from '@/components/ui/primitives';
interface Item {messageId:string;status:string;receipt?:FoodReceipt;receivedDay?:string;possiblePayments?:{id:string;date:string;description:string;accountId?:string}[];link?:{status:string;transactionId:string|null}|null}
export function FoodReceipts(){
 const [items,setItems]=useState<Item[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[summary,setSummary]=useState(''),[available,setAvailable]=useState(false),[choices,setChoices]=useState<Record<string,string>>({}),[confirmed,setConfirmed]=useState<Record<string,boolean>>({});
 const money=useMoneyText(),{hidden}=usePrivacy(),{db}=useFinance();
 async function scan(next=false){setBusy(true);setError('');try{
  const response=await fetch('/api/gmail/food-receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next?{cursor}:{}),cache:'no-store'});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Receipt check failed.');
  setItems(old=>next?[...new Map([...old,...data.items].map((i:Item)=>[i.messageId,i])).values()]:data.items);setCursor(data.cursor);setAvailable(data.linkingAvailable===true);
  setSummary(`This batch: ${data.scanned} checked · ${data.automaticLinked??0} receipts linked automatically · ${data.failed+(data.automaticFailed??0)} failed. ${data.cursor?'More receipts remain.':'Reached the end of this 30-day search.'}`);
 }catch(e){setError(e instanceof Error?e.message:'Receipt check failed.');}finally{setBusy(false);}}
 async function link(i:Item){setBusy(true);setError('');try{
  const response=await fetch('/api/gmail/food-receipts/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messageId:i.messageId,transactionId:choices[i.messageId],confirmed:confirmed[i.messageId]===true}),cache:'no-store'});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Receipt could not be linked.');
  setItems(old=>old.map(item=>item.messageId===i.messageId?{...item,link:{status:'linked',transactionId:data.transactionId}}:item));
 }catch(e){setError(e instanceof Error?e.message:'Receipt could not be linked.');}finally{setBusy(false);}}
 const saved=items.filter(i=>i.link?.status==='linked').length;
 return <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Restaurant & receipt details</summary>
  <div className="mt-3 space-y-3"><p className="text-xs text-ink-secondary">Exact order references link automatically. Confirm other matches once; amounts, dates and your labels stay unchanged. Delivery addresses are excluded.</p>
  <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void scan()}>{busy?'Checking…':'Check recent receipts'}</Button>{cursor&&<Button size="sm" disabled={busy} onClick={()=>void scan(true)}>Next batch</Button>}</div>
  {error&&<p role="alert" className="text-sm text-danger">{error}</p>}{summary&&<p role="status" className="text-xs text-ink-secondary">{summary}</p>}
  {items.some(i=>i.status==='dismissed')&&<p className="text-xs text-ink-secondary">Previously dismissed receipts remain hidden.</p>}
  {saved>0&&<p className="text-xs text-ink-secondary">{saved} receipts already attached · hidden from this list.</p>}
  {summary&&!available&&<p className="text-xs text-ink-secondary">Receipt preview is available. Saving details is temporarily unavailable.</p>}
  {items.filter(i=>i.receipt&&i.status!=='dismissed'&&i.link?.status!=='linked').map(i=><article key={i.messageId} className="border-t border-line pt-3 space-y-2">
   <p className="text-sm font-medium">{i.receipt!.restaurant??i.receipt!.provider} · {money(i.receipt!.paidAmount)}</p>
   <p className="text-xs text-ink-secondary">{i.receipt!.provider} · received {i.receivedDay} · payment time unknown</p>
   {!hidden&&<p className="text-xs text-ink-secondary">Order {i.receipt!.orderId}</p>}
   {i.receipt!.outletAddress&&!hidden&&<details><summary className="text-xs cursor-pointer">Restaurant address from receipt</summary><p className="text-xs break-words">{i.receipt!.outletAddress}</p></details>}
   {i.link?.status==='removed'?<p className="text-xs text-ink-secondary">Its linked payment was removed. It will not be recreated.</p>:i.link?.status==='conflict'?<p className="text-xs text-warning">This order conflicts with a saved receipt. Its existing link has been preserved.</p>:<>
    <p className="text-xs text-ink-secondary">{i.possiblePayments?.length?`${i.possiblePayments.length} possible payment${i.possiblePayments.length===1?'':'s'}. Verify before attaching.`:'No matching platform payment found in the comparison window. This does not prove a payment is missing.'}</p>
    {!!i.possiblePayments?.length&&available&&<>
     <label className="block text-xs text-ink-secondary">Existing payment<select aria-label={`Payment for ${i.receipt!.provider} receipt`} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface p-2 text-sm" value={choices[i.messageId]??''} onChange={e=>{setChoices(c=>({...c,[i.messageId]:e.target.value}));setConfirmed(c=>({...c,[i.messageId]:false}));}}><option value="">Choose a payment</option>{i.possiblePayments.map(t=><option key={t.id} value={t.id}>{t.date} · {t.description} · {db?.accounts.find(a=>a.id===t.accountId)?.name??'Account unknown'}</option>)}</select></label>
     <label className="flex items-start gap-2 py-2 text-xs text-ink-secondary"><input type="checkbox" checked={confirmed[i.messageId]??false} onChange={e=>setConfirmed(c=>({...c,[i.messageId]:e.target.checked}))}/>I checked that this receipt belongs to the selected payment.</label>
     <Button size="sm" disabled={busy||!choices[i.messageId]||!confirmed[i.messageId]} onClick={()=>void link(i)}>Attach receipt details</Button>
    </>}
   </>}
  </article>)}
  {items.length>0&&<p className="text-xs text-ink-tertiary">{items.filter(i=>i.status==='unsupported').length} unsupported · {items.filter(i=>i.status==='unverified').length} unverified sender.</p>}
  </div>
 </details>;
}
