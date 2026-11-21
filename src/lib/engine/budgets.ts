import { projectMoneyLinks } from "./money-links";
import type { Database, Transaction } from "@/lib/domain/types";
import { monthTransactions } from "./analytics";
import { daysInMonth, elapsedDaysInMonth, addMonths, monthKeyToDate } from "@/lib/domain/dates";

export interface BudgetBucket {
  id: string;
  label: string;
  limit: number;
  categoryIds: string[];
}
export interface BudgetPlan {
  effectiveFrom: string;
  salary: number;
  investment: number;
  /** Read compatibility for previously saved plans. */
  gold?: number;
  mutualFunds?: number;
  emergency: number;
  buckets: BudgetBucket[];
}
const rupees = (v: number) => v * 100;
export function defaultBudget(): BudgetPlan {
  return { effectiveFrom: "0000-01-01", salary: rupees(140000), investment: rupees(70000), emergency: rupees(10000), buckets: [
    { id: "food", label: "Dining, delivery & outings", limit: rupees(22000), categoryIds: ["dining", "essentials", "entertainment"] },
    { id: "transport", label: "Transport", limit: rupees(8000), categoryIds: ["transport"] },
    { id: "shopping", label: "Shopping & personal care", limit: rupees(6000), categoryIds: ["shopping"] },
    { id: "bills", label: "Mobile & subscriptions", limit: rupees(4000), categoryIds: ["bills"] },
    { id: "health", label: "Health & miscellaneous", limit: rupees(5000), categoryIds: ["health", "home", "other"] },
    { id: "family", label: "Other family commitments", limit: rupees(5000), categoryIds: ["family"] },
    { id: "planned", label: "Travel, gifts & annual expenses", limit: rupees(10000), categoryIds: ["travel", "gifts", "bills.insurance", "bills.taxes"] },
  ] };
}
export function planFor(plans: BudgetPlan[] | undefined, month: string): BudgetPlan {
  return normalizeBudget([...(plans ?? [])].filter(p => p.effectiveFrom <= month).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? defaultBudget());
}
export function allocation(plan: BudgetPlan): number {
  return normalizeBudget(plan).investment + plan.emergency + plan.buckets.reduce((s,b) => s+b.limit,0);
}
export function validateBudget(plan: BudgetPlan): string | null {
  const values = [plan.salary, normalizeBudget(plan).investment, plan.emergency, ...plan.buckets.map(b=>b.limit)];
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
  const rows = monthTransactions(projectMoneyLinks(db,now).transactions, month, cycleStartDay).filter(t=>new Date(t.date)<=now);
  const actuals = new Map<string,number>();
  const transactionIds = new Map<string,string[]>();
  let invested=0, emergency=0;
  function bucketFor(t: Transaction): string {
    const c=categories.get(t.categoryId??"");
    // Explicit leaf mappings take priority over group mappings.
    const exact=plan.buckets.find(b=>b.categoryIds.includes(t.categoryId??""));
    const grouped=plan.buckets.find(b=>b.categoryIds.includes(c?.parentId??""));
    return exact?.id??grouped?.id??"unmapped";
  }
  for(const t of rows) {
    if(t.type==="INVESTMENT") { invested+=t.amount; continue; }
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
  return {plan,buckets,spent,limit,remaining:limit-spent,projected,overshoot,score,invested,emergency,elapsed,days};
}

/** Upgrade old plans without changing allocations or requiring transaction retagging. */
export function normalizeBudget(plan: BudgetPlan): BudgetPlan {
  const {gold,mutualFunds,...rest}=plan;
  const dates=rest.buckets.find(b=>b.id==="dates");
  const food=rest.buckets.find(b=>b.id==="food");
  const buckets=dates && food ? rest.buckets.filter(b=>b.id!=="dates").map(b=>b.id==="food"?{...b,label:"Dining, delivery & outings",limit:b.limit+dates.limit,categoryIds:[...new Set([...b.categoryIds,...dates.categoryIds])]}:b) : rest.buckets;
  return {...rest, investment:plan.investment??((gold??0)+(mutualFunds??0)),buckets};
}

/** Compare the same number of days using today's mappings on both periods. */
export function compareBudgets(db: Database, month: string, now: Date, cycleStartDay=1,
  current=budgetPerformance(db,month,now,cycleStartDay)) {
  const priorMonth=addMonths(month,-1,cycleStartDay);
  const start=monthKeyToDate(priorMonth);
  const matchedDays=Math.min(current.elapsed,daysInMonth(priorMonth,cycleStartDay));
  const cutoff=new Date(start.getFullYear(),start.getMonth(),start.getDate()+Math.max(0,matchedDays-1),23,59,59,999);
  const prior=budgetPerformance({...db,profile:{...db.profile,budgetPlans:[{...current.plan,effectiveFrom:"0000-01-01"}]}},priorMonth,cutoff,cycleStartDay);
  // Shorter prior months require matching the current side to the same span too.
  const currentStart=monthKeyToDate(month);
  const currentCutoff=new Date(currentStart.getFullYear(),currentStart.getMonth(),currentStart.getDate()+Math.max(0,matchedDays-1),23,59,59,999);
  const matched=currentCutoff<now?budgetPerformance(db,month,currentCutoff,cycleStartDay):current;
  const hasPrior=prior.buckets.some(b=>b.transactionIds.length>0);
  const delta=matched.spent-prior.spent;
  const changes=matched.buckets.map(b=>({...b,previous:prior.buckets.find(p=>p.id===b.id)?.actual??0,delta:b.actual-(prior.buckets.find(p=>p.id===b.id)?.actual??0)})).filter(b=>b.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  return {current,prior,matched,matchedDays,hasPrior,delta,percent:prior.spent>0?Math.round(delta/prior.spent*100):null,changes};
}
