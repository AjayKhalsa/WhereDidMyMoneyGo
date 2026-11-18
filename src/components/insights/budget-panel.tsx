"use client";

import { useState } from "react";
import Link from "next/link";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { saveProfile } from "@/lib/data/store";
import { allocation, defaultBudget, validateBudget, type BudgetPlan } from "@/lib/engine/budgets";

export function BudgetPanel({ compact = false }: { compact?: boolean }) {
  const { db, budget, month } = useFinance();
  const money = useMoneyText();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BudgetPlan | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!db || !budget) return null;
  const configured = (db.profile.budgetPlans ?? []).some(p=>p.effectiveFrom<=month);
  const latestEntry = db.transactions.map(t=>t.date.slice(0,10)).sort().at(-1);
  async function save() {
    if (!draft || !db) return;
    const next = { ...draft, effectiveFrom: month };
    const invalid = validateBudget(next);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError("");
    try {
      const plans = db.profile.budgetPlans ?? [];
      await saveProfile({ ...db.profile, budgetPlans: [...plans.filter(p=>p.effectiveFrom!==month), next] });
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save budget. Try again."); }
    finally { setSaving(false); }
  }
  const startEdit = () => { setDraft(structuredClone(budget.plan)); setError(""); setEditing(true); };
  const field = (label: string, value: number, change: (value: number)=>void) => <label className="block text-sm">{label}<input type="number" min="0" step="0.01" required value={value/100} onChange={e=>change(Math.round(Number(e.target.value)*100))} className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink" /></label>;
  return <section className="visual-card space-y-5" aria-label="Monthly budget">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Monthly budget</h2><p className="text-sm text-ink-secondary">{configured ? "Your saved plan" : "Proposed defaults — save to activate budget scoring"}</p></div>{compact ? <Link className="min-h-11 py-3 underline" href="/budgets">View & adjust budgets</Link> : <button className="min-h-11 rounded-lg border border-line px-4" onClick={startEdit}>Adjust budget</button>}</div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div><p className="text-sm text-ink-secondary">Spent / spending budget</p><p className="text-xl font-semibold">{money(budget.spent)} / {money(budget.limit)}</p></div>
      <div><p className="text-sm text-ink-secondary">{budget.remaining<0?"Over total budget":"Remaining this cycle"}</p><p className={budget.remaining<0?"text-xl text-danger":"text-xl text-positive"}>{money(Math.abs(budget.remaining))}</p></div>
      <div><p className="text-sm text-ink-secondary">Projected cycle-end spending</p><p className="text-xl">{budget.elapsed>=5?money(budget.projected):"Too early to project"}</p></div>
    </div>
    <p className="text-xs text-ink-tertiary">Uses the same pay cycle as Insights. Latest recorded entry: {latestEntry ?? "none yet"}. Forecasts assume the recorded spending pace continues; missing imports can understate spending. Refunds can make a category negative. Untagged dates stay in their original category.</p>
    {editing && draft && <form className="space-y-4 rounded-xl border border-line p-4" onSubmit={e=>{e.preventDefault();void save();}}>
      <h3 className="font-semibold">Plan from {month}</h3><p className="text-sm text-ink-secondary">Applies to this cycle and later cycles until changed. Earlier saved plans stay unchanged. All amounts are in rupees.</p>
      <div className="grid gap-3 sm:grid-cols-2">{field("Monthly salary", draft.salary, salary=>setDraft({...draft,salary}))}{field("Gold repayment to mum",draft.gold,gold=>setDraft({...draft,gold}))}{field("Mutual funds / other investments",draft.mutualFunds,mutualFunds=>setDraft({...draft,mutualFunds}))}{field("Emergency saving target",draft.emergency,emergency=>setDraft({...draft,emergency}))}</div>
      {draft.buckets.map((b,index)=><div key={b.id} className="space-y-2 border-t border-line pt-3">{field(b.label,b.limit,limit=>setDraft({...draft,buckets:draft.buckets.map((x,i)=>i===index?{...x,limit}:x)}))}<label className="block text-xs text-ink-secondary">Mapped categories (select multiple)<select multiple aria-label={`${b.label} categories`} value={b.categoryIds} onChange={e=>{const categoryIds=Array.from(e.target.selectedOptions,o=>o.value);setDraft({...draft,buckets:draft.buckets.map((x,i)=>i===index?{...x,categoryIds}:x)});}} className="mt-1 block h-24 w-full rounded-lg border border-line bg-surface p-2 text-ink">{db.categories.filter(c=>c.id!=="adjustment").map(c=><option key={c.id} value={c.id}>{c.parentId?`${db.categories.find(p=>p.id===c.parentId)?.name} › `:""}{c.name}</option>)}</select></label></div>)}
      <p className="text-sm">Allocated: {money(allocation(draft))}. Unallocated: {money(draft.salary-allocation(draft))}.</p>
      <p className="text-xs text-ink-secondary">A leaf category overrides its group mapping. Dining tagged People → Dating goes to Dates once; entertainment also goes there. Unmapped spending stays visible. Gold is counted only when you tag the transaction as an investment linked to a Gold vehicle.</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3"><button disabled={saving} className="min-h-11 rounded-lg bg-ink px-4 text-surface" type="submit">{saving?"Saving…":"Save plan"}</button><button disabled={saving} type="button" onClick={()=>setEditing(false)} className="min-h-11 px-3">Cancel</button><button disabled={saving} type="button" onClick={()=>setDraft(defaultBudget())} className="min-h-11 px-3">Restore defaults</button></div>
    </form>}
    <div className="space-y-4">{budget.buckets.filter(b=>!compact||b.actual>b.limit).filter(b=>b.id!=="unmapped"||b.actual!==0).map(b=><div key={b.id}>
      <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{b.label}</span><span>{money(b.actual)} / {money(b.limit)} · <span className={b.status==="over"?"text-danger":b.status==="near"?"text-warning":"text-positive"}>{b.status==="over"?`${money(-b.remaining)} over`:b.status==="near"?"80%+ used":`${money(b.remaining)} left`}</span></span></div>
      <div role="progressbar" aria-label={b.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.round(b.ratio*100))} className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div style={{width:`${Math.min(100,b.ratio*100)}%`}} className={`h-full ${b.status==="over"?"bg-danger":b.status==="near"?"bg-warning":"bg-positive"}`} /></div>
      {!compact && b.transactionIds.length>0 && <details className="mt-2 text-xs"><summary className="cursor-pointer py-2">Review {b.transactionIds.length} entries</summary><ul className="max-h-60 space-y-2 overflow-auto">{b.transactionIds.map(id=>{const t=db.transactions.find(t=>t.id===id)!;return <li key={id} className="flex justify-between gap-3"><span>{t.date.slice(0,10)} · {t.merchant||t.description}</span><span className="shrink-0">{t.isRefund?"−":""}{money(t.amount)}</span></li>;})}</ul></details>}
    </div>)}</div>
    {!compact && <div className="border-t border-line pt-4"><h3 className="font-medium">Investment & savings progress</h3><div className="mt-2 grid gap-3 text-sm sm:grid-cols-3"><p>Gold: {money(budget.gold)} / {money(budget.plan.gold)}</p><p>Other investments: {money(budget.invested)} / {money(budget.plan.mutualFunds)}</p><p>Emergency: {money(budget.emergency)} / {money(budget.plan.emergency)}</p></div><p className="mt-2 text-xs text-ink-secondary">Emergency progress counts transfers linked to a goal named “Emergency”. Ordinary bank transfers and card payments do not count. Planned-expense money is a monthly spending allowance; this page does not infer its bank balance or carry it forward. No transactions are retagged automatically.</p></div>}
  </section>;
}
