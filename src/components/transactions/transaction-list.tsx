"use client";

import { useMemo } from "react";
import { Receipt } from "lucide-react";
import { dayKey, formatRelativeDay } from "@/lib/domain/dates";
import { useMoneyText } from "@/lib/hooks/use-privacy";
import type { Transaction } from "@/lib/domain/types";
import { useAddSheet } from "@/components/add/add-sheet-provider";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { TransactionRow } from "./transaction-row";

/**
 * A date-grouped transaction list (spec §29).
 *
 * Grouping by day with a running day total is what turns a ledger into
 * something you can actually read: "Saturday cost me ₹4,300" is a sentence,
 * a flat list of rows is not.
 */

export function TransactionList({
  transactions,
  showDayTotals = true,
  showTime,
  emptyTitle = "No transactions yet",
  emptyDescription,
  className,
  onSelect,
}: {
  transactions: Transaction[];
  showDayTotals?: boolean;
  showTime?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  onSelect?: (transaction: Transaction) => void;
}) {
  const money = useMoneyText();
  const { open } = useAddSheet();

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
    for (const transaction of sorted) {
      const key = dayKey(transaction.date);
      const list = map.get(key);
      if (list) list.push(transaction);
      else map.set(key, [transaction]);
    }
    return [...map.entries()];
  }, [transactions]);

  const handleSelect =
    onSelect ?? ((transaction: Transaction) => open({ transaction }));

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-5 w-5" strokeWidth={1.5} />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {groups.map(([key, rows]) => {
        // Only expenses contribute to the day's spend — a salary landing on
        // the 1st must not read as a ₹1,52,660 day.
        const daySpend = rows
          .filter((t) => t.type === "EXPENSE")
          .reduce((acc, t) => acc + t.amount, 0);

        return (
          <section key={key}>
            <header className="mb-1 flex items-baseline justify-between gap-3 px-2.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-tertiary">
                {formatRelativeDay(rows[0]!.date)}
              </h3>
              {showDayTotals && daySpend > 0 && (
                <span className="text-[12px] text-ink-tertiary tnum">
                  {money(daySpend)}
                </span>
              )}
            </header>
            <ul className="-mx-1">
              {rows.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionRow
                    transaction={transaction}
                    onSelect={handleSelect}
                    showTime={showTime}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
