"use client";

import {useCallback,useEffect,useMemo,useState} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {ArrowLeft,ArrowRight,Sparkles,X,Repeat,Layers,Coins,CalendarDays,CreditCard,TrendingUp,RotateCcw,type LucideIcon} from 'lucide-react';
import {useFinance} from '@/lib/hooks/use-finance';
import {useMoneyText} from '@/lib/hooks/use-privacy';
import {formatMonthLabel} from '@/lib/domain/dates';
import {moneyReplay,type MoneyStory} from '@/lib/engine/money-replay';
import {spendingSummary} from '@/lib/engine/spending';
import {Sheet} from '@/components/ui/sheet';
import {InfoButton} from '@/components/ui/info-button';
import {TransactionList} from '@/components/transactions/transaction-list';

const ART:Record<MoneyStory['kind'],{gradient:string;icon:LucideIcon}>={
 overview:{gradient:'from-violet-950 via-violet-800 to-fuchsia-700',icon:Sparkles},
 merchant:{gradient:'from-rose-950 via-rose-800 to-orange-700',icon:Repeat},
 category:{gradient:'from-blue-950 via-indigo-800 to-violet-700',icon:Layers},
 small:{gradient:'from-teal-950 via-emerald-800 to-teal-700',icon:Coins},
 day:{gradient:'from-sky-950 via-blue-800 to-indigo-700',icon:CalendarDays},
 source:{gradient:'from-slate-950 via-slate-800 to-violet-800',icon:CreditCard},
 change:{gradient:'from-purple-950 via-purple-800 to-pink-800',icon:TrendingUp},
 refund:{gradient:'from-emerald-950 via-teal-800 to-cyan-800',icon:RotateCcw},
};

