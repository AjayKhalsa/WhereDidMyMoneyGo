"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatMoney, parseAmountInput } from "@/lib/domain/money";
import {
  evaluateAffordability,
  type AffordabilityVerdict,
} from "@/lib/engine/affordability";
import { useFinance } from "@/lib/hooks/use-finance";
import { MoneyField } from "@/components/ui/fields";
import { SelectableChip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * "Can I afford this?" (spec §31).
 *
 * Deterministic end to end — the answer is arithmetic over the safe-to-spend
 * result, and the explanation names the actual trade-off rather than offering
 * encouragement. "Yes, but your daily allowance drops from ₹2,150 to ₹1,750"
 * is a sentence someone can make a decision with.
 */

const SUGGESTIONS = [2000, 8000, 15000, 40000];

const VERDICT_STYLES: Record<
  AffordabilityVerdict,
  { rule: string; label: string }
> = {
  yes: { rule: "bg-positive", label: "text-positive" },
  "yes-but": { rule: "bg-accent", label: "text-accent-ink" },
  tight: { rule: "bg-warning", label: "text-warning" },
  no: { rule: "bg-danger", label: "text-danger" },
};

export function AffordabilityCheck() {
  const { safeToSpend } = useFinance();
  const [text, setText] = useState("");

  const amount = parseAmountInput(text) ?? 0;
  const result = useMemo(
    () => (amount > 0 ? evaluateAffordability(amount, safeToSpend) : null),
    [amount, safeToSpend],
  );

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <label
        htmlFor="afford-amount"
        className="block text-[14.5px] font-medium text-ink"
      >
        Thinking about spending something?
      </label>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
        Enter the amount and I&rsquo;ll tell you what it does to the rest of
        your month.
      </p>

      <div className="mt-3.5">
        <MoneyField
          id="afford-amount"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="8000"
          aria-label="Amount you're considering spending"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((value) => (
          <SelectableChip
            key={value}
            selected={amount === value * 100}
            onClick={() => setText(String(value))}
          >
            {formatMoney(value * 100)}
          </SelectableChip>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "relative mt-4 rounded-xl bg-surface-sunken p-4",
                "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-xl",
                VERDICT_STYLES[result.verdict].rule,
              )}
            >
              <p
                className={cn(
                  "text-[15px] font-semibold",
                  VERDICT_STYLES[result.verdict].label,
                )}
              >
                {result.headline}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-secondary">
                {result.explanation}
              </p>

              {result.verdict !== "no" && (
                <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-line pt-3.5">
                  <div>
                    <dt className="text-[12px] text-ink-tertiary">
                      Daily allowance now
                    </dt>
                    <dd className="mt-0.5 text-[14px] font-medium text-ink tnum">
                      {formatMoney(result.currentDaily)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] text-ink-tertiary">
                      After this purchase
                    </dt>
                    <dd className="mt-0.5 text-[14px] font-medium text-ink tnum">
                      {formatMoney(result.projectedDaily)}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
