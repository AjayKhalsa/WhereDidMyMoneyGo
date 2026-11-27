"use client";
import {useInsightNarrative} from './insight-analysis-provider';
import {useMaskedProse} from '@/lib/hooks/use-privacy';

import { useId, useMemo, useState } from "react";
import { LazyDetails } from "@/components/ui/lazy-details";
import { BudgetCategoryList, BudgetMappingEditor } from "./budget-details";
import { ArrowDownRight, ArrowUpRight, SlidersHorizontal, Wallet, TrendingUp, Check, ChevronDown } from "lucide-react";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { saveProfile } from "@/lib/data/store";
import { allocation, compareBudgets, defaultBudget, validateBudget, type BudgetPlan } from "@/lib/engine/budgets";

function BudgetSlider({label,value,max,onChange,detail}:{label:string;value:number;max:number;onChange:(v:number)=>void;detail?:string}) {
  const money=useMoneyText();
  return <label className="budget-slider-card">
    <span className="flex items-start justify-between gap-3"><span className="text-sm font-medium">{label}</span><span className="shrink-0 text-lg font-semibold tracking-tight">{money(value)}</span></span>
    <input aria-label={label} aria-valuetext={money(value)} type="range" min={label==="Monthly salary"?100000:0} max={Math.max(max,value)} step={10000} value={value} onChange={e=>onChange(Number(e.target.value))} className="budget-slider"/>
    <span className="flex justify-between text-xs text-ink-tertiary"><span>{detail??"Slide to adjust · steps of ₹100"}</span><span>{money(Math.max(max,value))}</span></span>
  </label>;
}

