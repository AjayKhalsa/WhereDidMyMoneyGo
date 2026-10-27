import type { Transaction } from "@/lib/domain/types";

export type EventDirection = "debit" | "credit";
export interface SourceObservation {
  kind: "statement" | "reconciliation";
  key: string;
  accountId: string;
  direction: EventDirection;
  date: string;
  reference?: string;
  payloadHash?: string;
  existingTransactionId?: string;
  allowSeparate?: boolean;
}
export interface StatementImportEntry { transaction: Transaction; observation: SourceObservation }
export interface StatementImportResult { createdIds: string[]; matched: number; removed: number }

export function normalizeBankReference(value: string | undefined): string | undefined {
  const ref = value?.trim().toUpperCase();
  if (!ref || !/^[A-Z0-9]{8,64}$/.test(ref) || !/\d/.test(ref)) return;
  const normalized = /^\d+$/.test(ref) ? ref.replace(/^0+(?=\d)/, "") : ref;
  return normalized.length >= 8 ? normalized : undefined;
}

/** Never interpret arbitrary account/VPA/phone digits as a bank reference. */
export function bankReference(text: string): string | undefined {
  return normalizeBankReference(text.match(/\b(?:reference|rrn|utr|ref)(?:\s*[:#]\s*|\s+)([A-Z0-9]{8,64})\b/i)?.[1]
    ?? text.match(/\bUPI[-/](?:P2[MPA]\/)?(\d{10,30})[-/]/i)?.[1]);
}

export function eventDirection(transaction: Transaction, accountId: string): EventDirection | undefined {
  if (transaction.type === "TRANSFER" && transaction.toAccountId === accountId) return "credit";
  if (transaction.accountId === accountId) return transaction.type === "INCOME" ? "credit" : "debit";
}

export function possibleExistingTransactions(
  transactions: Transaction[], accountId: string, amount: number,
  date: string, direction: EventDirection, reference?: string,
): Transaction[] {
  const ref = normalizeBankReference(reference);
  const day = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return transactions.filter((t) => {
    if (t.amount !== amount || eventDirection(t, accountId) !== direction ||
      Math.abs(Date.parse(`${t.date.slice(0, 10)}T00:00:00Z`) - day) > 3 * 86400000) return false;
    const other = bankReference(`${t.notes ?? ""} ${t.description}`);
    return !ref || !other || ref === other;
  });
}

export async function sourceDigest(value: ArrayBuffer | string): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0")).join("");
}
