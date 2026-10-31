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
import { bankReference, eventDirection, normalizeBankReference, possibleExistingTransactions, type EventDirection } from "./identity";
import {possibleRecordedSplits,recordedSplitGroups} from './split-settlements';
import {creditPurposeHint,type CreditPurpose} from './credit-purpose';

/**
 * Statement rows -> reviewable drafts.
 *
 * Bank-agnostic — takes the bank-specific parser's output (`StatementRow`)
 * and does everything from here on the same way regardless of which bank
 * produced it, so a second bank parser only ever needs to produce the same
 * `StatementRow` shape to plug into this.
 */

export interface ImportDraft {
  reference?: string;
  direction: EventDirection;
  possibleMatchIds: string[];
  /** Explicit companion groups whose total matches; review only, never a link. */
  possibleSplitIds: string[];
  date: string;
  amount: Paise;
  type: TransactionType;
  needsCreditReview:boolean;
  suggestedCreditPurpose?:CreditPurpose;
  isRefund?:boolean;
  refundCategoryId?:string;
  /** For received transfers, the other account money came from. */
  fromAccountId?:string;
  description: string;
  categoryId?: string;
  contexts: TransactionContext[];
  merchant?: string;
  confidence: number;
  reasons: string[];
  matchedRuleId?: string;
  /**
   * Where a TRANSFER landed. A statement only ever shows money leaving this
   * account, never where it went, so this is deliberately left unset for the
   * reviewer to fill in — committing a transfer without it would debit the
   * bank and credit nothing, leaving a card's outstanding permanently too
   * high.
   */
  toAccountId?: string;
  /** Same date + amount + description already exists on this account. */
  isLikelyDuplicate: boolean;
  /** The untouched bank narration, kept for the review screen. */
  rawNarration: string;
}

function fingerprint(dateIso: string, amount: Paise, description: string, direction: EventDirection): string {
  const normalised = description.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);
  return `${dateIso.slice(0, 10)}|${amount}|${direction}|${normalised}`;
}

export function buildImportDrafts(
  rows: StatementRow[],
  accountId: string,
  existingTransactions: Transaction[],
  rules: ClassificationRule[],
): ImportDraft[] {
  const splitGroups=recordedSplitGroups(existingTransactions);
  // Counted, not boolean: two genuinely separate ₹150 UPI payments to the
  // same place on the same day shouldn't both get flagged as duplicates of
  // each other just because one of them matches something already saved.
  const existingCounts = new Map<string, number>();
  for (const t of existingTransactions) {
    const direction = eventDirection(t, accountId);
    if (!direction) continue;
    const key = fingerprint(t.date, t.amount, t.description, direction);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const amount = row.withdrawal > 0 ? row.withdrawal : row.deposit;
    const columnType: TransactionType = row.withdrawal > 0 ? "EXPENSE" : "INCOME";
    const direction = row.withdrawal > 0 ? "debit" as const : "credit" as const;
    const reference = normalizeBankReference(row.reference) ?? bankReference(row.narration);
    const possibleMatches = possibleExistingTransactions(existingTransactions, accountId, amount, row.date, direction, reference);
    const { cleaned, typeHint } = cleanBankNarration(row.narration);
    // A debit cannot become income because its narration mentions interest;
    // an incoming redemption/SIP/card credit is never an outgoing investment.
    const type = direction==='credit'?'INCOME':typeHint==='INCOME'?columnType:typeHint??columnType;
    const suggestedCreditPurpose=direction==='credit'?creditPurposeHint(row.narration):undefined;

    const parsed = parseExpenseInput(`${amount / 100} ${cleaned}`, {
      rules,
      date: new Date(row.date),
    });
    const description = parsed.description || cleaned;

    const key = fingerprint(row.date, amount, description, direction);
    const remaining = existingCounts.get(key) ?? 0;
    const isLikelyDuplicate = remaining > 0 && possibleMatches.length > 0;
    if (isLikelyDuplicate) existingCounts.set(key, remaining - 1);

    return {
      reference, direction, possibleMatchIds: possibleMatches.map((t) => t.id),
      possibleSplitIds:possibleRecordedSplits(splitGroups,accountId,amount,row.date,direction,reference).map(group=>group.id),
      date: row.date,
      amount,
      type,
      needsCreditReview:direction==='credit'&&suggestedCreditPurpose!=='income',
      suggestedCreditPurpose,
      refundCategoryId:direction==='credit'?parsed.categoryId:undefined,
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
