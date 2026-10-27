import type { Category, Transaction } from '@/lib/domain/types';
import { merchantKey } from '@/lib/engine/merchant-identity';
import { historicalRules, suggestCategory } from './classification';
import type { Alert } from './alerts';

/** Offline temporal holdout. Saved production rules are deliberately excluded:
 * their training history may include the held-out label. No rules are saved. */
export function evaluateLearning(transactions:Transaction[],categories:Pick<Category,'id'|'name'|'parentId'>[]) {
 const eligible=transactions.filter(t=>t.type==='EXPENSE'&&!t.enrichment&&t.categoryId&&!['other','adjustment'].includes(t.categoryId));
 const groups=new Map<string,Transaction[]>();
 for(const t of eligible){const key=merchantKey(t.merchant||t.description);if(key.length>=4)groups.set(key,[...(groups.get(key)??[]),t]);}
 const root=(id:string):string=>{const seen=new Set<string>();while(!seen.has(id)){seen.add(id);const parent=categories.find(c=>c.id===id)?.parentId;if(!parent)return id;id=parent;}return id;};
 const rows=[...groups.values()].filter(g=>g.length>=4).flatMap(group=>{
  const held=[...group].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).at(-1)!;
  // Same-day labels might have been entered in any order: do not train on them.
  const training=eligible.filter(t=>t.date.slice(0,10)<held.date.slice(0,10));
  if(training.filter(t=>merchantKey(t.merchant||t.description)===merchantKey(held.merchant||held.description)).length<3)return [];
  const learned=historicalRules(training,[]);
  const exact=held.timing?.precision==='exact'&&['bank','payment'].includes(held.timing.source);
  const alert:Alert={bank:'evaluation',instrument:'bank',tail:'',amount:held.amount,date:held.date.slice(0,10),merchant:held.merchant||held.description,direction:'debit',occurredAt:exact?held.date:undefined,timeSource:exact?held.timing!.source as 'bank'|'payment':'unknown',timeConfidence:exact?'exact':'unknown'};
  const prediction=suggestCategory(alert,learned.rules,categories,[],learned.conflicts);
  return [{transactionId:held.id,expected:held.categoryId!,predicted:prediction.categoryId,categoryCorrect:root(prediction.categoryId)===root(held.categoryId!),subcategoryCorrect:prediction.categoryId===held.categoryId,needsReview:prediction.needsReview,source:prediction.source,trainingExamples:training.length,rules:learned.rules.length,conflicts:learned.conflicts.length}];
 });
 const auto=rows.filter(r=>!r.needsReview),rate=(n:number,total:number)=>total?Math.round(n/total*10000)/100:null;
 const allLearned=historicalRules(eligible,[]);
 return {method:'Temporal holdout: last transaction per merchant with at least three earlier-date examples; production saved rules excluded to prevent label leakage. UPI metadata is unavailable in ledger-only evaluation; no UPI heuristic is inferred.',examples:eligible.length,merchantGroups:groups.size,heldOut:rows.length,categoryAccuracy:rate(rows.filter(r=>r.categoryCorrect).length,rows.length),subcategoryAccuracy:rate(rows.filter(r=>r.subcategoryCorrect).length,rows.length),autoTagged:auto.length,autoCategoryPrecision:rate(auto.filter(r=>r.categoryCorrect).length,auto.length),autoSubcategoryPrecision:rate(auto.filter(r=>r.subcategoryCorrect).length,auto.length),falsePositiveAutoTags:auto.filter(r=>!r.subcategoryCorrect).length,needsReview:rows.filter(r=>r.needsReview).length,proposedHistoricalRules:allLearned.rules.length,conflictingMerchants:allLearned.conflicts.length,rows};
}
