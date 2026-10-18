import type { Category, ClassificationRule, Transaction, TransactionContext } from "@/lib/domain/types";
import { deriveRulePattern, learnFromEntry } from "@/lib/engine/learning";
import { parseExpenseInput } from "@/lib/engine/parser";
import { merchantKey } from "@/lib/engine/merchant-identity";
import { MERCHANTS } from "@/lib/engine/lexicon";
import type { Alert } from "./alerts";

export interface CategorySuggestion {
  categoryId: string;
  confidence: number;
  source: "rule" | "history" | "meal" | "small-upi" | "vocabulary" | "unknown";
  reason: string;
  needsReview: boolean;
  ruleId?: string;
  contexts: TransactionContext[];
}
export function suggestCategory(a: Alert, rules: ClassificationRule[], categories: Pick<Category,"id">[], selfNames: string[] = [], conflictingPayees:string[]=[]): CategorySuggestion {
  const valid = new Set(categories.map(c=>c.id)), key=merchantKey(a.merchant);
  const unknown=(reason:string):CategorySuggestion=>({categoryId:"other",confidence:0,source:"unknown",reason,needsReview:true,contexts:[]});
  if(a.direction!=="debit"||a.special)return unknown("Confirm the financial purpose before categorizing.");
  const words=a.merchant.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/);
  const applicable=rules.filter(r=>valid.has(r.categoryId)&&words.includes(r.pattern.toLowerCase())&&(!r.learningEvidence||r.learningEvidence.merchantKey===key));
  const scoped=applicable.filter(r=>['gmail-correction','manual-correction'].includes(r.learningEvidence?.source??''));
  const candidates=scoped.length?scoped:applicable;
  if(candidates.length){
    // Conflicts are evidence, never resolved by array order or last write.
    if(new Set(candidates.map(r=>r.categoryId)).size>1)return unknown("Conflicting saved categories for this payee.");
    const parsed=parseExpenseInput(a.merchant,{rules:candidates});
    const r=candidates.find(r=>r.id===parsed.matchedRuleId)??candidates[0]!;
    const high=['gmail-correction','manual-correction'].includes(r.learningEvidence?.source??'')||r.confidence>=0.85;
    // A user's leaf-level mapping wins over contextual meal rules.
    if(r.categoryId!=="dining"||!/^zomato$/.test(key))return {categoryId:r.categoryId,confidence:r.confidence,source:r.learningEvidence?.source==='history'?"history":"rule",reason:`Saved category for “${r.pattern}” (${r.learningEvidence?.support??r.timesApplied} examples).`,needsReview:!high,ruleId:r.id,contexts:r.contexts};
  }
  if(conflictingPayees.includes(key))return unknown('Conflicting historical categories for this payee.');
  if(key==='zomato'&&valid.has('dining')){
    if(a.occurredAt&&['bank','payment','gmail'].includes(a.timeSource??'')){
      const hour=Number(a.occurredAt.slice(11,13));
      if(Number.isInteger(hour)&&hour>=0&&hour<24){
        const leaf=hour<12?'breakfast':hour<16?'lunch':hour<20?'snacks':'dinner';
        if(valid.has(`dining.${leaf}`))return {categoryId:`dining.${leaf}`,confidence:a.timeSource==='gmail'?0.7:0.95,source:'meal',reason:a.timeSource==='gmail'?'Meal suggestion uses email received time; please confirm.':'Food order classified by its transaction time in IST.',needsReview:a.timeSource==='gmail',contexts:[]};
      }
    }
    return {categoryId:'dining',confidence:0.9,source:'vocabulary',reason:'Known food merchant; transaction time is unknown.',needsReview:false,contexts:[]};
  }
  const known=MERCHANTS.filter(m=>m.aliases.some(alias=>words.includes(alias)));
  if(known.length===1&&valid.has(known[0]!.categoryId))return {categoryId:known[0]!.categoryId,confidence:0.9,source:'vocabulary',reason:'Recognized merchant vocabulary.',needsReview:false,contexts:[]};
  const personal=a.paymentRail==='UPI'&&a.vpa&&!a.vpa.includes('*')&&/^[\p{L} .'-]+$/u.test(a.merchant)&&words.length>=2&&words.length<=7;
  const excluded=/\b(?:store|shop|services|traders|enterprise|bank|club|cred|dreamplug|fund|investment|mandate|recharge|restaurant|cafe|hotel|mart|merchant)\b/i.test(a.merchant)||selfNames.some(n=>n&&key.includes(merchantKey(n)));
  if(personal&&!excluded&&a.amount<20000&&valid.has('transport'))return {categoryId:'transport',confidence:0.86,source:'small-upi',reason:'Your preference: outgoing UPI below ₹200 to an identifiable individual. Auto/Cab is not assumed.',needsReview:false,contexts:[]};
  return unknown('Financial debit recorded; choose its category.');
}

export function historicalRules(transactions: Transaction[], existing: ClassificationRule[]) {
  const groups=new Map<string,Transaction[]>();
  for(const t of transactions){if(t.type!=='EXPENSE'||!t.categoryId||['other','adjustment'].includes(t.categoryId))continue;const key=merchantKey(t.merchant||t.description);if(!key||key.length<4||['home','office','work','expense','payment','shopping','dinner','lunch','breakfast','snacks','auto','cab','transport','food','groceries'].includes(key))continue;groups.set(key,[...(groups.get(key)??[]),t]);}
  const rules:ClassificationRule[]=[], conflicts:string[]=[];
  for(const [key,rows] of groups){
    if(new Set(rows.map(t=>t.categoryId)).size!==1){if(!(key==='zomato'&&rows.every(t=>t.categoryId==='dining'||t.categoryId?.startsWith('dining.'))))conflicts.push(key);continue;}
    if(rows.length<3)continue;
    const pattern=deriveRulePattern(key);if(!pattern||['home','office','work','expense','payment','shopping','dinner','lunch','breakfast','snacks','auto','cab','transport','food','groceries'].includes(pattern)||existing.some(r=>r.pattern===pattern)||rules.some(r=>r.pattern===pattern))continue;
    const first=rows[0]!;
    const learned=learnFromEntry({description:key,categoryId:first.categoryId!,contexts:[],wasCorrected:true},[])[0];if(!learned)continue;
    // Namespace is per user at persistence; deterministic payee identity makes retries safe.
    rules.push({...learned,id:`history_${encodeURIComponent(key)}`,confidence:0.9,timesApplied:rows.length,learningEvidence:{source:'history',merchantKey:key,exampleIds:rows.map(t=>t.id),support:rows.length}});
  }
  return {rules,conflicts};
}

export function correctedRule(a:Alert,categoryId:string,rules:ClassificationRule[]){
  const key=merchantKey(a.merchant), pattern=deriveRulePattern(key);
  if(!pattern||!key)return;
  const existing=rules.find(r=>r.pattern===pattern&&r.learningEvidence?.merchantKey===key);
  // Scope new corrections to this payee; never rewrite a generic saved rule.
  const base=learnFromEntry({description:key,categoryId,contexts:existing?.contexts??[],wasCorrected:true,matchedRuleId:existing?.id},existing?[existing]:[])[0];
  return base&&{before:existing??null,after:{...base,id:existing?.id??`payee_${encodeURIComponent(key)}`,confidence:0.95,learningEvidence:{source:'gmail-correction' as const,merchantKey:key,exampleIds:[],support:existing?.categoryId===categoryId?(existing.learningEvidence?.support??0)+1:1}}};
}
