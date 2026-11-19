"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowRight, SlidersHorizontal, Wallet, TrendingUp, Check } from "lucide-react";
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

export function BudgetPanel({compact=false}:{compact?:boolean}) {
  const {db,budget,month,now,cycleStartDay}=useFinance();
  const money=useMoneyText();
  const comparison=useMemo(()=>db?compareBudgets(db,month,now,cycleStartDay):null,[db,month,now,cycleStartDay]);
  const [draft,setDraft]=useState<BudgetPlan|null>(null);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  if(!db||!budget||!comparison) return null;
  const plan=draft??budget.plan;
  const configured=(db.profile.budgetPlans??[]).some(p=>p.effectiveFrom<=month);
  const allocated=allocation(plan),unallocated=plan.salary-allocated;
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
    try {await saveProfile({...db.profile,budgetPlans:[...(db.profile.budgetPlans??[]).filter(p=>p.effectiveFrom!==month),next]});setDraft(null);setSaved(true);}
    catch(e){setError(e instanceof Error?e.message:"Couldn't save. Your previous plan is unchanged.");}
    finally{setSaving(false);}
  }
  if(compact) return <section className="visual-card space-y-4" aria-label="Budget overview">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Your budget, in context</h2><Link href="/budgets" className="flex min-h-11 items-center gap-2 text-sm text-accent">See your plan <ArrowRight size={16}/></Link></div>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><strong className="text-2xl tracking-tight">{money(budget.spent)}</strong><span className="text-sm text-ink-secondary">of {money(budget.limit)} spent</span><span className={budget.remaining<0?"text-sm text-danger":"text-sm text-positive"}>{money(Math.abs(budget.remaining))} {budget.remaining<0?"over":"remaining"}</span></div>
    <p className="text-sm text-ink-secondary">{changeCopy}</p>
    <p className="rounded-xl bg-surface-sunken p-3 text-sm">{biggestOver?`${biggestOver.label} is the largest overrun: ${money(-biggestOver.remaining)} above its limit. Review it before adding more spending.`:pace}</p>
    <p className="text-xs text-ink-tertiary">Comparison covers the first {comparison.matchedDays} days of each cycle. Latest recorded entry: {latest??"none"}; missing transactions can change the picture.</p>
  </section>;

  return <div className="space-y-6" aria-label="Monthly budget">
    <section className="budget-hero">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm opacity-80"><Wallet size={17}/> Your month, with intention</span><span className="rounded-full border border-white/20 px-3 py-1 text-xs">{configured?"Saved monthly plan":"Your starting plan"}</span></div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2"><div><p className="text-sm opacity-75">Spent so far</p><p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{money(budget.spent)}</p><p className="mt-2 text-sm opacity-75">of {money(budget.limit)} planned spending</p></div><div className="sm:border-l sm:border-white/20 sm:pl-6"><p className="text-sm opacity-75">{budget.remaining<0?"Beyond your plan":"Room left this cycle"}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{money(Math.abs(budget.remaining))}</p><p className="mt-2 text-sm opacity-75">{budget.remaining>0&&daysLeft>0?`${money(Math.floor(budget.remaining/daysLeft))} a day across ${daysLeft} remaining days`:budget.remaining<0?"Shift spending down to protect your investment plan.":"This cycle's allowance is fully used."}</p></div></div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white/85" style={{width:`${budget.limit>0?Math.min(100,Math.max(0,budget.spent/budget.limit*100)):0}%`}}/></div>
      <p className="mt-3 text-xs opacity-70">Latest recorded entry: {latest??"none yet"}. Figures reflect imported transactions, not live bank balances.</p>
    </section>

    <section className="grid gap-4 md:grid-cols-2" aria-label="Budget insights">
      <div className="visual-card"><span className="budget-eyebrow">Compared with last cycle</span><div className="mt-3 flex items-start gap-3"><span className={`rounded-xl p-2 ${comparison.hasPrior&&improving?"bg-positive-soft text-positive":"bg-accent-soft text-accent"}`}><ShiftIcon size={22}/></span><div><h2 className="font-semibold">{!comparison.hasPrior?"Your baseline starts here":comparison.delta===0?"Holding steady":improving?"Recorded spending is lower":"Spending is running higher"}</h2><p className="mt-1 text-sm text-ink-secondary">{changeCopy}</p></div></div><p className="mt-4 text-xs text-ink-tertiary">First {comparison.matchedDays} days in each cycle, using the same category mappings. {budget.remaining<0?`Still ${money(-budget.remaining)} above your spending plan.`:`${money(budget.remaining)} remains in your spending plan.`}</p></div>
      <div className="visual-card"><span className="budget-eyebrow">Your next useful move</span><h2 className="mt-3 font-semibold">{biggestOver?`Focus on ${biggestOver.label.toLowerCase()}`:budget.remaining>0?"Keep the room you've created":"Review before your next purchase"}</h2><p className="mt-2 text-sm text-ink-secondary">{biggestOver?`${money(biggestOver.actual)} spent against ${money(biggestOver.limit)}. This is the largest category overrun, at ${money(-biggestOver.remaining)}.`:daysLeft>0?`Keep spending within ${money(Math.max(0,Math.floor(budget.remaining/daysLeft)))} a day for the remaining ${daysLeft} days to stay within your plan.`:"Use this completed cycle to set your next month’s allowances."}</p><p className="mt-3 text-xs text-ink-tertiary">{pace} Projections follow recorded spending; one-off purchases and missing imports can skew them.</p></div>
    </section>

    {comparison.hasPrior&&comparison.changes.length>0&&<section className="visual-card"><div className="flex items-center gap-2"><TrendingUp size={18} className="text-accent"/><h2 className="font-semibold">What changed?</h2></div><p className="mt-1 text-sm text-ink-secondary">The biggest shifts versus the same {comparison.matchedDays} days last cycle.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{comparison.changes.slice(0,3).map(c=><div key={c.id} className="rounded-2xl bg-surface-sunken p-4"><p className="text-sm">{c.label}</p><p className={`mt-2 text-xl font-semibold ${c.delta<0?"text-positive":"text-danger"}`}>{c.delta<0?"−":"+"}{money(Math.abs(c.delta))}</p><p className="mt-1 text-xs text-ink-tertiary">{money(c.previous)} → {money(c.actual)}</p></div>)}</div></section>}

    <section className="visual-card space-y-5" aria-label="Adjustable budget plan">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><SlidersHorizontal size={18}/> Build your month</h2><p className="mt-1 text-sm text-ink-secondary">Slide to make room for what matters. Changes are previews until saved.</p></div><button type="button" className="min-h-11 rounded-xl border border-line px-4 text-sm" disabled={saving} onClick={()=>update(defaultBudget())}>Reset defaults</button></div>
      <div className={`rounded-2xl p-4 ${unallocated<0?"bg-danger-soft text-danger":"bg-accent-soft text-accent-ink"}`} aria-live="polite"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{money(allocated)} allocated of {money(plan.salary)}</span><strong>{money(Math.abs(unallocated))} {unallocated<0?"over salary":unallocated===0?"· every rupee assigned":"unallocated"}</strong></div><div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/60">{[{amount:plan.investment,color:"bg-accent"},{amount:plan.buckets.reduce((s,b)=>s+b.limit,0),color:"bg-warning"},{amount:plan.emergency,color:"bg-positive"}].map((s,i)=><div key={i} className={s.color} style={{width:`${plan.salary>0?s.amount/plan.salary*100:0}%`}}/>)}</div><div className="mt-2 flex flex-wrap gap-4 text-xs"><span>● Investments</span><span>● Spending</span><span>● Emergency savings</span></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><BudgetSlider label="Monthly salary" value={plan.salary} max={Math.max(30000000,budget.plan.salary*2)} onChange={salary=>update({...plan,salary})}/><BudgetSlider label="Investments" value={plan.investment} max={plan.salary} detail={`${money(budget.invested)} invested this cycle · all investment types`} onChange={investment=>update({...plan,investment})}/><BudgetSlider label="Emergency savings" value={plan.emergency} max={plan.salary} detail={`${money(budget.emergency)} in linked emergency-goal transfers`} onChange={emergency=>update({...plan,emergency})}/></div>
      <div className="border-t border-line pt-4"><h3 className="font-medium">Spending allowances</h3><p className="mt-1 text-xs text-ink-secondary">Dining includes meals alone, together and with friends. No separate dating tags needed.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">{plan.buckets.map((b,index)=>{const actual=budget.buckets.find(x=>x.id===b.id)?.actual??0;return <BudgetSlider key={b.id} label={b.label} value={b.limit} max={Math.max(3000000,(budget.plan.buckets.find(x=>x.id===b.id)?.limit??0)*2)} detail={`${money(actual)} spent · ${money(Math.abs(b.limit-actual))} ${actual>b.limit?"over":"left"}`} onChange={limit=>update({...plan,buckets:plan.buckets.map((x,i)=>i===index?{...x,limit}:x)})}/>;})}</div>
      <details className="rounded-xl border border-line p-4"><summary className="cursor-pointer text-sm font-medium">Category mapping & calculation details</summary><p className="mt-3 text-xs text-ink-secondary">Each transaction counts once. Specific category mappings override parent groups. Refunds reduce spending; transfers and investments are excluded. Unmapped spending stays visible. Emergency progress requires transfers linked to an Emergency goal. Planned expenses have a monthly allowance; unused amounts don't automatically roll over.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{plan.buckets.map((b,index)=><label key={b.id} className="text-sm">{b.label}<select multiple aria-label={`${b.label} categories`} value={b.categoryIds} onChange={e=>{const categoryIds=Array.from(e.target.selectedOptions,o=>o.value);update({...plan,buckets:plan.buckets.map((x,i)=>i===index?{...x,categoryIds}:x)});}} className="mt-2 block h-28 w-full rounded-lg border border-line bg-surface p-2">{db.categories.filter(c=>c.id!=="adjustment").map(c=><option key={c.id} value={c.id}>{c.parentId?`${db.categories.find(p=>p.id===c.parentId)?.name} › `:""}{c.name}</option>)}</select></label>)}</div></details>
      {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="max-w-md text-xs text-ink-tertiary">Saved changes apply from {month} onward. Earlier saved months stay unchanged.</p><button type="button" onClick={()=>void save()} disabled={saving||(!draft&&configured)} className="flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white disabled:opacity-50">{saved?<><Check size={16}/> Saved</>:saving?"Saving…":"Save monthly plan"}</button></div>
    </section>

    <section className="visual-card"><h2 className="font-semibold">Where this month's money went</h2><p className="mt-1 text-sm text-ink-secondary">Saved limits, actual spending and the transactions behind them.</p><div className="mt-5 space-y-5">{budget.buckets.filter(b=>b.id!=="unmapped"||b.actual!==0).map(b=><div key={b.id}><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{b.label}</span><span>{money(b.actual)} / {money(b.limit)} <span className={b.status==="over"?"text-danger":"text-ink-secondary"}>· {money(Math.abs(b.remaining))} {b.remaining<0?"over":"left"}</span></span></div><div role="progressbar" aria-label={`${b.label} spent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.round(b.ratio*100))} className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${b.status==="over"?"bg-danger":b.status==="near"?"bg-warning":"bg-accent"}`} style={{width:`${Math.min(100,b.ratio*100)}%`}}/></div>{b.transactionIds.length>0&&<details className="mt-1 text-xs"><summary className="min-h-9 cursor-pointer py-2 text-ink-tertiary">Review {b.transactionIds.length} entries</summary><ul className="max-h-52 space-y-2 overflow-auto">{b.transactionIds.map(id=>{const t=db.transactions.find(t=>t.id===id)!;return <li key={id} className="flex justify-between gap-3"><span>{t.date.slice(0,10)} · {t.merchant||t.description}</span><span className="shrink-0">{t.isRefund?"−":""}{money(t.amount)}</span></li>;})}</ul></details>}</div>)}</div></section>
  </div>;
}
