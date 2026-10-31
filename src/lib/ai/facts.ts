import type {Account,Category,Transaction} from '@/lib/domain/types';
import {createCategoryLookup,buildCategorySeed} from '@/lib/domain/categories';
import {actualTransactionTime,transactionOccurredBy} from '@/lib/domain/transaction-time';
import {spendingDrivers} from '@/lib/engine/spending-drivers';
import {spendingAttribution,spendingSummary,investmentMovement} from '@/lib/engine/spending';
import {monthTotals,monthTransactions} from '@/lib/engine/analytics';
import {recognizedMerchants} from '@/lib/engine/merchant-recognition';

export const AI_FOCUS=['overview','food','changes'] as const;
export type AIFocus=typeof AI_FOCUS[number];
export interface AIFact {
 id:string;title:string;providerLabel:string;
 metrics:{label:string;value:number;unit:'money'|'count'}[];
 transactionIds:string[];currentIds?:string[];previousIds?:string[];
}
export interface AIContext {snapshot:string;month:string;range:{from:string;to:string};facts:AIFact[]}
const money=(label:string,value:number)=>({label,value,unit:'money' as const});
const count=(label:string,value:number)=>({label,value,unit:'count' as const});

/** Shared arithmetic for server and UI. Names/notes/account IDs are never part
 * of the provider projection; source IDs stay in the authenticated app only. */
export function buildAIFacts(input:{transactions:Transaction[];categories:Category[];accounts:Account[];month:string;cycleStartDay:number;now:Date}):AIContext {
 const all=input.transactions.filter(t=>transactionOccurredBy(t,input.now)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const report=spendingDrivers({...input,transactions:all}),lookup=createCategoryLookup(input.categories),metadata=spendingAttribution(all);
 const facts:AIFact[]=[];
 const add=(id:string,title:string,providerLabel:string,metrics:AIFact['metrics'],rows:Transaction[],extra:Partial<AIFact>={})=>facts.push({id,title,providerLabel,metrics,transactionIds:rows.map(t=>t.id),...extra});
 add('spending','Recorded spending','Recorded consumption this cycle',[money('After refunds',report.current.spending),money('Before refunds',report.current.gross),money('Refunds',report.current.refunds),count('Purchases',report.current.count)],report.currentRows);
 if(report.hasComparison)add('comparison','Spending changed','Equal-prefix cycle spending comparison',[money('Difference',report.difference),money('This cycle',report.compared.spending),money('Previous cycle',report.previous.spending),count('Compared cycle days',report.days)],[...report.comparedRows,...report.previousRows],{currentIds:report.comparedRows.map(t=>t.id),previousIds:report.previousRows.map(t=>t.id)});
 const publicCategories=new Map(buildCategorySeed().map(c=>[c.id,c.name]));
 const publicCategory=(id:string)=>publicCategories.get(id)===lookup.groupNameOf(id)?publicCategories.get(id)!:'Custom category';
 const publicLeaf=(id:string)=>publicCategories.get(id)===lookup.byId.get(id)?.name?publicCategories.get(id)!:'Custom category';
 if(report.hasComparison)report.drivers.filter(d=>d.difference!==0).slice(0,3).forEach((d,i)=>add(`change_${i}`,`${d.label} changed`,`Category comparison: ${publicCategory(d.id)}`,[money('Difference',d.difference),money('This cycle',d.current),money('Previous cycle',d.previous),count('Compared cycle days',report.days)],[...d.currentRows,...d.previousRows],{currentIds:d.currentRows.map(t=>t.id),previousIds:d.previousRows.map(t=>t.id)}));
 const groups=new Map<string,Transaction[]>();
 for(const t of report.currentRows){const id=lookup.groupOf(metadata(t).categoryId??'other')?.id??'other';const rows=groups.get(id)??[];rows.push(t);groups.set(id,rows);}
 [...groups].map(([id,rows])=>({id,rows,summary:spendingSummary(rows,all)})).sort((a,b)=>Math.abs(b.summary.spending)-Math.abs(a.summary.spending)||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,7).forEach((group,i)=>{
  const name=lookup.groupNameOf(group.id),provider=publicCategory(group.id);
  add(`category_${i}`,name,provider,[money('After refunds',group.summary.spending),count('Purchases',group.summary.count)],group.rows);
 });
 for(const id of ['dining.delivery','dining.groceries','dining.restaurant','dining.tea','dining.coffee']){
  const rows=report.currentRows.filter(t=>metadata(t).categoryId===id);if(!rows.length)continue;
  const summary=spendingSummary(rows,all);add(`food_${id.split('.')[1]}`,lookup.byId.get(id)?.name??'Food & dining',`Food & dining / ${publicLeaf(id)}`,[money('After refunds',summary.spending),count('Purchases',summary.count)],rows);
 }
 [...report.merchants].sort((a,b)=>b.net-a.net||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,5).forEach((merchant,i)=>{
  const known=recognizedMerchants(merchant.label);
  const categories=[...new Set(merchant.rows.map(t=>{const id=metadata(t).categoryId??'other';const root=lookup.groupOf(id)?.id??'other';return `${publicCategory(root)}${id!==root?` / ${publicLeaf(id)}`:''}`;}))].sort();
  const provider=`${known.length===1?known[0]!.name:'Private or unlabelled merchant'}; recorded categories: ${categories.join(', ')}`;
  add(`merchant_${i}`,merchant.label,provider,[money('After refunds',merchant.net),count('Purchases',merchant.count),money('Average purchase before refunds',merchant.average)],merchant.rows);
 });
 const sources={card:'Credit-card purchases',bank:'Bank-account purchases',cash:'Cash purchases',unknown:'Account type unknown'};
 for(const kind of ['card','bank','cash','unknown'] as const){const source=report.sources.find(s=>s.source===kind);if(source)add(`source_${source.source}`,sources[source.source],sources[source.source],[money('After refunds',source.net),money('Before refunds',source.outgoing),money('Refunds',source.returned),count('Purchases',source.transactions.filter(t=>t.type==='EXPENSE').length)],source.transactions);}
 const cycle=monthTransactions(all,input.month,input.cycleStartDay).filter(t=>t.categoryId!=='adjustment'&&metadata(t).categoryId!=='adjustment');
 const totals=monthTotals(all,input.month,input.cycleStartDay);
 const income=cycle.filter(t=>t.type==='INCOME'&&!t.isRefund),contributions=cycle.filter(t=>investmentMovement(t)>0),withdrawals=cycle.filter(t=>investmentMovement(t)<0);
 if(income.length)add('income','Recorded income','Income received; excludes refunds and principal returned',[money('Received',totals.income)],income);
 if(contributions.length)add('contributions','Investment contributions','Gross contributions; not consumption spending',[money('Contributed',totals.investmentContributions)],contributions);
 if(withdrawals.length)add('withdrawals','Investment principal returned','Principal returned; not earned income',[money('Returned',totals.investmentWithdrawals)],withdrawals);
 const purchases=report.currentRows.filter(t=>t.type==='EXPENSE');
 const small=purchases.filter(t=>t.amount>0&&t.amount<15000);
 if(small.length>=3)add('small','Small purchases','Purchases strictly below INR 150 each, before refunds',[money('Gross purchases',small.reduce((n,t)=>n+t.amount,0)),count('Purchases',small.length)],small);
 if(purchases.length)add('time_coverage','Transaction time coverage','Only verified clocks support time-based analysis',[count('Verified clocks',purchases.filter(t=>!!actualTransactionTime(t)).length),count('Purchases',purchases.length)],purchases);
 // This checksum detects stale UI data. It is not an authentication token.
 const text=JSON.stringify({version:1,month:input.month,range:report.currentRange,facts});let a=2166136261,b=3335557771;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),16777619);}
 return {snapshot:`${(a>>>0).toString(16)}-${(b>>>0).toString(16)}`,month:input.month,range:report.currentRange,facts};
}

