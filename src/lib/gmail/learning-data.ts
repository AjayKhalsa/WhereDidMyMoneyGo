import type { Category, ClassificationRule, Transaction, TransactionContext } from "@/lib/domain/types";
import type { admin } from "./server";
import { completeLoad } from '@/lib/data/complete-load';

export function domainRow<T>(row:Record<string,unknown>,contexts:TransactionContext[]=[]):T {
  return {...Object.fromEntries(Object.entries(row).filter(([k,v])=>k!=='user_id'&&v!==null).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),v])),contexts} as T;
}
export function ruleRow(rule:ClassificationRule){return Object.fromEntries(Object.entries(rule).filter(([k])=>k!=='contexts').map(([k,v])=>[k.replace(/[A-Z]/g,m=>`_${m.toLowerCase()}`),v]));}
export async function learningData(db:ReturnType<typeof admin>,userId:string,history=false){
  // Counted ordered paging detects shortened responses, races and duplicate
  // pages. Never train or classify from a silently truncated first page.
  const load=(table:string,columns:string,keys:string[],filter?:[string,string])=>completeLoad<Record<string,any>>((from,to)=>{
    let query=db.from(table).select(columns,{count:'exact'}).eq('user_id',userId);
    if(filter)query=query.eq(...filter);
    for(const key of keys)query=query.order(key);
    return query.range(from,to);
  },row=>JSON.stringify(keys.map(key=>row[key])));
  const [saved,contexts,categories]=await Promise.all([
    load('rules','*',['id']),load('rule_contexts','*',['rule_id','type','value']),load('categories','id,name,parent_id',['id']),
  ]);
  const rules=(saved.data??[]).map(r=>domainRow<ClassificationRule>(r,(contexts.data??[]).filter(c=>c.rule_id===r.id).map(c=>({type:c.type,value:c.value}))));
  const transactions:Transaction[]=[];
  if(history){
    // Only explicit manual entries or clear category corrections train history.
    // Parser-accepted labels are not proof of a user's choice.
    const [receipts,page]=await Promise.all([
      load('gmail_messages','message_id,transaction_id,candidate',['message_id'],['status','logged']),
      load('transactions','*',['id'],['type','EXPENSE']),
    ]);
    const corrections=new Map<string,Set<string>>();
    for(const receipt of receipts.data){
      // A linked food receipt has no predicted category. Its attachment is
      // not evidence that the user corrected the financial transaction.
      if(receipt.transaction_id&&typeof receipt.candidate?.categoryId==='string'){
        const values=corrections.get(receipt.transaction_id)??new Set<string>();
        values.add(receipt.candidate.categoryId);corrections.set(receipt.transaction_id,values);
      }
    }
    for(const row of page.data){
      if(row.amount<=0||row.is_refund||row.reverses_transaction_id||row.category_id==='adjustment')continue;
      const corrected=[...corrections.get(row.id)??[]].some(id=>id!==row.category_id);
      // Legacy txn_ entries were explicitly saved/reviewed in the app before
      // source receipts existed. New automatic Gmail/statement IDs use their
      // own namespaces and must never train from their own predictions.
      const legacyReviewed=row.id.startsWith('txn_')&&row.source==='imported'&&!row.notes?.startsWith('Statement source:');
      if(corrected||(!row.enrichment&&(row.source==='manual'||row.source==='parsed'||legacyReviewed)))transactions.push(domainRow<Transaction>(row));
    }
  }
  return {rules,categories:(categories.data??[]).map(r=>domainRow<Pick<Category,'id'|'name'|'parentId'>>(r)),transactions};
}
