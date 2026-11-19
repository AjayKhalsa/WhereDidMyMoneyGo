"use client";
import {isSalaryIncome} from '@/lib/engine/salary-cycle';
import {useMemo,useState} from 'react';
import {Link2,ArrowDownLeft,ArrowUpRight,ShieldCheck,Search,Unlink} from 'lucide-react';
import {Sheet} from '@/components/ui/sheet';
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText} from '@/lib/hooks/use-privacy';
import {saveMoneyLinks,refreshDatabase} from '@/lib/data/store';
import {projectMoneyLinks,validateMoneyLinks} from '@/lib/engine/money-links';
import type {MoneyLink} from '@/lib/domain/types';

const newId=()=>`link_${crypto.randomUUID()}`;
export function MoneyLinkSheet({transactionId,onClose,onNavigate}:{transactionId:string;onClose:()=>void;onNavigate:(id:string)=>void}) {
 const {db,now}=useFinance();const money=useMoneyText();
 const [base,setBase]=useState<MoneyLink[]>(()=>db?.moneyLinks??[]);
 const [kind,setKind]=useState<MoneyLink['kind']>('CONTRIBUTION');
 const [amounts,setAmounts]=useState<Record<string,string>>({});
 const [changes,setChanges]=useState<Record<string,string>>({});
 const [search,setSearch]=useState('');const [error,setError]=useState('');const [saving,setSaving]=useState(false);const [saved,setSaved]=useState(false);
 const [reserve,setReserve]=useState('');const [undo,setUndo]=useState<MoneyLink[]|null>(null);
 const anchor=db?.transactions.find(t=>t.id===transactionId);
 const inbound=anchor?.type==='INCOME';
 const links=base.filter(l=>l.incomeId===transactionId||l.expenseId===transactionId);
 const next=useMemo(()=>{
  let result=base.map(l=>changes[l.id]===undefined?l:{...l,amount:Math.round(Number(changes[l.id])*100)}).filter(l=>l.amount!==0);
  // Converting reserved money into a matched allocation is atomic, not double use.
  function consumeReserve(incomeId:string,amount:number) {
   const income=db?.transactions.find(t=>t.id===incomeId);
   const used=result.filter(l=>l.incomeId===incomeId&&l.expenseId).reduce((s,l)=>s+l.amount,0);
   const reserved=result.filter(l=>l.incomeId===incomeId&&!l.expenseId).reduce((s,l)=>s+l.amount,0);
   let need=Math.max(0,used+reserved+amount-(income?.amount??0));
   result=result.map(l=>{if(l.incomeId!==incomeId||l.expenseId||need<=0)return l;const take=Math.min(need,l.amount);need-=take;return {...l,amount:l.amount-take};}).filter(l=>l.amount!==0);
  }
  for(const [id,value] of Object.entries(amounts)){
   const amount=Math.round(Number(value)*100);if(value==='')continue;
   const incomeId=inbound?transactionId:id,expenseId=inbound?id:transactionId;
   consumeReserve(incomeId,amount);
   result.push({id:`draft_${id}`,kind,incomeId,expenseId,amount,createdAt:now.toISOString()});
  }
  if(reserve!=='')result.push({id:'draft_reserve',kind,incomeId:transactionId,amount:Math.round(Number(reserve)*100),createdAt:now.toISOString()});
  return result;
 },[base,changes,amounts,reserve,kind,inbound,transactionId,db,now]);
 const preview=db?projectMoneyLinks({...db,moneyLinks:next},now):null;
 const personal=preview?.transactions.find(t=>t.id===transactionId)?.amount??anchor?.amount??0;
 const dirty=Object.keys(amounts).length>0||Object.keys(changes).length>0||reserve!=='';
 const candidates=useMemo(()=>{
  if(!db||!anchor)return [];
  const used=(id:string,source:boolean)=>base.filter(l=>source?l.incomeId===id&&l.expenseId:l.expenseId===id).reduce((s,l)=>s+l.amount,0);
  return db.transactions.filter(t=>t.id!==anchor.id&&t.type===(inbound?'EXPENSE':'INCOME')&&!t.isRefund&&t.categoryId!=='adjustment'&&t.categoryId!=='income.salary'&&!isSalaryIncome(t)&&new Date(t.date)<=now&&`${t.description} ${t.merchant??''} ${t.date}`.toLowerCase().includes(search.toLowerCase()))
   .map(t=>({...t,available:Math.max(0,t.amount-used(t.id,!inbound)),distance:Math.abs(new Date(t.date).getTime()-new Date(anchor.date).getTime())}))
   .filter(t=>t.available>0&&!links.some(l=>l.incomeId===t.id||l.expenseId===t.id))
   .sort((a,b)=>a.distance-b.distance);
 },[db,anchor,inbound,base,links,search,now]);
 if(!db||!anchor)return null;
 const existingPaired=base.filter(l=>inbound?l.incomeId===anchor.id&&l.expenseId:l.expenseId===anchor.id).reduce((s,l)=>s+l.amount,0);
 const anchorRemaining=Math.max(0,anchor.amount-existingPaired);
 async function save(){
  const invalid=validateMoneyLinks(db!.transactions,next);if(invalid){setError(invalid);return;}
  if(Object.values(amounts).some(v=>v.trim()==='')||Object.values(changes).some(v=>v.trim()==='')){setError('Enter an amount for each selected transaction.');return;}
  setSaving(true);setError('');setSaved(false);
  const committed=next.map(l=>l.id.startsWith('draft_')?{...l,id:newId()}:l);
  try{await saveMoneyLinks(base,committed);setUndo(base);setBase(committed);setChanges({});setAmounts({});setReserve('');setSaved(true);}
  catch(e){setError(e instanceof Error?e.message:'Could not save links. No partial allocations were saved.');}
  finally{setSaving(false);}
 }
 return <Sheet open onClose={onClose} title="Link money" description="Connect actual payments. Your original bank entries stay intact." size="lg" footer={<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-secondary">{saved?'Links saved':dirty?'Preview — save to apply changes':'Your saved links'}</span><button type="button" disabled={saving||!dirty} onClick={()=>void save()} className="min-h-11 rounded-xl bg-accent px-5 text-sm font-medium text-white disabled:opacity-50">{saving?'Saving…':'Save links'}</button></div>}>
  <div className="space-y-5">
   <div className="rounded-2xl bg-accent-soft p-5"><p className="text-sm font-medium">{anchor.description}</p><p className="mt-1 text-xs text-ink-secondary">{anchor.date.slice(0,10)} · {money(anchor.amount)} {inbound?'received':'paid'}</p><p className="mt-3 text-2xl font-semibold tracking-tight">{money(personal)} <span className="text-sm font-normal">{inbound?'unallocated income':'personal spending'}</span></p><p className="mt-2 text-xs text-ink-secondary">{inbound?'Allocated money is excluded from earned income. Held funds are excluded from available spending cash.':'Only linked money already received reduces spending. No expected repayments or unpaid shares are created.'}</p></div>
   <div role="group" aria-label="Link purpose" className="grid grid-cols-2 gap-2">{([{value:'CONTRIBUTION',label:'Purchase contribution',detail:'Gift, shared meal or reimbursement'},{value:'PASS_THROUGH',label:'Hold & forward',detail:'Money belonging to someone else'}] as const).map(k=><button key={k.value} type="button" aria-pressed={kind===k.value} disabled={saving} onClick={()=>{setKind(k.value);setSaved(false);}} className={`min-h-20 rounded-xl border p-3 text-left ${kind===k.value?'border-accent bg-accent-soft':'border-line'}`}><span className="block text-sm font-medium">{k.label}</span><span className="mt-1 block text-xs text-ink-secondary">{k.detail}</span></button>)}</div>
   {links.length>0&&<section className="space-y-3"><h3 className="text-sm font-semibold">Linked transactions</h3>{links.map(l=>{const other=db.transactions.find(t=>t.id===(inbound?l.expenseId:l.incomeId));return <div key={l.id} className="rounded-xl border border-line p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{other?.description??(l.kind==='PASS_THROUGH'?'Held for someone else':'Reserved purchase funding')}</p><p className="mt-1 text-xs text-ink-tertiary">{l.kind==='PASS_THROUGH'?'Hold & forward':'Purchase contribution'}{other?` · ${other.date.slice(0,10)}`:''}</p></div><button type="button" disabled={saving} aria-label={`Remove link ${other?.description??'reserved money'}`} onClick={()=>{setChanges(c=>({...c,[l.id]:'0'}));setSaved(false);}} className="min-h-10 px-2 text-ink-secondary"><Unlink size={17}/></button></div><label className="mt-3 flex items-center gap-3 text-xs">Allocated ₹<input type="number" min="0" step="0.01" aria-label={`Linked amount ${other?.description??'reserved money'}`} value={changes[l.id]??String(l.amount/100)} onChange={e=>{setChanges(c=>({...c,[l.id]:e.target.value}));setSaved(false);}} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"/></label>{other&&<button type="button" disabled={dirty||saving} onClick={()=>onNavigate(other.id)} className="mt-2 min-h-9 text-xs text-accent">View linked transaction →</button>}{changes[l.id]==='0'&&<p className="mt-2 text-xs text-warning">Will unlink when saved. Set the amount back to keep it.</p>}</div>;})}</section>}
   <section className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 size={16}/>{inbound?'Select purchases or onward payments':'Select received payments'}</h3><p className="text-xs text-ink-secondary">Closest dates first. These are suggestions, not confirmed matches. Select multiple entries and adjust the portion of each payment.</p><label className="flex items-center gap-2 rounded-xl border border-line px-3"><Search size={16} className="text-ink-tertiary"/><input aria-label="Search transactions to link" placeholder="Search name, description or date" value={search} onChange={e=>setSearch(e.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
   <div className="max-h-80 space-y-2 overflow-auto">{candidates.slice(0,40).map(t=>{const selected=amounts[t.id]!==undefined;const otherChosen=Object.entries(amounts).filter(([id])=>id!==t.id).reduce((s,[,v])=>s+Math.round(Number(v)*100),0);return <div key={t.id} className={`rounded-xl border p-3 ${selected?'border-accent bg-accent-soft':'border-line'}`}><label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" checked={selected} disabled={saving} onChange={e=>{setAmounts(a=>{const n={...a};if(e.target.checked)n[t.id]=String(Math.max(0,Math.min(t.available,anchorRemaining-otherChosen))/100);else delete n[t.id];return n;});setSaved(false);}}/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.description}</span><span className="block text-xs text-ink-tertiary">{t.date.slice(0,10)} · {t.distance<=7*86400000?'Within 7 days':'Different date'} · {money(t.available)} available</span></span><span className="shrink-0 text-sm">{money(t.amount)}</span></label>{selected&&<label className="mt-2 flex items-center gap-3 text-xs">Apply ₹<input type="number" min="0.01" step="0.01" aria-label={`Apply amount ${t.description}`} value={amounts[t.id]} onChange={e=>{setAmounts(a=>({...a,[t.id]:e.target.value}));setSaved(false);}} className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"/></label>}</div>;})}{candidates.length===0&&<p className="py-4 text-sm text-ink-secondary">No available matching entries. Try another search or add the actual transaction first.</p>}{candidates.length>40&&<p className="text-xs text-ink-tertiary">Showing the closest 40. Search to find other entries.</p>}</div></section>
   {inbound&&<details className="rounded-xl border border-line p-4"><summary className="min-h-9 cursor-pointer text-sm font-medium">{kind==='PASS_THROUGH'?'Hold money until it is forwarded':'Reserve money for a future purchase'}</summary><p className="mt-2 text-xs text-ink-secondary">This excludes the selected amount from earned income and available spending cash until it is applied or unlinked. It does not create a payment someone owes you.</p><label className="mt-3 block text-xs">Amount to hold ₹<input type="number" min="0.01" step="0.01" aria-label="Amount to hold" value={reserve} onChange={e=>{setReserve(e.target.value);setSaved(false);}} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"/></label></details>}
   {preview&&<div className="rounded-xl bg-surface-sunken p-4 text-sm"><p className="flex items-center gap-2 font-medium"><ShieldCheck size={16}/> After saving</p><p className="mt-2">{inbound?`${money(anchor.amount-personal)} allocated · ${money(personal)} remains ordinary income`:`${money(anchor.amount)} paid − ${money(anchor.amount-personal)} covered = ${money(personal)} personal spending`}</p><p className="mt-2 text-xs text-ink-secondary">Total linked funds held aside: {money(preview.held)}. Actual account balances and card dues keep the original bank amounts. Later received contributions update the original purchase's budget cycle.</p></div>}
   {undo&&!dirty&&<button type="button" disabled={saving} className="min-h-11 text-sm text-accent underline" onClick={()=>{setSaving(true);void saveMoneyLinks(base,undo).then(()=>{setBase(undo);setUndo(null);setSaved(true);}).catch(e=>setError(String(e))).finally(()=>setSaving(false));}}>Undo last link change</button>}
   {error&&<div role="alert" className="rounded-xl border border-danger/30 p-3 text-sm text-danger">{error}<button type="button" className="mt-2 block min-h-9 underline" onClick={()=>{void refreshDatabase().then(onClose).catch(e=>setError(String(e)));}}>Reload data and reopen links</button></div>}
  </div>
 </Sheet>;
}
