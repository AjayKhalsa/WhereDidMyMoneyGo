"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { accountBalance, creditCardOutstanding } from "@/lib/engine/analytics";
import { useFinance } from "@/lib/hooks/use-finance";
import { Amount } from "@/components/ui/amount";
import { cn, pluralise } from "@/lib/utils";

/**
 * How liquid the user actually is, surfaced right under the hero (spec §7's
 * Cash Position, promoted out of the explainer sheet).
 *
 * Safe-to-spend already nets card debt out of the headline number, so it
 * deliberately isn't a bank balance. But "how much do I actually have sitting
 * in accounts right now" is a different, equally real question — this answers
 * it, then breaks it down per account so the figure doesn't have to be taken
 * on faith.
 */
export function LiquidCashStrip() {
  const { db, safeToSpend } = useFinance();
  const [open, setOpen] = useState(false);

  const accounts = (db?.accounts ?? []).filter((a) => a.isActive);
  const transactions = db?.transactions ?? [];
  const liquidAccounts = accounts.filter(
    (a) => a.type === "BANK" || a.type === "CASH",
  );

  if (liquidAccounts.length === 0) return null;

  return (
    <div className="mt-4 max-w-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition-colors duration-150 hover:border-line-strong"
      >
        <span className="min-w-0">
          <span className="block text-[12.5px] text-ink-secondary">
            Liquid cash
          </span>
          <span className="mt-0.5 block text-[12px] text-ink-tertiary">
            Across {liquidAccounts.length}{" "}
            {pluralise(liquidAccounts.length, "account")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Amount value={safeToSpend.bankBalance} size="sm" />
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-ink-tertiary transition-transform duration-200 ease-[var(--ease-out-soft)]",
              open && "rotate-180",
            )}
            strokeWidth={1.9}
          />
        </span>
      </button>

      {open && (
        <div className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface px-3.5">
          {accounts.map((account) => {
            const isCard = account.type === "CREDIT_CARD";
            const value = isCard
              ? creditCardOutstanding(transactions, account.id)
              : accountBalance(account, transactions);
            return (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="min-w-0 truncate text-[13.5px] text-ink-secondary">
                  {account.name}
                  {isCard && (
                    <span className="ml-1.5 text-[11.5px] text-ink-tertiary">
                      owed
                    </span>
                  )}
                </span>
                <Amount
                  value={value}
                  size="xs"
                  signed
                  className={isCard && value > 0 ? "text-warning" : "text-ink"}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
