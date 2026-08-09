import { formatMoney } from "@/lib/domain/money";
import type { Goal, Paise } from "@/lib/domain/types";
import type { BreakdownSlice } from "./analytics";

/**
 * Goal projections (spec §27).
 *
 * The rule that governs this file: only make a recommendation the data
 * actually supports. It would be trivial to always emit "cut dining by
 * ₹2,500 and you'll get there a month sooner" — and that sentence would be
 * worthless, because it would appear whether or not it were true.
 *
 * So each branch below requires a real precondition: a real contribution, a
 * real projected surplus, or a real category large enough to trim.
 */

export interface GoalContext {
  /** Projected money left over at month end, from the safe-to-spend engine. */
  projectedSurplus: Paise;
  /** This month's largest spending category, if any. */
  topCategory?: BreakdownSlice;
}

/** Months to reach the target at a given rate, or null if it never gets there. */
export function monthsToGoal(goal: Goal, perMonth: Paise): number | null {
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return 0;
  if (perMonth <= 0) return null;
  return Math.ceil(remaining / perMonth);
}

export function projectGoal(goal: Goal, context: GoalContext): string | null {
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return "Fully funded.";

  const contribution = goal.monthlyContribution;

  // Case 1: an explicit monthly contribution — a firm, honest projection.
  if (contribution > 0) {
    const months = monthsToGoal(goal, contribution);
    if (months === null) return null;

    const base = `At ${formatMoney(contribution)} a month, you'll get there in ${months} ${months === 1 ? "month" : "months"}.`;

    // Only suggest a trim when there is a category big enough to matter and
    // the saving would genuinely shorten the timeline.
    const top = context.topCategory;
    if (top && top.amount > contribution / 2) {
      const trim = Math.round(top.amount * 0.2);
      const faster = monthsToGoal(goal, contribution + trim);
      if (faster !== null && faster < months) {
        const saved = months - faster;
        return `${base} Trimming ${top.label} by ${formatMoney(trim)} a month would bring that forward by ${saved} ${saved === 1 ? "month" : "months"}.`;
      }
    }
    return base;
  }

  // Case 2: no contribution set, but the month is projected to end in surplus.
  if (context.projectedSurplus > 0) {
    const months = monthsToGoal(goal, context.projectedSurplus);
    if (months !== null && months <= 60) {
      return `No monthly amount set. At your current projected surplus of ${formatMoney(context.projectedSurplus)}, this would take about ${months} ${months === 1 ? "month" : "months"}.`;
    }
  }

  // Case 3: nothing to project from. Say so rather than guess.
  return `${formatMoney(remaining)} to go. Set a monthly amount to see a timeline.`;
}