export function BudgetPanel() {
  const narrative=useInsightNarrative('budget'),prose=useMaskedProse();
  const {db,budget,month,now,cycleStartDay}=useFinance();
  const money=useMoneyText();
  const editorId=useId();
  const comparison=useMemo(()=>db&&budget?compareBudgets(db,month,now,cycleStartDay,budget):null,[db,budget,month,now,cycleStartDay]);
  const [draft,setDraft]=useState<BudgetPlan|null>(null);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editorExpanded,setEditorExpanded]=useState<boolean|null>(null);
  if(!db||!budget||!comparison) return null;
  const plan=draft??budget.plan;
  const configured=(db.profile.budgetPlans??[]).some(p=>p.effectiveFrom<=month);
  const allocated=allocation(plan),unallocated=plan.salary-allocated;
  const editorOpen=editorExpanded??!configured;
  const latest=db.transactions.filter(t=>new Date(t.date)<=now).map(t=>t.date.slice(0,10)).sort().at(-1);
  const improving=comparison.delta<0;
  const ShiftIcon=improving?ArrowDownRight:ArrowUpRight;
  const changeCopy=!comparison.hasPrior?"Add last month's transactions to unlock a fair comparison.":comparison.delta===0?"Spending is unchanged from the same point last cycle.":`${money(Math.abs(comparison.delta))} ${improving?"less":"more"} than the same point last cycle${comparison.percent!==null?` (${Math.abs(comparison.percent)}%)`:""}.`;
  const biggestOver=[...budget.buckets].filter(b=>b.remaining<0).sort((a,b)=>a.remaining-b.remaining)[0];
  const daysLeft=Math.max(0,budget.days-budget.elapsed);
  const pace=budget.elapsed<5?"A few more days will make the forecast useful.":budget.projected>budget.limit?`At this pace, spending would finish ${money(budget.projected-budget.limit)} above your plan.`:"Your recorded spending pace fits within this month's plan.";
  function update(next:BudgetPlan) {setDraft(next);setSaved(false);setError("");}
  async function save() {
    if(!db) return;
    const next={...plan,effectiveFrom:month};
    const invalid=validateBudget(next);if(invalid){setError(invalid);return;}
    setSaving(true);setError("");
    try {await saveProfile({...db.profile,budgetPlans:[...(db.profile.budgetPlans??[]).filter(p=>p.effectiveFrom!==month),next]});setDraft(null);setSaved(true);setEditorExpanded(false);}
    catch(e){setError(e instanceof Error?e.message:"Couldn't save. Your previous plan is unchanged.");}
    finally{setSaving(false);}
  }

  return <div className="space-y-6" aria-label="Monthly budget">
    <section className="budget-hero">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm opacity-80"><Wallet size={17}/> Your month, with intention</span><span className="rounded-full border border-white/20 px-3 py-1 text-xs">{configured?"Saved monthly plan":"Your starting plan"}</span></div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2"><div><p className="text-sm opacity-75">Spent so far</p><p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{money(budget.spent)}</p><p className="mt-2 text-sm opacity-75">of {money(budget.limit)} planned spending</p></div><div className="sm:border-l sm:border-white/20 sm:pl-6"><p className="text-sm opacity-75">{budget.remaining<0?"Beyond your plan":"Room left this cycle"}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{money(Math.abs(budget.remaining))}</p><p className="mt-2 text-sm opacity-75">{budget.remaining>0&&daysLeft>0?`${money(Math.floor(budget.remaining/daysLeft))} a day across ${daysLeft} remaining days`:budget.remaining<0?"Shift spending down to protect your investment plan.":"This cycle's allowance is fully used."}</p></div></div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white/85" style={{width:`${budget.limit>0?Math.min(100,Math.max(0,budget.spent/budget.limit*100)):0}%`}}/></div>
      <p className="mt-3 text-xs opacity-70">Latest recorded entry: {latest??"none yet"}. Figures reflect imported transactions, not live bank balances.</p>
    </section>

    <section className="grid gap-4 md:grid-cols-2" aria-label="Budget insights">
      <div className="visual-card"><span className="budget-eyebrow">Compared with last cycle</span><div className="mt-3 flex items-start gap-3"><span className={`rounded-xl p-2 ${comparison.hasPrior&&improving?"bg-positive-soft text-positive":"bg-accent-soft text-accent"}`}><ShiftIcon size={22}/></span><div><h2 className="font-semibold">{!comparison.hasPrior?"Your baseline starts here":comparison.delta===0?"Holding steady":improving?"Recorded spending is lower":"Spending is running higher"}</h2><p className="mt-1 text-sm text-ink-secondary">{changeCopy}</p></div></div><p className="mt-4 text-xs text-ink-tertiary">First {comparison.matchedDays} days in each cycle, using the same category mappings. {budget.remaining<0?`Still ${money(-budget.remaining)} above your spending plan.`:`${money(budget.remaining)} remains in your spending plan.`}</p></div>
      <div className="visual-card"><span className="budget-eyebrow">Your next useful move</span><h2 className="mt-3 font-semibold">{biggestOver?`Focus on ${biggestOver.label.toLowerCase()}`:budget.remaining>0?"Keep the room you've created":"Review before your next purchase"}</h2><p className="mt-2 text-sm text-ink-secondary">{biggestOver?`${money(biggestOver.actual)} spent against ${money(biggestOver.limit)}. This is the largest category overrun, at ${money(-biggestOver.remaining)}.`:daysLeft>0?`Keep spending within ${money(Math.max(0,Math.floor(budget.remaining/daysLeft)))} a day for the remaining ${daysLeft} days to stay within your plan.`:"Use this completed cycle to set your next month’s allowances."}</p><p className="mt-3 text-xs text-ink-tertiary">{narrative?prose(narrative.interpretation+' '+narrative.nextStep):pace+' Projections follow recorded spending; one-off purchases and missing imports can skew them.'}</p></div>
    </section>

    {comparison.hasPrior&&comparison.changes.length>0&&<section className="visual-card"><div className="flex items-center gap-2"><TrendingUp size={18} className="text-accent"/><h2 className="font-semibold">What changed?</h2></div><p className="mt-1 text-sm text-ink-secondary">The biggest shifts versus the same {comparison.matchedDays} days last cycle.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{comparison.changes.slice(0,3).map(c=><div key={c.id} className="inset-panel bg-surface-sunken p-4"><p className="text-sm">{c.label}</p><p className={`mt-2 text-xl font-semibold ${c.delta<0?"text-positive":"text-danger"}`}>{c.delta<0?"−":"+"}{money(Math.abs(c.delta))}</p><p className="mt-1 text-xs text-ink-tertiary">{money(c.previous)} → {money(c.actual)}</p></div>)}</div></section>}

    <section className="visual-card" aria-label="Adjustable budget plan">
      <button type="button" aria-label="Monthly plan" aria-expanded={editorOpen} aria-controls={editorOpen?editorId:undefined} onClick={()=>setEditorExpanded(!editorOpen)} className="flex min-h-11 w-full items-center justify-between gap-4 text-left">
        <span className="min-w-0"><span className="flex items-center gap-2 text-lg font-semibold"><SlidersHorizontal size={18}/> Monthly plan</span><span className="mt-1 block text-sm text-ink-secondary">{money(budget.investmentTarget)} investments · {money(budget.limit)} spending · {money(budget.plan.emergency)} emergency savings</span><span className="mt-1 block text-xs text-ink-tertiary">{draft?"Unsaved changes — expand to continue editing":saved?"Plan saved — tap to adjust":configured?"Tap to view or adjust your saved plan":"Expand to set your monthly plan"}</span></span>
        <ChevronDown aria-hidden="true" size={20} className={`shrink-0 text-ink-tertiary transition-transform ${editorOpen?"rotate-180":""}`}/>
      </button>
      {budget.investmentOverride&&<p className="mt-2 text-xs text-ink-secondary">Investment target for this cycle: {money(budget.investmentTarget)} from Money. Usual budget allocation: {money(budget.plan.investment)}. <a href="/money" className="underline">Adjust targets</a></p>}
      {editorOpen&&<div id={editorId} className="mt-5 space-y-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ink-secondary">Slide to adjust. Changes are previews until saved.</p><button type="button" className="min-h-11 rounded-xl border border-line px-4 text-sm" disabled={saving} onClick={()=>update(defaultBudget())}>Reset defaults</button></div>
      <div className={`inset-panel p-4 ${unallocated<0?"bg-danger-soft text-danger":"bg-accent-soft text-accent-ink"}`} aria-live="polite"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{money(allocated)} allocated of {money(plan.salary)}</span><strong>{money(Math.abs(unallocated))} {unallocated<0?"over salary":unallocated===0?"· every rupee assigned":"unallocated"}</strong></div><div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/60">{[{amount:plan.investment,color:"bg-accent"},{amount:plan.buckets.reduce((s,b)=>s+b.limit,0),color:"bg-warning"},{amount:plan.emergency,color:"bg-positive"}].map((s,i)=><div key={i} className={s.color} style={{width:`${plan.salary>0?s.amount/plan.salary*100:0}%`}}/>)}</div><div className="mt-2 flex flex-wrap gap-4 text-xs"><span>● Investments</span><span>● Spending</span><span>● Emergency savings</span></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><BudgetSlider label="Monthly salary" value={plan.salary} max={Math.max(30000000,budget.plan.salary*2)} onChange={salary=>update({...plan,salary})}/><BudgetSlider label="Investments" value={plan.investment} max={plan.salary} detail={`${money(budget.invested)} invested this cycle · all investment types`} onChange={investment=>update({...plan,investment})}/><BudgetSlider label="Emergency savings" value={plan.emergency} max={plan.salary} detail={`${money(budget.emergency)} in linked emergency-goal transfers`} onChange={emergency=>update({...plan,emergency})}/></div>
      <div className="border-t border-line pt-4"><h3 className="font-medium">Spending allowances</h3><p className="mt-1 text-xs text-ink-secondary">Dining includes meals alone, together and with friends. No separate dating tags needed.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">{plan.buckets.map((b,index)=>{const actual=budget.buckets.find(x=>x.id===b.id)?.actual??0;return <BudgetSlider key={b.id} label={b.label} value={b.limit} max={Math.max(3000000,(budget.plan.buckets.find(x=>x.id===b.id)?.limit??0)*2)} detail={`${money(actual)} spent · ${money(Math.abs(b.limit-actual))} ${actual>b.limit?"over":"left"}`} onChange={limit=>update({...plan,buckets:plan.buckets.map((x,i)=>i===index?{...x,limit}:x)})}/>;})}</div>
      <LazyDetails className="inset-panel border border-line p-4" summary="Category mapping & calculation details"><p className="mt-3 text-xs text-ink-secondary">Each transaction counts once. Specific category mappings override parent groups. Refunds reduce spending; transfers and investments are excluded. Unmapped spending stays visible. Emergency progress requires transfers linked to an Emergency goal. Planned expenses have a monthly allowance; unused amounts don't automatically roll over.</p><div className="mt-4"><BudgetMappingEditor plan={plan} onChange={update}/></div></LazyDetails>
      {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="max-w-md text-xs text-ink-tertiary">Saved changes apply from {month} onward. Earlier saved months stay unchanged.</p><button type="button" onClick={()=>void save()} disabled={saving||(!draft&&configured)} className="flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white disabled:opacity-50">{saved?<><Check size={16}/> Saved</>:saving?"Saving…":"Save monthly plan"}</button></div>
      </div>}
    </section>

    <BudgetCategoryList/>
  </div>;
}
