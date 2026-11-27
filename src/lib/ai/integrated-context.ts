import type {Database,Transaction} from '@/lib/domain/types';
import {transactionOccurredBy} from '@/lib/domain/transaction-time';
import {createCategoryLookup} from '@/lib/domain/categories';
import {LENSES} from '@/lib/domain/lenses';
import {monthKeyToDate,previousMonths,toDateInputValue} from '@/lib/domain/dates';
import {projectMoneyLinks} from '@/lib/engine/money-links';
import {budgetPerformance} from '@/lib/engine/budgets';
import {calculateSafeToSpend} from '@/lib/engine/safe-to-spend';
import {generateInsights,calculateFinancialScore,type Insight,type FinancialScore} from '@/lib/engine/insights';
import {monthTransactions,monthTotals,lensTotals,netWorth,spendingConsistency} from '@/lib/engine/analytics';
import {personBalances} from '@/lib/engine/splits';
import {spendingDrivers} from '@/lib/engine/spending-drivers';
import {explainSpending} from '@/lib/engine/spending-explanation';
import {buildAIFacts,type AIContext,type AIFact,type AIResult} from './facts';

type Derived={insights:Insight[];budget:ReturnType<typeof budgetPerformance>|null;score:FinancialScore};
const metric=(label:string,value:number,unit:'money'|'count'='money')=>({label,value,unit});
function amountLabel(p:Insight):string{
 const labels:Partial<Record<Insight['kind'],string>>={velocity:'Estimated cycle-end spending','credit-commitment':'Recorded card outstanding','investment-rate':'Contributed this cycle','goal-progress':'Saved towards the goal','subscription-change':'Latest recorded charge',frequency:'Total for these purchases',outlier:'Recorded purchase'};
 return labels[p.kind]??(p.basis==='category-flow'?'Net category outflow':p.basis==='gross'?'Gross purchases':'Recorded net spending');
}