export function providerFacts(context:AIContext) {
 return {period:context.range,facts:context.facts.map(f=>({id:f.id,label:f.providerLabel,metrics:f.metrics})),units:'Money is integer INR paise. Counts are whole numbers.',coverage:'Recorded ledger only. Missing emails and missing transactions remain possible. No verified bank-balance claim. No locations or time-of-day assumptions.'};
}

export interface AIInsight {heading:string;interpretation:string;nextStep:string;factIds:string[]}
export interface AIResult {snapshot:string;focus:AIFocus;generatedAt:string;model:string;insights:AIInsight[];cached?:boolean}
export function validateAIInsights(value:unknown,context:AIContext):AIInsight[] {
 if(!value||typeof value!=='object'||Object.keys(value).some(k=>k!=='insights')||!Array.isArray((value as any).insights))throw new Error('Invalid AI response');
 const rows=(value as any).insights;if(rows.length<1||rows.length>3)throw new Error('Invalid AI response');
 const ids=new Set(context.facts.map(f=>f.id));
 const safe=(text:unknown,max:number)=>typeof text==='string'&&text.trim().length>0&&text.length<=max&&!/[\p{N}₹$€£<>]|https?:\/\/|\[[^\]]+\]\(/u.test(text);
 const seen=new Set<string>();
 return rows.map((row:any)=>{
  if(!row||Object.keys(row).some(k=>!['heading','interpretation','nextStep','factIds'].includes(k))||!safe(row.heading,80)||!safe(row.interpretation,260)||!safe(row.nextStep,160)||!Array.isArray(row.factIds)||row.factIds.length<1||row.factIds.length>3||new Set(row.factIds).size!==row.factIds.length||row.factIds.some((id:unknown)=>typeof id!=='string'||!ids.has(id)))throw new Error('Invalid AI response');
  const signature=[...row.factIds].sort().join('|');if(seen.has(signature))throw new Error('Repeated AI evidence');seen.add(signature);
  return {heading:row.heading.trim(),interpretation:row.interpretation.trim(),nextStep:row.nextStep.trim(),factIds:row.factIds};
 });
}
