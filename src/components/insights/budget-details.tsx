"use client";

import { useFinance } from "@/lib/hooks/use-finance";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import type { BudgetPlan } from "@/lib/engine/budgets";
import { LazyDetails } from "@/components/ui/lazy-details";
import { ProgressTrack } from "@/components/ui/progress-track";

function BudgetEntries({ ids }: { ids: string[] }) {
  const { transactionIndex: index } = useFinance();
  const money = useMoneyText();
  return (
    <ul className="max-h-52 space-y-2 overflow-auto">
      {ids.map(id => {
        const transaction = index.originalById.get(id);
        if (!transaction) return null;
        const personal = index.personalById.get(id)?.amount ?? transaction.amount;
        return (
          <li key={id} className="flex justify-between gap-3">
            <span>{transaction.date.slice(0, 10)} · {transaction.merchant || transaction.description}</span>
            <span className="shrink-0 text-right tnum">
              {transaction.isRefund ? "−" : ""}{money(personal)}
              {personal !== transaction.amount && <span className="block text-ink-tertiary">{money(transaction.amount)} bank</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function BudgetCategoryList() {
  const { budget } = useFinance();
  const money = useMoneyText();
  if (!budget) return null;
  return (
    <section className="visual-card">
      <h2 className="text-lg font-semibold">Where you stand</h2>
      <p className="mt-1 text-sm text-ink-secondary">Saved limits, actual spending and the transactions behind them.</p>
      <div className="mt-5 space-y-5">
        {budget.buckets.filter(bucket => bucket.id !== "unmapped" || bucket.actual !== 0).map(bucket => (
          <div key={bucket.id}>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">{bucket.label}</span>
              <span className="tnum">
                {money(bucket.actual)} / {money(bucket.limit)}{" "}
                <span className={bucket.status === "over" ? "text-danger" : "text-ink-secondary"}>
                  · {money(Math.abs(bucket.remaining))} {bucket.remaining < 0 ? "over" : "left"}
                </span>
              </span>
            </div>
            <ProgressTrack label={`${bucket.label} spent`} value={bucket.ratio * 100} className="mt-2" animate={false}
              tone={bucket.status === "over" ? "danger" : bucket.status === "near" ? "warning" : "accent"} />
            {bucket.transactionIds.length > 0 && (
              <LazyDetails className="mt-1 text-xs text-ink-secondary" summary={`Review ${bucket.transactionIds.length} entries`}>
                <BudgetEntries ids={bucket.transactionIds} />
              </LazyDetails>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function BudgetMappingEditor({ plan, onChange }: { plan: BudgetPlan; onChange: (plan: BudgetPlan) => void }) {
  const { db, categories } = useFinance();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plan.buckets.map((bucket, index) => (
        <label key={bucket.id} className="text-sm">
          {bucket.label}
          <select multiple aria-label={`${bucket.label} categories`} value={bucket.categoryIds}
            onChange={event => {
              const categoryIds = Array.from(event.target.selectedOptions, option => option.value);
              onChange({ ...plan, buckets: plan.buckets.map((entry, i) => i === index ? { ...entry, categoryIds } : entry) });
            }}
            className="mt-2 block h-28 w-full rounded-lg border border-line bg-surface p-2">
            {db?.categories.filter(category => category.id !== "adjustment").map(category => (
              <option key={category.id} value={category.id}>
                {category.parentId ? `${categories.byId.get(category.parentId)?.name} › ` : ""}{category.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
