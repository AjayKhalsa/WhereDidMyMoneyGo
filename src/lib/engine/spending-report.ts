import { spendingAttribution, isSpendingActivity, isCategoryActivity, spendingSummary } from "./spending";
import { createCategoryLookup } from "@/lib/domain/categories";
import { contextLabel } from "@/lib/domain/contexts";
import {
  addMonths,
  daysBetween,
  endOfMonth,
  monthKey,
  monthKeyToDate,
  toDateInputValue,
  type MonthKey,
} from "@/lib/domain/dates";
import type {
  Category,
  ContextType,
  Transaction,
  TransactionContext,
} from "@/lib/domain/types";
import { merchantKey } from "./merchant-identity";

export type SpendingDimension = "category" | "type" | "merchant" | ContextType;
export interface SpendingFilter {
  groupId?: string;
  /** All selected tags must match, including their dimension. */
  contexts?: TransactionContext[];
}
export interface SpendingSummary {
  gross: number;
  refunds: number;
  credits: number;
  creditCount: number;
  net: number;
  count: number;
  average: number;
  transactions: Transaction[];
}
export interface SpendingBucket extends SpendingSummary {
  id: string;
  label: string;
  previous: SpendingSummary;
  change: number | null;
}
export interface SpendingReport {
  current: SpendingSummary;
  previous: SpendingSummary;
  hasPrevious: boolean;
  comparableDays: number | null;
  buckets: SpendingBucket[];
  uncategorised: Transaction[];
  untagged: Transaction[];
}

function summarise(rows: Transaction[], all: Transaction[]): SpendingSummary {
  const summary = spendingSummary(rows, all);
  return { ...summary, average: summary.count ? Math.round(summary.gross / summary.count) : 0, transactions: rows };
}

/** Each figure retains its source rows. Refunds inherit linked purchase metadata,
 * but remain in the cycle when the money was actually returned. */
export function spendingReport(
  transactions: Transaction[],
  categories: Category[],
  options: SpendingFilter & {
    month: MonthKey;
    now: Date;
    cycleStartDay: number;
    dimension: SpendingDimension;
    /** Categorized cash flow includes explicit same-category credits, not all income. */
    includeCredits?: boolean;
  },
): SpendingReport {
  const lookup = createCategoryLookup(categories);
  const metadata = spendingAttribution(transactions);
  const eligible = transactions.filter(t => options.includeCredits ? isCategoryActivity(metadata(t)) : isSpendingActivity(metadata(t)));
  const matches = (t: Transaction) => {
    const m = metadata(t);
    if (
      options.groupId &&
      (lookup.groupOf(m.categoryId ?? "other")?.id ?? "other") !==
        options.groupId
    )
      return false;
    return (options.contexts ?? []).every((c) =>
      m.contexts.some((v) => v.type === c.type && v.value === c.value),
    );
  };
  const previousMonth = addMonths(options.month, -1, options.cycleStartDay);
  const currentStart = monthKeyToDate(options.month);
  const live = monthKey(options.now, options.cycleStartDay) === options.month;
  const comparableDays = live
    ? daysBetween(currentStart, options.now) + 1
    : null;
  const period = (key: MonthKey) => {
    const start = monthKeyToDate(key);
    const end = endOfMonth(key, options.cycleStartDay);
    if (comparableDays !== null) {
      const cutoff = new Date(start);
      cutoff.setDate(cutoff.getDate() + comparableDays - 1);
      if (cutoff < end) end.setTime(cutoff.getTime());
    }
    const from = toDateInputValue(start),
      to = toDateInputValue(end);
    return eligible.filter(
      (t) => t.date.slice(0, 10) >= from && t.date.slice(0, 10) <= to,
    );
  };
  const currentPeriod = period(options.month),
    previousPeriod = period(previousMonth);
  const currentRows = currentPeriod.filter(matches),
    previousRows = previousPeriod.filter(matches);
  const labels = new Map<string, string>();
  const keys = (t: Transaction): string[] => {
    const m = metadata(t);
    if (options.dimension === "category" || options.dimension === "type") {
      const category = lookup.byId.get(m.categoryId ?? "other");
      const id =
        options.dimension === "category"
          ? (lookup.groupOf(category?.id ?? "other")?.id ?? "other")
          : (category?.id ?? "other");
      labels.set(
        id,
        options.dimension === "category"
          ? lookup.groupNameOf(id)
          : lookup.pathOf(id),
      );
      return [id];
    }
    if (options.dimension === "merchant") {
      // Descriptions can contain personal context; don't invent a payee from them.
      const id = m.merchant
        ? merchantKey(m.merchant) || "__unknown"
        : "__unknown";
      labels.set(
        id,
        id === "__unknown"
          ? "Merchant not recorded"
          : id.replace(/\b\p{L}/gu, (c) => c.toUpperCase()),
      );
      return [id];
    }
    const values = [
      ...new Set(
        m.contexts
          .filter((c) => c.type === options.dimension)
          .map((c) => c.value),
      ),
    ];
    if (!values.length) {
      labels.set("__untagged", "Not tagged");
      return ["__untagged"];
    }
    values.forEach((v) => labels.set(v, contextLabel(v)));
    return values;
  };
  const group = (rows: Transaction[]) => {
    const buckets = new Map<string, Transaction[]>();
    for (const t of rows)
      for (const key of keys(t)) {
        const bucket = buckets.get(key) ?? [];
        bucket.push(t);
        buckets.set(key, bucket);
      }
    return buckets;
  };
  const current = group(currentRows),
    previous = group(previousRows);
  const hasPrevious = previousPeriod.length > 0;
  const buckets = [...new Set([...current.keys(), ...previous.keys()])]
    .map((id) => {
      const now = summarise(current.get(id) ?? [], transactions),
        before = summarise(previous.get(id) ?? [], transactions);
      return {
        id,
        label: labels.get(id)!,
        ...now,
        previous: before,
        change: hasPrevious ? now.net - before.net : null,
      };
    })
    .sort((a, b) => b.net - a.net || a.label.localeCompare(b.label));
  return {
    current: summarise(currentRows, transactions),
    previous: summarise(previousRows, transactions),
    hasPrevious,
    comparableDays,
    buckets,
    uncategorised: currentRows.filter(
      (t) =>
        t.type === "EXPENSE" &&
        (!t.categoryId ||
          t.categoryId === "other" ||
          !lookup.byId.has(t.categoryId)),
    ),
    untagged: currentRows.filter(
      (t) =>
        t.type === "EXPENSE" &&
        !t.contexts.some((c) => !["weekend", "late-night"].includes(c.value)),
    ),
  };
}
