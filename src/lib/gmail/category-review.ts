import type { Category, ClassificationRule } from '@/lib/domain/types';
import { suggestCategory, type CategorySuggestion } from './classification';
import type { Alert } from './alerts';

export interface CategoryReviewState {
  categorySuggestion?: CategorySuggestion;
  entryChanged?: boolean;
}
interface Receipt {
  status: string;
  category_review?: boolean;
  transaction_id?: string | null;
  category_review_snapshot?: Record<string, unknown> | null;
  candidate?: unknown;
}

/** Compare database row images without relying on JSON object key order. */
function sameImage(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((value, i) => sameImage(value, b[i]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameImage(left[key], right[key]));
}

/** Read-only current suggestions. Never rewrite source evidence or ledger rows.
 * Only unchanged, already-recorded uncategorised expenses are eligible. */
export function currentCategoryReviews<T extends Receipt>(receipts: T[], rows: Record<string, any>[],
  rules: ClassificationRule[], categories: Pick<Category, 'id' | 'name' | 'parentId'>[],
  selfNames: string[] = [], conflicts: string[] = []): Array<T & CategoryReviewState> {
  const byId = new Map(rows.map(row => [row.id, row]));
  return receipts.map(receipt => {
    if (receipt.status !== 'logged' || !receipt.category_review) return { ...receipt };
    const row = receipt.transaction_id && byId.get(receipt.transaction_id);
    if (!row || !receipt.category_review_snapshot || !sameImage(row, receipt.category_review_snapshot))
      return { ...receipt, entryChanged: true };
    if (row.type !== 'EXPENSE' || row.category_id !== 'other' || row.is_refund || row.reverses_transaction_id || row.amount <= 0)
      return { ...receipt };
    const alert = receipt.candidate as Alert | undefined;
    if (!alert || typeof alert.merchant !== 'string' || alert.direction !== 'debit'
      || alert.special || alert.accountId !== row.account_id || alert.amount !== row.amount
      || alert.date !== String(row.date).slice(0, 10)) return { ...receipt };
    const suggestion = suggestCategory(alert, rules, categories, selfNames, conflicts);
    if (suggestion.needsReview || ['other', 'adjustment'].includes(suggestion.categoryId)
      || !categories.some(category => category.id === suggestion.categoryId)) return { ...receipt };
    return { ...receipt, categorySuggestion: suggestion };
  });
}
