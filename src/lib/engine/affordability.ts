import { formatMoney } from "@/lib/domain/money";
import type { Paise } from "@/lib/domain/types";
import type { SafeToSpendResult } from "./safe-to-spend";

/**
 * "Can I afford this?" (spec §31).
 *
 * Entirely deterministic — the verdict is arithmetic over the safe-to-spend
 * result, not a judgement call. The explanation names the exact trade-off
 * ("your daily allowance drops from X to Y") because a yes/no with no
 * reasoning is not something anyone should trust with their money.
 */

export type AffordabilityVerdict = "yes" | "yes-but" | "tight" | "no";

export interface AffordabilityResult {
  verdict: AffordabilityVerdict;
  headline: string;
  explanation: string;
  amount: Paise;
  /** Daily allowance before and after the purchase. */
  currentDaily: Paise;
  projectedDaily: Paise;
  safeAfter: Paise;
  /** True when the purchase would eat into investments or goals. */
  breaksCommitments: boolean;
}

export function evaluateAffordability(
  amount: Paise,
  safe: SafeToSpendResult,
): AffordabilityResult {
  const safeAfter = safe.safeAmount - amount;
  const days = Math.max(1, safe.remainingDays);
  const projectedDaily = safeAfter > 0 ? Math.floor(safeAfter / days) : 0;
  const currentDaily = safe.dailyAllowance;

  // Already underwater before the purchase is even considered.
  if (safe.safeAmount <= 0) {
    return {
      verdict: "no",
      headline: "Not this month",
      explanation:
        "You've already committed everything this month's income covers. Spending more would come out of savings or go onto the card.",
      amount,
      currentDaily,
      projectedDaily: 0,
      safeAfter,
      breaksCommitments: true,
    };
  }

  if (safeAfter < 0) {
    const shortfall = Math.abs(safeAfter);
    return {
      verdict: "no",
      headline: "That's beyond this month",
      explanation:
        `${formatMoney(amount)} is ${formatMoney(shortfall)} more than you have left after investments, bills and commitments. ` +
        `You'd be dipping into money that's already spoken for.`,
      amount,
      currentDaily,
      projectedDaily: 0,
      safeAfter,
      breaksCommitments: true,
    };
  }

  const dailyDrop =
    currentDaily > 0 ? ((currentDaily - projectedDaily) / currentDaily) * 100 : 0;

  // Leaves almost nothing per day for the rest of the month.
  if (projectedDaily < 30_000 || dailyDrop > 60) {
    return {
      verdict: "tight",
      headline: "Yes, but it'd be tight",
      explanation:
        `You can cover ${formatMoney(amount)} without touching your investments, but your safe daily spending drops from ` +
        `${formatMoney(currentDaily)} to ${formatMoney(projectedDaily)} for the remaining ${days} ${days === 1 ? "day" : "days"}.`,
      amount,
      currentDaily,
      projectedDaily,
      safeAfter,
      breaksCommitments: false,
    };
  }

  if (dailyDrop > 20) {
    return {
      verdict: "yes-but",
      headline: "Yes, but…",
      explanation:
        `${formatMoney(amount)} fits without affecting your investment target, but your safe daily spending would drop from ` +
        `${formatMoney(currentDaily)} to ${formatMoney(projectedDaily)} for the rest of the month.`,
      amount,
      currentDaily,
      projectedDaily,
      safeAfter,
      breaksCommitments: false,
    };
  }

  return {
    verdict: "yes",
    headline: "Yes, comfortably",
    explanation:
      `${formatMoney(amount)} leaves ${formatMoney(safeAfter)} of discretionary money and keeps your daily allowance around ` +
      `${formatMoney(projectedDaily)}. Investments and bills are unaffected.`,
    amount,
    currentDaily,
    projectedDaily,
    safeAfter,
    breaksCommitments: false,
  };
}
