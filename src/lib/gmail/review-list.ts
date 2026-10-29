import type { Transaction } from "@/lib/domain/types";
import { merchantKey } from "@/lib/engine/merchant-identity";
import { possibleExistingTransactions } from "@/lib/import/identity";
import type { Alert } from "./alerts";
import { strongBackfillMatch } from "./backfill-plan";

type Source = Parameters<typeof strongBackfillMatch>[2][number];
interface ReviewReceipt {
  message_id: string;
  status: string;
  category_review?: boolean;
  transaction_id?: string | null;
  category_review_snapshot?: { category_id?: string | null } | null;
  candidate?: Alert | null;
  reason?: string | null;
  suppress_suggested_match?: boolean;
}

/** Presentation only: never reset receipts or overwrite a saved correction. */
export function actionableGmailReviews<T extends ReviewReceipt>(receipts: T[], transactions: Transaction[], sources: Source[], categoryIds: Set<string>): T[] {
  const byId = new Map(transactions.map(t => [t.id, t]));
  return receipts.filter(receipt => {
    if (receipt.status === "logged" && receipt.category_review) {
      const entry = receipt.transaction_id ? byId.get(receipt.transaction_id) : undefined;
      const snapshot = receipt.category_review_snapshot;
      // A changed, specific category is evidence that the ledger correction
      // has already resolved this old prompt. Notes-only edits are not.
      const corrected = entry?.categoryId && !["other", "adjustment"].includes(entry.categoryId)
        && categoryIds.has(entry.categoryId) && snapshot && Object.hasOwn(snapshot,"category_id") && snapshot.category_id !== entry.categoryId;
      return !corrected;
    }
    if (receipt.status !== "review") return false;
    const candidate = receipt.candidate;
    if (candidate?.accountId && !/authenticat/i.test(receipt.reason ?? "")) {
      return strongBackfillMatch(candidate, transactions, sources, receipt.message_id)?.status !== "matched";
    }
    return true;
  });
}

/** Recommendation only: the user still confirms a weak match before linking. */
export function suggestedExistingEntry(alert: Alert | undefined, transactions: Transaction[]): string | undefined {
  if(!alert?.accountId)return;
  const key=merchantKey(alert.merchant);
  if(key.length<4)return;
  const candidates=possibleExistingTransactions(transactions,alert.accountId,alert.amount,alert.date,alert.direction,alert.reference)
    .filter(t=>t.date.slice(0,10)===alert.date&&merchantKey(t.merchant||t.description)===key);
  return candidates.length===1?candidates[0]!.id:undefined;
}

/** Existing-entry housekeeping must never look like another missing payment. */
export function groupGmailReviews<T extends ReviewReceipt>(receipts:T[],transactions:Transaction[]) {
  const ids=new Set(transactions.map(t=>t.id));
  const category:T[]=[],possibleExisting:T[]=[];
  const financial:Array<T & {suppress_suggested_match?:boolean}>=[];
  const suggestions=new Map<string,string>();
  const competing=new Map<string,number>();
  for(const receipt of receipts)if(receipt.status==='review'&&!/authenticat/i.test(receipt.reason??'')){
    const target=suggestedExistingEntry(receipt.candidate??undefined,transactions);
    if(target){suggestions.set(receipt.message_id,target);competing.set(target,(competing.get(target)??0)+1);}
  }
  for(const receipt of receipts){
    if(receipt.status==='logged'&&receipt.category_review&&receipt.transaction_id&&ids.has(receipt.transaction_id))category.push(receipt);
    else if(suggestions.has(receipt.message_id)){
      if(competing.get(suggestions.get(receipt.message_id)!)===1)possibleExisting.push(receipt);
      else financial.push({...receipt,suppress_suggested_match:true,reason:'Several emails could refer to the same ledger payment. Verify separate payments versus duplicate alerts before linking.'});
    }
    else financial.push(receipt);
  }
  return {category,possibleExisting,financial};
}