export function MoneyReplay() {
 const {db,month,cycleStartDay,now}=useFinance();
 const money=useMoneyText(),reduceMotion=useReducedMotion();
 const stories=useMemo(()=>moneyReplay({transactions:db?.transactions??[],categories:db?.categories??[],accounts:db?.accounts??[],month,cycleStartDay,now}),[db?.transactions,db?.categories,db?.accounts,month,cycleStartDay,now]);
 const [session,setSession]=useState<{month:string;id:string}|null>(null);
 const [evidence,setEvidence]=useState(false),[period,setPeriod]=useState<'current'|'previous'>('current');
 const index=stories.findIndex(s=>s.id===session?.id);
 const open=!!session&&session.month===month&&index>=0;
 const story=stories[index];
 const art=story?ART[story.kind]:ART.overview,Icon=art.icon;
 const close=useCallback(()=>{setSession(null);setEvidence(false);},[]);
 const backToStory=useCallback(()=>setEvidence(false),[]);
 useEffect(()=>{if(session&&(session.month!==month||index<0))close();},[session,month,index,close]);
 const move=(direction:number)=>{const next=stories[index+direction];if(next)setSession({month,id:next.id});};
 useEffect(()=>{
  if(!open||evidence)return;
  const handler=(event:KeyboardEvent)=>{
   if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
   if(event.key==='ArrowRight'&&stories[index+1]){event.preventDefault();setSession({month,id:stories[index+1]!.id});}
   if(event.key==='ArrowLeft'&&stories[index-1]){event.preventDefault();setSession({month,id:stories[index-1]!.id});}
  };
  document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler);
 },[open,evidence,index,stories,month]);
 const rows=story?.basis==='difference'?(period==='current'?story.currentRows:story.previousRows)??[]:story?.rows??[];
 const detailAmount=story?.basis==='difference'?spendingSummary(rows,db?.transactions??[]).spending:story?.amount??0;

 if(!stories.length)return null;
 return <>
  <button type="button" onClick={()=>{setSession({month,id:stories[0]!.id});setEvidence(false);}} aria-label="Open your money replay" className="group relative flex min-h-28 w-full items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-800 p-5 text-left text-white shadow-sm sm:p-6">
   <span aria-hidden="true" className="pointer-events-none absolute -right-5 -top-16 h-52 w-52 rounded-full border-[24px]" style={{borderColor:'rgba(255,255,255,0.08)'}}/>
   <span className="relative min-w-0"><span className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-violet-100"><Sparkles aria-hidden="true" className="h-4 w-4"/>Your cycle, replayed</span><span className="block text-2xl font-semibold tracking-tight">Your money has a story.</span><span className="mt-1 block text-sm text-violet-100">{stories.length} little chapters. All yours.</span></span><ArrowRight aria-hidden="true" className="relative h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1"/>
  </button>
  <Sheet open={open&&!evidence} onClose={close} title="Money replay" bare size="md">
   {story&&<div className={`relative isolate flex min-h-[min(78dvh,620px)] flex-col overflow-hidden rounded-2xl bg-gradient-to-br ${art.gradient} p-5 text-white sm:p-7`}>
    <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-28 -z-10 h-96 w-96 rounded-full border-[48px]" style={{borderColor:'rgba(255,255,255,0.06)'}}/>
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-32 -z-10 h-80 w-80 rounded-full border-[32px]" style={{borderColor:'rgba(255,255,255,0.06)'}}/>
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-white/80">{formatMonthLabel(month,cycleStartDay)}</span><button type="button" aria-label="Close money replay" onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-5 w-5" aria-hidden="true"/></button></div>
    <div className="flex gap-1" aria-label="Replay chapters">{stories.map((s,i)=><button type="button" key={s.id} aria-label={`View chapter ${i+1}`} aria-current={i===index?'step':undefined} onClick={()=>setSession({month,id:s.id})} className="flex h-11 min-w-0 flex-1 items-center"><span aria-hidden="true" className={`h-1 w-full rounded-full ${i===index?'bg-white':i<index?'bg-white/60':'bg-white/20'}`}/></button>)}</div>
    <div className="flex flex-1 items-center py-5">
     <AnimatePresence mode="wait" initial={false}><motion.div key={story.id} initial={reduceMotion?false:{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={reduceMotion?{opacity:1}:{opacity:0,y:-8}} transition={{duration:reduceMotion?0:.16}} className="w-full min-w-0" aria-live="polite" aria-atomic="true">
      <div aria-hidden="true" className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10"><Icon className="h-8 w-8" strokeWidth={1.5}/></div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-white/75">{story.eyebrow}</p>
      <h2 className="break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{story.title}</h2>
      <p className="mt-7 break-words text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{money(story.basis==='difference'?Math.abs(story.amount):story.amount)}</p>
      <p className="mt-1 text-sm text-white/80">{story.amountLabel}</p>
      <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/85">{story.caption}</p>
     </motion.div></AnimatePresence>
    </div>
    <button type="button" onClick={()=>{setPeriod('current');setEvidence(true);}} className="flex min-h-12 w-full items-center justify-between rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-medium hover:bg-white/20">See transactions<ArrowRight aria-hidden="true" className="h-4 w-4"/></button>
    <div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={()=>move(-1)} disabled={index===0} aria-label="Previous chapter" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-25"><ArrowLeft aria-hidden="true" className="h-5 w-5"/></button><span className="text-xs text-white/70">{index+1} / {stories.length} · recorded so far</span>{index<stories.length-1?<button type="button" onClick={()=>move(1)} aria-label="Next chapter" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-950"><ArrowRight aria-hidden="true" className="h-5 w-5"/></button>:<button type="button" onClick={close} className="min-h-11 rounded-full bg-white px-4 text-sm font-medium text-violet-950">Done</button>}</div>
   </div>}
  </Sheet>
  <Sheet open={open&&evidence} onClose={backToStory} title={story?.title} description={story?.basis==='difference'?'Equal cycle days · purchases minus refunds':story?.amountLabel} size="lg">
   {story?.basis==='difference'&&<div className="mb-4 flex gap-2">{(['current','previous'] as const).map(p=><button type="button" key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)} className={`min-h-11 rounded-lg border border-line px-3 text-sm ${period===p?'bg-ink text-white':''}`}>{p==='current'?'This cycle':'Previous cycle'}</button>)}</div>}
   <div className="mb-4 flex items-center justify-between gap-3"><p className="text-2xl font-semibold">{money(detailAmount)}</p><InfoButton title="Your money replay"><p>These chapters describe your recorded ledger. They do not judge spending, infer a visited location or prove bank coverage. Income, investments, repayments and balance adjustments are excluded.</p><p>Spending is purchases minus posted refunds. Small purchases use amounts below ₹150 before refunds. Refunds stay on their posting date; linked ones use the original merchant and category. Changes compare equal prefixes of pay cycles and show each period separately.</p></InfoButton></div>
   <TransactionList transactions={rows} showDayTotals={false} showTime emptyTitle="No transactions in this period"/>
  </Sheet>
 </>;
}
