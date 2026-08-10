import type { Paise, RecurringTransaction, Transaction } from "@/lib/domain/types";

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
  return t.merchant ? `m:${t.merchant.toLowerCase()}` : `d:${t.description.trim().toLowerCase()}`;
}

/**
 * Same derivation as `groupKey`, applied to an existing recurring rule —
 * so a rule created from a merchant-less candidate (grouped by description)
 * still excludes that candidate on the next scan, not just merchant-based
 * ones. Without this, "Add as recurring" on a description-grouped
 * candidate never stops it being suggested again.
 */
function recurringRuleKey(r: RecurringTransaction): string {
  return r.merchant
    ? `m:${r.merchant.toLowerCase()}`
    : `d:${r.description.trim().toLowerCase()}`;
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
  const excludedKeys = new Set(existingRecurring.map(recurringRuleKey));

  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;
    if (new Date(t.date).getTime() < cutoff) continue;
    if (alreadyRecurringIds.has(t.id)) continue;
    const key = groupKey(t);
    if (excludedKeys.has(key)) continue;
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
      const prev = new Date(chronological[i - 1]!.date).getTime();
      const curr = new Date(chronological[i]!.date).getTime();
      gapDays.push((curr - prev) / (24 * 60 * 60 * 1000));
    }
    const medianGap = median(gapDays);

    let suggestedFrequency: "MONTHLY" | "WEEKLY" | null = null;
    if (medianGap >= MONTHLY_GAP_DAYS[0] && medianGap <= MONTHLY_GAP_DAYS[1]) {
      suggestedFrequency = "MONTHLY";
    } else if (medianGap >= WEEKLY_GAP_DAYS[0] && medianGap <= WEEKLY_GAP_DAYS[1]) {
      suggestedFrequency = "WEEKLY";
    }
    if (!suggestedFrequency) continue;

    const latest = sorted[0]!;
    const latestDate = new Date(latest.date);
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
