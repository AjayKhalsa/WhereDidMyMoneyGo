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
