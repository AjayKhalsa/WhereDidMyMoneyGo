import type { RecurringTransaction, Transaction } from "@/lib/domain/types";
import { indiaNow, transactionOccurredBy } from "@/lib/domain/transaction-time";

/** Suggestions require confirmation: Apple can bill several different services. */
export function subscriptionPaymentCandidates(rule: RecurringTransaction, transactions: Transaction[], date = new Date()) {
  if (rule.type !== 'EXPENSE') return [];
  const wallDate = indiaNow(date).slice(0, 10);
  const month = wallDate.slice(0, 7);
  return transactions.filter(t => t.type === "EXPENSE" && t.amount === rule.amount &&
    !!rule.accountId && t.accountId === rule.accountId && t.categoryId?.split(".")[0] === "bills" &&
    t.date.startsWith(month) && transactionOccurredBy(t, date) &&
    (rule.frequency !== 'WEEKLY' || Math.abs(Date.parse(t.date.slice(0,10)+'T12:00:00Z')-Date.parse(`${wallDate}T12:00:00Z`))<=3*86400000) &&
    (!t.recurringId || t.recurringId === rule.id))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function assertSubscriptionPayment(transaction: Transaction | undefined, rule: RecurringTransaction | undefined,
  expected: { amount: number; accountId: string; recurringId?: string }) {
  if (!transaction || !rule || transaction.type !== "EXPENSE" || transaction.categoryId === 'adjustment' || rule.type !== "EXPENSE" ||
    transaction.amount !== expected.amount || transaction.accountId !== expected.accountId ||
    rule.accountId && rule.accountId !== transaction.accountId ||
    (transaction.recurringId ?? null) !== (expected.recurringId ?? null)) {
    throw new Error("The payment or subscription changed. Reload and choose it again.");
  }
}
