import type { Account, Transaction } from "@/lib/domain/types";
import { accountBalance, creditCardOutstanding, creditCardCreditBalance } from "./analytics";

export function balanceAt(account: Account, transactions: Transaction[], asOf: string): number {
  const rows = transactions.filter((t) => t.date.slice(0, 10) <= asOf);
  return account.type === "CREDIT_CARD"
    ? creditCardOutstanding(rows, account.id) - creditCardCreditBalance(rows, account.id)
    : accountBalance(account, rows);
}

/** Accounting fields only: editing a label/category does not change a balance. */
export function ledgerFingerprint(account: Account, transactions: Transaction[], asOf: string): string {
  const rows = transactions.filter((t) => t.date.slice(0, 10) <= asOf &&
    (t.accountId === account.id || t.toAccountId === account.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => [t.id, t.type, t.amount, t.date.slice(0, 19), t.accountId ?? null,
      t.toAccountId ?? null, Boolean(t.isRefund)]);
  const text = JSON.stringify([account.id, account.type, account.openingBalance,
    account.openingBalanceAsOf ?? null, asOf, rows]);
  let a = 2166136261, b = 3335557771;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 16777619);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}

export function balanceVerification(account: Account, transactions: Transaction[]) {
  const predatesOpening = Boolean(account.openingBalanceAsOf && transactions.some((t) =>
    (t.accountId === account.id || t.toAccountId === account.id) &&
    t.date.slice(0, 10) < account.openingBalanceAsOf!));
  const checkpoint = account.reconciliation;
  if (!checkpoint) return { status: "unverified" as const, predatesOpening };
  const calculated = balanceAt(account, transactions, checkpoint.asOf);
  const difference = calculated - checkpoint.balance;
  const status = checkpoint.status === "verified" && !predatesOpening && difference === 0 &&
    ledgerFingerprint(account, transactions, checkpoint.asOf) === checkpoint.fingerprint
    ? "verified" as const : "stale" as const;
  return { status, predatesOpening, checkpoint, difference };
}
