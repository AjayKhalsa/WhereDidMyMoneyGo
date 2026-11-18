import type { Database, Transaction } from "@/lib/domain/types";
import { monthTransactions } from "./analytics";
import { daysInMonth, elapsedDaysInMonth } from "@/lib/domain/dates";

export interface BudgetBucket {
  id: string;
  label: string;
  limit: number;
  categoryIds: string[];
}
export interface BudgetPlan {
  effectiveFrom: string;
  salary: number;
  gold: number;
  mutualFunds: number;
  emergency: number;
  buckets: BudgetBucket[];
}
const rupees = (v: number) => v * 100;
export function defaultBudget(): BudgetPlan {
  return { effectiveFrom: "0000-01-01", salary: rupees(140000), gold: rupees(30000), mutualFunds: rupees(40000), emergency: rupees(10000), buckets: [
    { id: "food", label: "Personal food & delivery", limit: rupees(10000), categoryIds: ["dining", "essentials"] },
    { id: "dates", label: "Dates & entertainment", limit: rupees(12000), categoryIds: ["entertainment"] },
    { id: "transport", label: "Transport", limit: rupees(8000), categoryIds: ["transport"] },
    { id: "shopping", label: "Shopping & personal care", limit: rupees(6000), categoryIds: ["shopping"] },
    { id: "bills", label: "Mobile & subscriptions", limit: rupees(4000), categoryIds: ["bills"] },
    { id: "health", label: "Health & miscellaneous", limit: rupees(5000), categoryIds: ["health", "home", "other"] },
    { id: "family", label: "Other family commitments", limit: rupees(5000), categoryIds: ["family"] },
    { id: "planned", label: "Travel, gifts & annual expenses", limit: rupees(10000), categoryIds: ["travel", "gifts", "bills.insurance", "bills.taxes"] },
  ] };
}
export function planFor(plans: BudgetPlan[] | undefined, month: string): BudgetPlan {
  return [...(plans ?? [])].filter(p => p.effectiveFrom <= month).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? defaultBudget();
}
export function allocation(plan: BudgetPlan): number {
  return plan.gold + plan.mutualFunds + plan.emergency + plan.buckets.reduce((s,b) => s+b.limit,0);
}
export function validateBudget(plan: BudgetPlan): string | null {
  const values = [plan.salary, plan.gold, plan.mutualFunds, plan.emergency, ...plan.buckets.map(b=>b.limit)];
  if (values.some(v=>!Number.isSafeInteger(v)||v<0) || plan.salary<=0) return "Enter valid, non-negative amounts and a positive salary.";
  if (allocation(plan)>plan.salary) return "Your allocations exceed your salary. Reduce a limit or target before saving.";
  const ids=plan.buckets.flatMap(b=>b.categoryIds);
  if (new Set(ids).size!==ids.length) return "Each category can be mapped to only one budget.";
  return null;
}
export function budgetPerformance(db: Database, month: string, now: Date, cycleStartDay = 1) {
  const plan = planFor(db.profile.budgetPlans, month);
  const categories = new Map(db.categories.map(c=>[c.id,c]));
  const all = new Map(db.transactions.map(t=>[t.id,t]));
  const rows = monthTransactions(db.transactions, month, cycleStartDay).filter(t=>new Date(t.date)<=now);
  const actuals = new Map<string,number>();
  const transactionIds = new Map<string,string[]>();
  let invested=0, gold=0, emergency=0;
  const investments = new Map(db.investments.map(i=>[i.id,i]));
  function bucketFor(t: Transaction): string {
    const c=categories.get(t.categoryId??"");
    // Explicit leaf mappings take priority over group mappings.
    const exact=plan.buckets.find(b=>b.categoryIds.includes(t.categoryId??""));
    const grouped=plan.buckets.find(b=>b.categoryIds.includes(c?.parentId??""));
    const dining=c?.id==="dining"||c?.parentId==="dining";
    if(dining && t.contexts.some(c=>c.type==="PEOPLE"&&c.value==="dating")) return "dates";
    return exact?.id??grouped?.id??"unmapped";
  }
  for(const t of rows) {
    if(t.type==="INVESTMENT") { if(investments.get(t.investmentId??"")?.kind==="GOLD") gold+=t.amount; else invested+=t.amount; continue; }
    if(t.type==="TRANSFER") {
      const goal=db.goals.find(g=>g.id===t.goalId);
      if(goal && /emergency/i.test(goal.name)) emergency+=t.amount;
      continue;
    }
    const refund=t.type==="INCOME"&&t.isRefund;
    if(t.type!=="EXPENSE"&&!refund) continue;
    const original=refund&&t.reversesTransactionId?all.get(t.reversesTransactionId):undefined;
    const source=original??t;
    if(/balance adjustment/i.test(categories.get(source.categoryId??"")?.name??"")) continue;
    const id=bucketFor(source);
    actuals.set(id,(actuals.get(id)??0)+(refund?-t.amount:t.amount));
    transactionIds.set(id,[...(transactionIds.get(id)??[]),t.id]);
  }
  const buckets=[...plan.buckets,{id:"unmapped",label:"Unmapped spending",limit:0,categoryIds:[]}].map(b=>{
    const actual=actuals.get(b.id)??0;
    const ratio=b.limit>0?Math.max(0,actual)/b.limit:actual>0?Infinity:0;
    return {...b,actual,remaining:b.limit-actual,ratio,transactionIds:transactionIds.get(b.id)??[],status:ratio>1?"over":ratio>=0.8?"near":"within"};
  });
  const spent=buckets.reduce((s,b)=>s+b.actual,0);
  const limit=plan.buckets.reduce((s,b)=>s+b.limit,0);
  const elapsed=elapsedDaysInMonth(now,month,cycleStartDay);
  const days=daysInMonth(month,cycleStartDay);
  const projected=elapsed>0?Math.round(Math.max(0,spent)*days/elapsed):0;
  const overshoot=buckets.reduce((s,b)=>s+Math.max(0,b.actual-b.limit),0);
  // Individual overshoots cannot be hidden by unused money in other buckets.
  const score=rows.some(t=>t.type==="EXPENSE")&&elapsed>=5&&limit>0?Math.round(Math.max(0,100-100*overshoot/limit)):null;
  return {plan,buckets,spent,limit,remaining:limit-spent,projected,overshoot,score,invested,gold,emergency,elapsed,days};
}
