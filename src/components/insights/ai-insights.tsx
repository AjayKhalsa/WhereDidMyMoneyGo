"use client";

import {useEffect,useMemo,useRef,useState} from 'react';
import {Sparkles,Loader2,ArrowRight} from 'lucide-react';
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText} from '@/lib/hooks/use-privacy';
import {buildAIFacts,AI_FOCUS,type AIFocus,type AIResult} from '@/lib/ai/facts';
import {Sheet} from '@/components/ui/sheet';
import {InfoButton} from '@/components/ui/info-button';
import {TransactionList} from '@/components/transactions/transaction-list';

const FOCUS:Record<AIFocus,string>={overview:'My money',food:'Food & dining',changes:'What changed?'};
export function AIInsights(){
 const {db,month,now,cycleStartDay}=useFinance();const money=useMoneyText();
 const context=useMemo(()=>buildAIFacts({transactions:db?.transactions??[],categories:db?.categories??[],accounts:db?.accounts??[],month,cycleStartDay,now}),[db?.transactions,db?.categories,db?.accounts,month,cycleStartDay,now]);
 const [configured,setConfigured]=useState<boolean|null>(null),[focus,setFocus]=useState<AIFocus>('overview'),[result,setResult]=useState<(AIResult&{owner:string})|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const [selected,setSelected]=useState<string|null>(null),[period,setPeriod]=useState<'current'|'previous'>('current');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{const c=new AbortController();fetch('/api/ai/insights',{signal:c.signal}).then(async r=>{if(!r.ok)throw new Error('AI needs a signed-in cloud session.');return r.json();}).then(data=>setConfigured(data.configured===true)).catch(e=>{if(e.name!=='AbortError'){setConfigured(false);setError('AI is unavailable on this session.');}});return()=>c.abort();},[]);
 useEffect(()=>()=>controller.current?.abort(),[context.snapshot]);
 const current=result?.owner===db?.profile.id&&result?.snapshot===context.snapshot&&result.focus===focus?result:null;
 const fact=current?context.facts.find(f=>f.id===selected):undefined;
 const ids=fact?.currentIds?(period==='current'?fact.currentIds:fact.previousIds??[]):fact?.transactionIds??[];
 const idSet=new Set(ids),rows=(db?.transactions??[]).filter(t=>idSet.has(t.id));
 async function generate(){
  if(loading)return;const c=new AbortController();controller.current=c;setLoading(true);setError(null);
  try{const response=await fetch('/api/ai/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month,snapshot:context.snapshot,focus}),signal:c.signal});const data=await response.json();if(!response.ok){if(response.status===409){setResult(null);setSelected(null);}throw new Error(data.error??'AI could not generate insights.');}if(data.snapshot!==context.snapshot||data.focus!==focus||!Array.isArray(data.insights))throw new Error('Your ledger changed. Refresh before generating again.');setResult({...data,owner:db?.profile.id??''});}
  catch(e){if(e instanceof Error&&e.name!=='AbortError')setError(e.message);}
  finally{if(controller.current===c){controller.current=null;setLoading(false);}}
 }
 return <section aria-label="AI insights" className="rounded-2xl border border-line bg-surface p-4 sm:p-5 space-y-4">
  <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-violet-600" aria-hidden="true"/>A fresh perspective</h2><p className="mt-1 text-sm text-ink-secondary">Let Gemini connect the dots in your recorded spending.</p></div><InfoButton title="AI insights"><p>Your app calculates every figure; Gemini selects supporting facts and adds an interpretation. It cannot edit transactions, categories, balances or reminders. Check the evidence before acting.</p><p>Only summary figures, public category names and recognised public merchant brands go to Google. Unknown payees and custom categories use anonymous labels. Raw emails, notes, account names/numbers, profile details and transaction IDs are excluded.</p><p>Google’s free-tier terms may use submitted content to improve products. Generation requires a confirmed free-tier project with billing disabled. There is no paid fallback, grounding or automatic retry. Free quotas can run out. Limits and recent-result reuse are best effort within each server instance.</p><a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" className="underline">Google’s API terms</a></InfoButton></div>
  <div className="flex flex-wrap gap-2">{AI_FOCUS.map(item=><button key={item} type="button" disabled={loading} aria-pressed={item===focus} onClick={()=>{setFocus(item);setSelected(null);setError(null);}} className={`min-h-11 rounded-full border border-line px-3 text-sm ${item===focus?'bg-ink text-white':'text-ink-secondary'}`}>{FOCUS[item]}</button>)}</div>
  <button type="button" disabled={!configured||loading||!context.facts[0]?.transactionIds.length} onClick={()=>void generate()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-medium text-white disabled:opacity-50">{loading?<><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>Connecting the dots…</>:<><Sparkles className="h-4 w-4" aria-hidden="true"/>Generate AI insights</>}</button>
  {loading&&<button type="button" onClick={()=>controller.current?.abort()} className="min-h-11 text-sm underline">Cancel</button>}
  <p className="text-xs leading-relaxed text-ink-tertiary">On demand · free-tier Gemini receives summary figures. Google may use them to improve its products.</p>
  {configured===false&&!error&&<p className="text-sm text-ink-secondary">Free-tier AI setup is not active yet.</p>}
  {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
  {result&&!current&&<p className="text-sm text-ink-secondary">Generate a fresh perspective for this view.</p>}
  {current&&<div className="space-y-4">{current.insights.map((insight,i)=><article key={`${current.generatedAt}:${i}`} className="rounded-xl bg-surface-sunken p-4"><h3 className="font-semibold">{insight.heading}</h3><p className="mt-2 text-sm leading-relaxed text-ink-secondary">{insight.interpretation}</p><p className="mt-2 text-sm leading-relaxed">{insight.nextStep}</p><div className="mt-3 space-y-2">{insight.factIds.map(id=>{const f=context.facts.find(f=>f.id===id);if(!f)return null;return <button key={id} type="button" onClick={()=>{setSelected(id);setPeriod('current');}} className="block min-h-12 w-full rounded-lg border border-line bg-surface p-3 text-left"><span className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words">{f.title}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true"/></span><span className="mt-1 block text-xs text-ink-secondary">{f.metrics.slice(0,1).map(m=>`${m.label}: ${m.unit==='money'?money(m.value):m.value}`).join(' · ')}</span></button>;})}</div></article>)}<p className="text-xs text-ink-tertiary">AI interpretation · figures calculated from your ledger. Generated {new Date(current.generatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})} IST.</p></div>}
  <Sheet open={!!fact} onClose={()=>setSelected(null)} title={fact?.title} description="Verified ledger evidence" size="lg">
   {fact?.currentIds&&<div className="mb-4 flex gap-2">{(['current','previous'] as const).map(p=><button key={p} type="button" aria-pressed={period===p} onClick={()=>setPeriod(p)} className={`min-h-11 rounded-lg border border-line px-3 text-sm ${period===p?'bg-ink text-white':''}`}>{p==='current'?'This cycle':'Previous cycle'}</button>)}</div>}
   {fact&&<div className="mb-4 space-y-2">{fact.metrics.map(m=><p key={`${m.label}:${m.unit}`} className="text-sm">{m.label}: <span className="font-semibold">{m.unit==='money'?money(m.value):m.value}</span></p>)}</div>}
   <TransactionList transactions={rows} showDayTotals={false} showTime emptyTitle="No entries in this period"/>
  </Sheet>
 </section>;
}
