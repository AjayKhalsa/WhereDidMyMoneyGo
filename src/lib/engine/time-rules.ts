import type { ClassificationRule, Transaction } from "@/lib/domain/types";
import { classificationTime, validWallTime } from "@/lib/domain/transaction-time";
import { merchantKey } from "./merchant-identity";

export const MEAL_WINDOWS = [
  { start: 0, end: 12, categoryId: "dining.breakfast", label: "Breakfast" },
  { start: 12, end: 17, categoryId: "dining.lunch", label: "Lunch" },
  { start: 17, end: 20, categoryId: "dining.snacks", label: "Snacks" },
  { start: 20, end: 24, categoryId: "dining.dinner", label: "Dinner" },
] as const;
const MEALS = new Set<string>(["dining", "dining.other", ...MEAL_WINDOWS.map(w => w.categoryId)]);

/** Only meal expenses: groceries, coffee and alcohol retain their specificity. */
export function timedMealCategory(categoryId: string | undefined, actualTime: string | undefined, description = ""): string | undefined {
  if (!categoryId || !MEALS.has(categoryId) || !actualTime || !validWallTime(actualTime)) return;
  // Explicit meal wording is stronger evidence than a clock heuristic.
  const explicit = MEAL_WINDOWS.find(w => new RegExp(`\\b${w.label.toLowerCase()}\\b`).test(description.toLowerCase()));
  if (explicit) return explicit.categoryId;
  return MEAL_WINDOWS.find(w => Number(actualTime.slice(11, 13)) >= w.start && Number(actualTime.slice(11, 13)) < w.end)?.categoryId;
}

export function ruleConditionsMatch(rule: ClassificationRule, merchant: string, actualTime?: string): boolean {
  if (!rule.conditions) return true;
  const c = rule.conditions;
  if (!actualTime || !validWallTime(actualTime) || merchantKey(merchant) !== c.merchantKey) return false;
  if (!Number.isInteger(c.startHour) || !Number.isInteger(c.endHour) || c.startHour < 0 || c.endHour > 24 || c.startHour >= c.endHour || !Array.isArray(c.weekdays)) return false;
  const hour = Number(actualTime.slice(11, 13));
  const day = new Date(actualTime.slice(0, 10) + "T12:00:00Z").getUTCDay();
  return hour >= c.startHour && hour < c.endHour && c.weekdays.includes(day);
}

export function conditionalRulesFor(t: Transaction, rules: ClassificationRule[]): ClassificationRule[] {
  return rules.filter(r => r.conditions && ruleConditionsMatch(r, t.merchant || t.description, classificationTime(t)));
}
