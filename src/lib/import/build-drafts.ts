import { cleanBankNarration } from "@/lib/engine/narration";
import { parseExpenseInput } from "@/lib/engine/parser";
import type {
  ClassificationRule,
  Paise,
  Transaction,
  TransactionContext,
  TransactionType,
} from "@/lib/domain/types";
import type { StatementRow } from "./statement-row";

/**
 * Statement rows -> reviewable drafts.
 *
 * Bank-agnostic — takes the bank-specific parser's output (`StatementRow`)
 * and does everything from here on the same way regardless of which bank
 * produced it, so a second bank parser only ever needs to produce the same
 * `StatementRow` shape to plug into this.
 */

export interface ImportDraft {
  date: string;
  amount: Paise;
  type: TransactionType;
  description: string;
  categoryId?: string;
  contexts: TransactionContext[];
  merchant?: string;
  confidence: number;
  reasons: string[];
  matchedRuleId?: string;
  /** Same date + amount + description already exists on this account. */
  isLikelyDuplicate: boolean;
  /** The untouched bank narration, kept for the review screen. */
  rawNarration: string;
}

function fingerprint(dateIso: string, amount: Paise, description: string): string {
  const normalised = description.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);
  return `${dateIso.slice(0, 10)}|${amount}|${normalised}`;
}

export function buildImportDrafts(
  rows: StatementRow[],
  accountId: string,
  existingTransactions: Transaction[],
  rules: ClassificationRule[],
): ImportDraft[] {
  // Counted, not boolean: two genuinely separate ₹150 UPI payments to the
  // same place on the same day shouldn't both get flagged as duplicates of
  // each other just because one of them matches something already saved.
  const existingCounts = new Map<string, number>();
  for (const t of existingTransactions) {
    if (t.accountId !== accountId) continue;
    const key = fingerprint(t.date, t.amount, t.description);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const amount = row.withdrawal > 0 ? row.withdrawal : row.deposit;
    const columnType: TransactionType = row.withdrawal > 0 ? "EXPENSE" : "INCOME";
    const { cleaned, typeHint } = cleanBankNarration(row.narration);
    const type = typeHint ?? columnType;

    const parsed = parseExpenseInput(`${amount / 100} ${cleaned}`, {
      rules,
      date: new Date(row.date),
    });
    const description = parsed.description || cleaned;

    const key = fingerprint(row.date, amount, description);
    const remaining = existingCounts.get(key) ?? 0;
    const isLikelyDuplicate = remaining > 0;
    if (isLikelyDuplicate) existingCounts.set(key, remaining - 1);

    return {
      date: row.date,
      amount,
      type,
      description,
      // Matches addIncome()'s existing convention — INCOME/TRANSFER rows
      // don't carry a category in this app, only EXPENSE does.
      categoryId: type === "EXPENSE" ? parsed.categoryId : undefined,
      contexts: parsed.contexts,
      merchant: parsed.merchant,
      confidence: parsed.confidence,
      reasons: parsed.reasons,
      matchedRuleId: parsed.matchedRuleId,
      isLikelyDuplicate,
      rawNarration: row.narration,
    };
  });
}
