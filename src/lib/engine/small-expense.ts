import type {ClassificationRule} from '@/lib/domain/types';
import {explicitCorrection} from './classification-rules';
import {classificationMerchantKey} from './merchant-identity';
import {recognizedMerchants} from './merchant-recognition';
/** Owner preference: fallback only; explicit choices and merchant evidence win. */
export const AUTO_EXPENSE_LIMIT=10000; // paise, strictly less than ₹100
export const smallExpenseDefault=(amount:number|null|undefined)=>Number.isSafeInteger(amount)&&amount!>0&&amount!<AUTO_EXPENSE_LIMIT;
export function transportAutoCategory(categories:Array<{id:string;name?:string;parentId?:string|null}>):string|undefined {
 const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 const parents=new Set(categories.filter(c=>c.id==='transport'||(!c.parentId&&norm(c.name??'')==='transport')).map(c=>c.id));
 const matches=categories.filter(c=>parents.has(c.parentId??c.id.slice(0,c.id.lastIndexOf('.')))&&(c.name?['auto','autorickshaw','rickshaw','autocab'].includes(norm(c.name)):c.id==='transport.auto'));
 return matches.length===1?matches[0]!.id:undefined;
}

/** A weak guess for a surname must not override the default for another payee. */
export function smallExpenseRules(rules:ClassificationRule[],text:string,amount:number|null|undefined):ClassificationRule[]{
 if(!smallExpenseDefault(amount))return rules;
 const key=classificationMerchantKey(text);
 return rules.filter(r=>{
  if(r.conditions||r.learningEvidence||explicitCorrection(r)||r.confidence>=0.85)return true;
  if(r.categoryId==='other')return false;
  const alias=r.merchant&&classificationMerchantKey(r.merchant);
  return !(alias&&alias!==key&&key.split(' ').length>=2&&alias.split(' ').length===1&&!recognizedMerchants(text).length&&!recognizedMerchants(r.merchant!).length);
 });
}
