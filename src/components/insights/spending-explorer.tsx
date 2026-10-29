"use client";

import { useMemo, useState } from "react";
import { SpendingTrend } from "./spending-trend";
import { contextLabel, DIMENSION_LABELS } from "@/lib/domain/contexts";
import { savedTags } from "@/lib/domain/tags";
import type { Transaction, TransactionContext } from "@/lib/domain/types";
import {
  spendingReport,
  type SpendingDimension,
} from "@/lib/engine/spending-report";
import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import { Amount } from "@/components/ui/amount";
import { SelectField } from "@/components/ui/fields";
import { SelectableChip, TextAction } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { TransactionList } from "@/components/transactions/transaction-list";

const DIMENSIONS: { value: SpendingDimension; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "type", label: "Expense type" },
  { value: "merchant", label: "Merchant" },
  { value: "PEOPLE", label: "With whom" },
  { value: "PURPOSE", label: "Purpose" },
  { value: "OCCASION", label: "Occasion" },
  { value: "ATTRIBUTE", label: "Labels & attributes" },
];

export function SpendingExplorer() {
  const { db, month, now, cycleStartDay, categories } = useFinance();
  const money = useMoneyText();
  const [dimension, setDimension] = useState<SpendingDimension>("category");
  const [groupId, setGroupId] = useState("");
  const [contexts, setContexts] = useState<TransactionContext[]>([]);
  const [detail, setDetail] = useState<{
    title: string;
    ids: string[];
    month: string;
  } | null>(null);
  const tags = useMemo(
    () => savedTags(db?.transactions ?? []),
    [db?.transactions],
  );
  const report = useMemo(
    () =>
      spendingReport(db?.transactions ?? [], db?.categories ?? [], {
        month,
        now,
        cycleStartDay,
        dimension,
        includeCredits: true,
        groupId: groupId || undefined,
        contexts,
      }),
    [
      db?.transactions,
      db?.categories,
      month,
      now,
      cycleStartDay,
      dimension,
      groupId,
      contexts,
    ],
  );
  const open = (title: string, rows: Transaction[]) =>
    setDetail({ title, ids: rows.map((t) => t.id), month });
  // Resolve against the live ledger so an edit from the drill-down is reflected immediately.
  const detailRows = (db?.transactions ?? []).filter((t) =>
    detail?.ids.includes(t.id),
  );
  const toggle = (tag: TransactionContext) =>
    setContexts((selected) =>
      selected.some((c) => c.type === tag.type && c.value === tag.value)
        ? selected.filter((c) => c.type !== tag.type || c.value !== tag.value)
        : [...selected, tag],
    );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Break down by"
          value={dimension}
          onChange={(e) => setDimension(e.target.value as SpendingDimension)}
        >
          {DIMENSIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Within category"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.groups
            .filter((c) => c.id !== "adjustment")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </SelectField>
      </div>
      {tags.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] text-ink-secondary">
            Filter by tags · every selected tag must match
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <SelectableChip
                key={`${tag.type}:${tag.value}`}
                selected={contexts.some(
                  (c) => c.type === tag.type && c.value === tag.value,
                )}
                onClick={() => toggle(tag)}
              >
                {contextLabel(tag.value)}{" "}
                <span className="text-[10px] opacity-60">
                  {DIMENSION_LABELS[tag.type]}
                </span>
              </SelectableChip>
            ))}
            {contexts.length > 0 && (
              <TextAction onClick={() => setContexts([])}>
                Clear tags
              </TextAction>
            )}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-[12px] text-ink-secondary">
          Net category outflow for this selection
        </p>
        <button
          type="button"
          className="mt-1 text-left"
          onClick={() =>
            open("Spending for this selection", report.current.transactions)
          }
          aria-label="View transactions for net spending"
        >
          <Amount value={report.current.net} size="lg" />
        </button>
        <p className="mt-2 text-[12px] text-ink-secondary">
          {money(report.current.gross)} outgoing −{" "}
          {money(report.current.refunds + report.current.credits)} credits and refunds · {report.current.count}{" "}
          expenses · {money(report.current.average)} average purchase
        </p>
        <p className="mt-2 text-[12px] text-ink-tertiary">
          {report.hasPrevious
            ? `Previous cycle${report.comparableDays !== null ? `, first ${report.comparableDays} days or cycle end` : ""}: ${money(report.previous.net)}. Changes below use this comparison.`
            : "No spending history in the comparison period yet."}
          {report.comparableDays !== null &&
            " Current cycle includes transactions through today."}
        </p>
      </div>
      <SpendingTrend report={report} transactions={db?.transactions ?? []} month={month} cycleStartDay={cycleStartDay} onOpen={open} />
      {!["category", "type", "merchant"].includes(dimension) && (
        <p className="text-[12px] text-ink-tertiary">
          An expense can appear under several tags. Tag rows overlap; the
          selection total counts each transaction once. “Not tagged” means this
          dimension was not recorded.
        </p>
      )}
      {report.buckets.length === 0 ? (
        <p className="text-sm text-ink-secondary" role="status">
          No spending matches this selection. Try clearing a filter or choosing
          another cycle.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {report.buckets.map((bucket) => (
            <li key={bucket.id} className="px-4 py-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => open(bucket.label, bucket.transactions)}
              >
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{bucket.label}</span>
                  <span className="text-[12px] text-ink-tertiary">
                    {bucket.count} expenses
                    {bucket.refunds + bucket.credits > 0
                      ? ` · ${money(bucket.refunds + bucket.credits)} credited/refunded`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Amount value={bucket.net} size="sm" />
                  {bucket.change !== null && (
                    <span className="mt-1 block text-[11px] text-ink-secondary">
                      {bucket.change > 0 ? "+" : bucket.change < 0 ? "−" : ""}
                      {money(Math.abs(bucket.change))} vs previous
                    </span>
                  )}
                </span>
              </button>
              {bucket.count > 0 && bucket.previous.count > 0 && (
                <p className="mt-1 text-[11px] text-ink-tertiary">
                  Purchases: {bucket.count} vs {bucket.previous.count} · Average
                  purchase: {money(bucket.average)} vs{" "}
                  {money(bucket.previous.average)}
                </p>
              )}
              {bucket.previous.transactions.length > 0 && (
                <TextAction
                  className="mt-1 text-xs"
                  onClick={() =>
                    open(
                      `${bucket.label} · previous cycle`,
                      bucket.previous.transactions,
                    )
                  }
                >
                  View previous transactions
                </TextAction>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3 text-[12px]">
        {report.uncategorised.length > 0 && (
          <TextAction
            onClick={() =>
              open("Choose categories for these expenses", report.uncategorised)
            }
          >
            {report.uncategorised.length} expenses need a category
          </TextAction>
        )}
        {report.untagged.length > 0 && (
          <TextAction
            onClick={() =>
              open("Add context to these expenses", report.untagged)
            }
          >
            {report.untagged.length} expenses have no personal tags
          </TextAction>
        )}
      </div>
      <Sheet
        open={Boolean(detail && detail.month === month)}
        onClose={() => setDetail(null)}
        title={detail?.title}
        description="Outgoing minus recorded credits and refunds. Tap a transaction to edit it."
        size="lg"
      >
        <TransactionList
          transactions={detailRows}
          dayTotalBasis="category-flow"
          showTime
          showDayTotals={false}
        />
      </Sheet>
    </div>
  );
}
