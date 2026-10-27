import type { Category, ClassificationRule, Transaction, TransactionContext } from "@/lib/domain/types";
import type { admin } from "./server";

export function domainRow<T>(row:Record<string,unknown>,contexts:TransactionContext[]=[]):T {
  return {...Object.fromEntries(Object.entries(row).filter(([k,v])=>k!=='user_id'&&v!==null).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),v])),contexts} as T;
}
export function ruleRow(rule:ClassificationRule){return Object.fromEntries(Object.entries(rule).filter(([k])=>k!=='contexts').map(([k,v])=>[k.replace(/[A-Z]/g,m=>`_${m.toLowerCase()}`),v]));}
export async function learningData(db:ReturnType<typeof admin>,userId:string,history=false){
  const [saved,contexts,categories]=await Promise.all([
    db.from('rules').select('*').eq('user_id',userId),db.from('rule_contexts').select('*').eq('user_id',userId),db.from('categories').select('id,name,parent_id').eq('user_id',userId),
  ]);
  for(const r of [saved,contexts,categories])if(r.error)throw r.error;
  const rules=(saved.data??[]).map(r=>domainRow<ClassificationRule>(r,(contexts.data??[]).filter(c=>c.rule_id===r.id).map(c=>({type:c.type,value:c.value}))));
  const transactions:Transaction[]=[];
  if(history){
    // Only explicit manual entries or clear category corrections train history.
    // Parser-accepted labels are not proof of a user's choice.
    const receipts=await db.from('gmail_messages').select('transaction_id,candidate').eq('user_id',userId).eq('status','logged');if(receipts.error)throw receipts.error;
    for(let from=0;from<10000;from+=1000){
      const page=await db.from('transactions').select('*').eq('user_id',userId).eq('type','EXPENSE').order('id').range(from,from+999);if(page.error)throw page.error;
      for(const row of page.data??[]){
        const corrected=receipts.data?.some(m=>m.transaction_id===row.id&&m.candidate&&m.candidate.categoryId!==row.category_id);
        // Legacy txn_ entries were explicitly saved/reviewed in the app before
        // source receipts existed. New automatic Gmail/statement IDs use their
        // own namespaces and must never train from their own predictions.
        const legacyReviewed=row.id.startsWith('txn_')&&row.source==='imported'&&!row.notes?.startsWith('Statement source:');
        if(row.source==='manual'||row.source==='parsed'||legacyReviewed||corrected)transactions.push(domainRow<Transaction>(row));
      }
      if((page.data?.length??0)<1000)break;
    }
  }
  return {rules,categories:(categories.data??[]).map(r=>domainRow<Pick<Category,'id'|'name'|'parentId'>>(r)),transactions};
}
