import type { Transaction } from '@/lib/domain/types';

/** Attribution never edits the saved credit or moves it into the purchase's cycle. */
export function spendingAttribution(transactions: Transaction[]) {
  const byId = new Map(transactions.map(t => [t.id, t]));
  return (t: Transaction): Transaction => {
    const original = t.type === 'INCOME' && t.isRefund && t.reversesTransactionId ? byId.get(t.reversesTransactionId) : undefined;
    return original?.type === 'EXPENSE' ? { ...t, categoryId: original.categoryId, merchant: original.merchant, contexts: original.contexts } : t;
  };
}
export function isSpendingActivity(t: Transaction): boolean {
  return t.categoryId !== 'adjustment' && (t.type === 'EXPENSE' || (t.type === 'INCOME' && !!t.isRefund));
}
/** Category cash flow includes explicitly categorized credits; salary without
 * a spending category is never subtracted from consumption spending. */
export function isCategoryActivity(t: Transaction): boolean {
  return isSpendingActivity(t) || (t.type === 'INCOME' && !!t.categoryId && !['other','adjustment'].includes(t.categoryId));
}
export function spendingSummary(rows: Transaction[], all = rows) {
  const metadata = spendingAttribution(all);
  let gross = 0, refunds = 0, credits = 0, count = 0, creditCount = 0;
  for (const t of rows) {
    if (!isCategoryActivity(metadata(t))) continue;
    if (t.type === 'EXPENSE') { gross += t.amount; count++; }
    else { creditCount++; if (t.isRefund) refunds += t.amount; else credits += t.amount; }
  }
  return { gross, refunds, credits, count, creditCount, net: gross - refunds - credits, spending: gross - refunds };
}
/** Consumption spending: confirmed refunds reduce spend, ordinary income does not. */
export function netSpending(rows: Transaction[], all = rows): number {
  return spendingSummary(rows, all).spending;
}
/** For a category/merchant/context view, show all recorded money returned. */
export function netCategoryOutflow(rows: Transaction[], all = rows): number {
  return spendingSummary(rows, all).net;
}

/** Positive contributions, negative explicitly linked redemption transfers. */
export function investmentMovement(t: Transaction): number {
  if (t.categoryId === 'adjustment') return 0;
  if (t.type === 'INVESTMENT') return t.amount;
  return t.type === 'TRANSFER' && t.investmentId && t.accountId && t.toAccountId && t.accountId !== t.toAccountId ? -t.amount : 0;
}
export function netInvestment(rows: Transaction[]): number {
  return rows.reduce((sum,t) => sum + investmentMovement(t), 0);
}
