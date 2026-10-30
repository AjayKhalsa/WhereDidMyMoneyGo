import type { Paise, RecurringTransaction, Transaction } from "@/lib/domain/types";
import {transactionOccurredBy} from '@/lib/domain/transaction-time';
import {recognizedMerchants} from './merchant-recognition';
import {merchantPayee} from './merchant-identity';
import {monthKeyToDate} from '@/lib/domain/dates';

/**
 * Recurring auto-detection.
 *
 * `RecurringTransaction` (recurring.ts) is only ever populated by hand today
 * — nothing notices that "Netflix ₹649" has now shown up three months
 * running and offers to promote it. This scans history for that pattern
 * without touching anything: it's read-only, the caller decides whether to
 * act on a candidate.
 */

export interface RecurringCandidate {
  /** Merchant name, or the normalised description when there's no merchant. */
  key: string;
  merchant?: string;
  categoryId?: string;
  accountId?: string;
  /** The most recent occurrence's amount — what you'd actually be charged next. */
  suggestedAmount: Paise;
  suggestedFrequency: "MONTHLY" | "WEEKLY";
  suggestedDayOfPeriod: number;
  /** Most recent first. */
  occurrences: Transaction[];
}

const MONTHLY_GAP_DAYS: [number, number] = [24, 36];
const WEEKLY_GAP_DAYS: [number, number] = [5, 9];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function groupKey(t: Transaction): string {
  return recurringIdentity(t.merchant||t.description);
}
/** Brand evidence is shared across merchant/description fields. Unknown names
 * retain their digits, and existing schedules suppress the same plan only. */
function recurringIdentity(name:string):string{
  name=merchantPayee(name);
  const known=recognizedMerchants(name);
  return known.length===1?`brand:${known[0]!.name.toLowerCase()}`:`text:${name.trim().toLowerCase().replace(/\s+/g,' ')}`;
}
function recurringRuleKey(r: RecurringTransaction): string {
  return recurringIdentity(r.merchant||r.description);
}

export function detectRecurringCandidates(
  transactions: Transaction[],
  existingRecurring: RecurringTransaction[],
  now: Date,
  options?: {
    lookbackDays?: number;
    minOccurrences?: number;
    amountTolerancePct?: number;
  },
): RecurringCandidate[] {
  const lookbackDays = options?.lookbackDays ?? 180;
  const minOccurrences = options?.minOccurrences ?? 3;
  const amountTolerancePct = options?.amountTolerancePct ?? 0.15;

  const cutoff = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  const alreadyRecurringIds = new Set(
    transactions.filter((t) => t.recurringId).map((t) => t.id),
  );

  const groups = new Map<string, Transaction[]>();
  const refunded=new Set(transactions.filter(t=>t.type==='INCOME'&&t.isRefund&&t.reversesTransactionId&&transactionOccurredBy(t,now)).map(t=>t.reversesTransactionId));
  for (const t of transactions) {
    if (t.type !== "EXPENSE" || refunded.has(t.id) || t.categoryId === 'adjustment' || t.amount <= 0 || !transactionOccurredBy(t,now)) continue;
    if (new Date(t.date).getTime() < cutoff) continue;
    if (alreadyRecurringIds.has(t.id)) continue;
    const identity = groupKey(t);
    if (existingRecurring.some(r=>r.type==='EXPENSE'&&recurringRuleKey(r)===identity&&(!r.accountId||r.accountId===t.accountId))) continue;
    // Distinct payment accounts can represent separate plans; never combine
    // their charges into a manufactured cadence.
    const key=JSON.stringify([identity,t.accountId??'']);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const candidates: RecurringCandidate[] = [];

  for (const [key, occurrences] of groups) {
    if (occurrences.length < minOccurrences) continue;

    const sorted = [...occurrences].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const amounts = sorted.map((t) => t.amount);
    const medianAmount = median(amounts);
    const withinTolerance = amounts.every(
      (a) => Math.abs(a - medianAmount) <= medianAmount * amountTolerancePct,
    );
    if (!withinTolerance) continue;

    const chronological = [...sorted].reverse();
    const gapDays: number[] = [];
    for (let i = 1; i < chronological.length; i++) {
      const prev = Date.parse(chronological[i - 1]!.date.slice(0,10)+'T12:00:00Z');
      const curr = Date.parse(chronological[i]!.date.slice(0,10)+'T12:00:00Z');
      gapDays.push((curr - prev) / (24 * 60 * 60 * 1000));
    }

    let suggestedFrequency: "MONTHLY" | "WEEKLY" | null = null;
    if (gapDays.every(g=>g>=MONTHLY_GAP_DAYS[0]&&g<=MONTHLY_GAP_DAYS[1])) {
      suggestedFrequency = "MONTHLY";
    } else if (gapDays.every(g=>g>=WEEKLY_GAP_DAYS[0]&&g<=WEEKLY_GAP_DAYS[1])) {
      suggestedFrequency = "WEEKLY";
    }
    if (!suggestedFrequency) continue;

    const latest = sorted[0]!;
    const latestDate = monthKeyToDate(latest.date.slice(0,10));
    const suggestedDayOfPeriod =
      suggestedFrequency === "WEEKLY" ? latestDate.getDay() : latestDate.getDate();

    candidates.push({
      key,
      merchant: latest.merchant,
      categoryId: latest.categoryId,
      accountId: latest.accountId,
      suggestedAmount: latest.amount,
      suggestedFrequency,
      suggestedDayOfPeriod,
      occurrences: sorted,
    });
  }

  return candidates.sort(
    (a, b) =>
      b.occurrences.length - a.occurrences.length ||
      new Date(b.occurrences[0]!.date).getTime() - new Date(a.occurrences[0]!.date).getTime(),
  );
}
