"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  TrendingUp,
} from "lucide-react";
import { contextLabel } from "@/lib/domain/contexts";
import { formatTime } from "@/lib/domain/dates";
import type { Transaction } from "@/lib/domain/types";
import { useFinance } from "@/lib/hooks/use-finance";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/ui/amount";

/**
 * A single transaction line.
 *
 * The type distinction has to be legible at a glance without shouting: an
 * expense is plain, income is green with a leading arrow, an investment and a
 * transfer get a quiet marker. Someone scanning the list should never mistake
 * a ₹24,680 card payment for a ₹24,680 purchase (spec §15).
 */

const TYPE_MARKERS = {
  INCOME: {
    icon: ArrowDownLeft,
    label: "Income",
    className: "bg-positive-soft text-positive",
  },
  INVESTMENT: {
    icon: TrendingUp,
    label: "Investment",
    className: "bg-accent-soft text-accent-ink",
  },
  TRANSFER: {
    icon: ArrowLeftRight,
    label: "Transfer",
    className: "bg-surface-sunken text-ink-secondary",
  },
} as const;

export function TransactionRow({
  transaction,
  onSelect,
  showTime,
  className,
}: {
  transaction: Transaction;
  onSelect?: (transaction: Transaction) => void;
  showTime?: boolean;
  className?: string;
}) {
  const { categories, db } = useFinance();
  const marker =
    transaction.type !== "EXPENSE" ? TYPE_MARKERS[transaction.type] : null;
  const Icon = marker?.icon;

  const account = db?.accounts.find((a) => a.id === transaction.accountId);
  const toAccount = db?.accounts.find((a) => a.id === transaction.toAccountId);

  const meta: string[] = [];
  if (transaction.type === "EXPENSE" && transaction.categoryId) {
    meta.push(categories.groupNameOf(transaction.categoryId));
  }
  for (const context of transaction.contexts) {
    if (context.value === "weekend" || context.value === "late-night") continue;
    meta.push(contextLabel(context.value));
  }
  if (transaction.type === "TRANSFER" && account && toAccount) {
    meta.push(`${account.name} → ${toAccount.name}`);
  }

  const interactive = Boolean(onSelect);
  const Element = interactive ? "button" : "div";

  return (
    <Element
      {...(interactive
        ? { type: "button" as const, onClick: () => onSelect?.(transaction) }
        : {})}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left",
        "transition-colors duration-150",
        interactive && "hover:bg-surface-hover active:bg-surface-sunken",
        className,
      )}
    >
      {marker && Icon ? (
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            marker.className,
          )}
          aria-label={marker.label}
        >
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
      ) : (
        <span className="h-8 w-1 shrink-0" aria-hidden="true" />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium text-ink">
          {transaction.description || "Untitled"}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-ink-tertiary">
          {meta.length > 0 && <span className="truncate">{meta.join(" · ")}</span>}
          {meta.length > 0 && (account || showTime) && <span>·</span>}
          {transaction.type !== "TRANSFER" && account && (
            <span className="truncate">{account.name}</span>
          )}
          {showTime && (
            <>
              {account && transaction.type !== "TRANSFER" && <span>·</span>}
              <span className="shrink-0 tnum">{formatTime(transaction.date)}</span>
            </>
          )}
        </span>
      </span>

      <Amount
        value={transaction.amount}
        size="sm"
        className={cn(
          "shrink-0",
          transaction.type === "INCOME" && "text-positive",
          (transaction.type === "TRANSFER" || transaction.type === "INVESTMENT") &&
            "text-ink-secondary",
        )}
      />
    </Element>
  );
}