/** Shared server/browser projection. Raw text, contexts and identities remain local. */
export function buildIntegratedContext(db:Database,month:string,now:Date,cycleStartDay:number,derived?:Derived):AIContext{
 const personal=projectMoneyLinks({transactions:db.transactions,moneyLinks:db.moneyLinks},now).transactions.filter(t=>transactionOccurredBy(t,now)).sort((a,b)=>a.id.localeCompare(b.id));
 const context=buildAIFacts({transactions:personal,categories:db.categories,accounts:db.accounts,month,now,cycleStartDay});
 const targets:NonNullable<AIContext['targets']>=[];
 const add=(id:string,label:string,metrics:AIFact['metrics'],rows:Transaction[]=[])=>{
  context.facts.push({id,title:label,providerLabel:label,metrics,transactionIds:rows.map(t=>t.id).sort()});
  return id;
 };
 const target=(key:string,label:string,factIds:string[])=>{if(factIds.length)targets.push({id:`target_${targets.length}`,key,label,factIds:[...new Set(factIds)]});};
 const rows=monthTransactions(personal,month,cycleStartDay);
 const budget=derived?.budget??budgetPerformance(db,month,now,cycleStartDay);
 const lookup=createCategoryLookup(db.categories);
 const patterns=(derived?.insights??generateInsights({transactions:personal,accounts:db.accounts,goals:db.goals,investments:db.investments,month,now,cycleStartDay,groupLabel:id=>lookup.groupNameOf(id),groupFor:id=>lookup.groupOf(id)?.id??'other'})).slice().sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 const report=spendingDrivers({transactions:personal,categories:db.categories,accounts:db.accounts,month,now,cycleStartDay});
 const explanation=explainSpending(report);
 if(report.hasComparison){
  const effects=add('spending_effects','Arithmetic decomposition of equal-prefix spending change, not proof of causes',explanation.effects.map(e=>metric(e.id,e.amount)),[...report.comparedRows,...report.previousRows]);
  target('spending','Explain purchase frequency, purchase size and refund effects',['spending','comparison',effects]);
 }else target('spending','Explain available spending evidence without inventing a comparison',['spending']);
 const budgetId=add('budget_plan','Spending budget, estimated pace and investment allocations',[metric('Spending limit',budget.limit),metric('Spent',budget.spent),metric('Remaining',budget.remaining),metric('Estimated cycle end',budget.projected),metric('Elapsed days',budget.elapsed,'count'),metric('Cycle days',budget.days,'count'),metric('Investment target',budget.investmentTarget),metric('Investment contributions',budget.invested),metric('Emergency allocation',budget.plan.emergency)],rows);
 budget.buckets.forEach((b,i)=>add(`budget_bucket_${i}`,`Budget bucket / ${b.id==='food'?'Dining, delivery and outings':'category '+i}`,[metric('Limit',b.limit),metric('Actual',b.actual),metric('Remaining',b.remaining)],rows.filter(t=>b.categoryIds?.includes(t.categoryId??''))));
 target('budget','Explain budget pressure and realistic choices; forecast is an estimate, not a commitment',[budgetId,...context.facts.filter(f=>f.id.startsWith('budget_bucket_')).map(f=>f.id)]);
 target('recap','Connect income, consumption, investments and refunds; do not equate contributions with spending',context.facts.filter(f=>['spending','comparison','income','contributions','withdrawals',budgetId].includes(f.id)).map(f=>f.id));
 target('affordability','Explain budget trade-offs alongside the app-calculated verdict. The proposed purchase is unknown: never approve it, reject it or claim available cash.',[budgetId,'spending',...context.facts.filter(f=>f.id==='contributions').map(f=>f.id)]);
 const scores=derived?.score??(()=>{
  const safe=calculateSafeToSpend({transactions:db.transactions,moneyLinks:db.moneyLinks,accounts:db.accounts,incomeSources:db.incomeSources,investments:db.investments,recurring:db.recurring,goals:db.goals,month,now,cycleStartDay});
  const people=personBalances(db.people,db.splits),start=monthKeyToDate(month);
  const current=netWorth(db.accounts,db.transactions,db.investments,people,now)-projectMoneyLinks({transactions:db.transactions,moneyLinks:db.moneyLinks},now).held;
  const earlier=netWorth(db.accounts,db.transactions.filter(t=>new Date(t.date)<start),db.investments,people,start)-projectMoneyLinks({transactions:db.transactions,moneyLinks:db.moneyLinks},new Date(start.getTime()-1)).held;
  return calculateFinancialScore({budget:db.profile.budgetPlans?.length?budget:undefined,transactions:personal,accounts:db.accounts,creditCards:db.creditCards,goals:db.goals,month,now,cycleStartDay,consistency:spendingConsistency(personal,month,now,cycleStartDay),incomeBasis:safe.incomeBasis,netWorthNow:current,netWorthAtCycleStart:earlier});
 })();
 const scoreId=add('score_factors','App-calculated financial score and weighted factors; explain the score, not creditworthiness',[metric('Overall score',scores.score,'count'),...scores.factors.map(f=>metric(f.id,f.score,'count'))]);
 target('score','Explain the strongest app score factors without judging personality',[scoreId,budgetId,'spending',...context.facts.filter(f=>f.id==='contributions').map(f=>f.id)]);
 lensTotals(rows,LENSES,personal).filter(l=>l.count>0).forEach((l,i)=>{
  const id=add(`lens_fact_${i}`,`Recorded cross-category view: ${l.lens.label}`,[metric('Net spending',l.amount),metric('Purchases',l.count,'count')],l.transactions);
  target(`lens:${l.lens.id}`,'Explain the selected spending view without inferring relationships or intent',[id]);
 });
 patterns.forEach((p,i)=>{
  const id=add(`pattern_fact_${i}`,`Recorded ${p.kind} finding; basis ${p.basis??'spending'}; severity ${p.tone}`,[...(p.amount===undefined?[]:[metric(amountLabel(p),p.amount)]),metric('Supporting entries',p.transactions.length,'count')],p.transactions);
  const ids=new Set(p.transactions.map(t=>t.id));
  const supporting=context.facts.filter(f=>!f.id.startsWith('pattern_')&&f.transactionIds.some(id=>ids.has(id))).slice(0,5).map(f=>f.id);
  target(`insight:${p.id}`,`Explain this ${p.kind} finding with its existing severity`,[id,...supporting]);
 });
 // Compare the same prefix across history; never present a full month as the current prefix.
 previousMonths(month,3,cycleStartDay).forEach((past,i)=>{
  const end=monthKeyToDate(past);end.setDate(end.getDate()+report.days);
  const cutoff=toDateInputValue(end);
  const pastRows=monthTransactions(personal,past,cycleStartDay).filter(t=>t.date.slice(0,10)<cutoff);
  if(pastRows.length){const t=monthTotals(pastRows,past,cycleStartDay);add(`history_${i}`,`Earlier cycle starting ${past}, compared at the same elapsed prefix`,[metric('Spending',t.spent),metric('Purchases',t.expenseCount,'count'),metric('Investment contributions',t.investmentContributions)],pastRows);}
 });
 context.targets=targets;
 const text=JSON.stringify({version:2,month,facts:context.facts,targets});let a=2166136261,b=3335557771;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),16777619);}
 context.snapshot=`${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`;
 return context;
}

export function applyInsightNarratives(patterns:Insight[],result:AIResult|null,context:AIContext,transactions:Transaction[]):Insight[]{
 if(!result||result.snapshot!==context.snapshot)return patterns;
 const narratives=new Map(result.narratives?.map(n=>[context.targets?.find(t=>t.id===n.targetId)?.key,n]));
 const enhanced=patterns.map(p=>{
  const n=narratives.get(`insight:${p.id}`);
  return n?{...p,title:n.heading,body:n.interpretation,nextStep:n.nextStep,amountLabel:amountLabel(p),interpretationSource:'ai' as const}:p;
 });
 const discoveries:Insight[]=result.insights.map((n,i)=>{
  const evidence=context.facts.filter(f=>n.factIds.includes(f.id));
  const ids=new Set(evidence.flatMap(f=>f.transactionIds));
  return {id:`analysis:${context.snapshot}:${i}`,kind:'analysis',tone:'neutral',eyebrow:'Your money',title:n.heading,body:n.interpretation,nextStep:n.nextStep,interpretationSource:'ai',transactions:transactions.filter(t=>ids.has(t.id)),priority:85-i,basis:'spending',action:'See the evidence',evidence:evidence.map(f=>({title:f.title,metrics:f.metrics}))};
 });
 return [...enhanced.filter(p=>p.tone==='alert'),...discoveries,...enhanced.filter(p=>p.tone!=='alert')];
}
