import type { Investment, Paise } from "./types";

/** Keys are salary-cycle start dates, matching the rest of the app. */
export function validCycleKey(value: string): boolean {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validCycleTargets(value: unknown): value is Record<string, Paise> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, amount]) => validCycleKey(key) && Number.isSafeInteger(amount) && amount >= 0);
}

export function investmentTarget(investment: Investment, cycle: string): Paise {
  return investment.cycleTargets?.[cycle] ?? investment.monthlyContribution;
}

export function hasCycleTarget(investment: Investment, cycle: string): boolean {
  return Object.hasOwn(investment.cycleTargets ?? {}, cycle);
}

/** Null removes an override; zero deliberately pauses this cycle's plan. */
export function withCycleTarget(investment: Investment, cycle: string, amount: Paise | null): Investment {
  if (!validCycleKey(cycle)) throw new Error("Choose a valid investment cycle.");
  if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) throw new Error("Enter a valid, non-negative target.");
  const cycleTargets = { ...investment.cycleTargets };
  if (amount === null) delete cycleTargets[cycle];
  else cycleTargets[cycle] = amount;
  return { ...investment, cycleTargets };
}

export function cycleInvestmentTotal(investments: Investment[], cycle: string): Paise {
  return investments.filter(i => i.isActive).reduce((sum, i) => sum + investmentTarget(i, cycle), 0);
}
