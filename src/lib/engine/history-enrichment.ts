import { CONTEXT_DEFINITIONS, DERIVED_CONTEXT_VALUES, normaliseContexts } from "@/lib/domain/contexts";
import { actualTransactionTime, classificationTime, factualTimeContexts, indiaNow, validWallTime } from "@/lib/domain/transaction-time";
import type { ClassificationRule, Database, Transaction } from "@/lib/domain/types";
import { merchantKey } from "./merchant-identity";
import { conditionalRulesFor, MEAL_WINDOWS, timedMealCategory } from "./time-rules";

export interface TimeEvidence {
  transactionId: string;
  occurredAt: string;
  source: "bank" | "payment";
  amount: number;
  accountId: string;
  bankDate: string;
}
export interface EnrichmentChange { before: Transaction; after: Transaction; reasons: string[] }
export interface PatternProposal { rule: ClassificationRule; support: number; total: number; days: number; explanation: string }

/** Stable comparisons work across object-key order and context-table order. */
export function enrichmentImage(value: unknown): string {
  const normalize = (v: unknown, key = ""): unknown => {
    if (Array.isArray(v)) {
      const rows = v.map(x => normalize(x));
      return key === "contexts" ? rows.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : rows;
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([,x]) => x != null).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => [k, normalize(x,k)]));
    if (key === "date" && typeof v === "string") return v.slice(0,19);
    return v;
  };
  return JSON.stringify(normalize(value));
}

/** Only metadata and same-calendar-day clocks may change in a historical batch. */
export function validateEnrichmentChange(change: EnrichmentChange, current: Transaction | undefined): void {
  const allowed = new Set(["categoryId", "contexts", "timing", "enrichment", "updatedAt", "date"]);
  const protectedFields = (t: Transaction) => Object.fromEntries(Object.entries(t).filter(([key]) => !allowed.has(key)));
  if (!current || change.before.id !== change.after.id || change.before.type !== "EXPENSE" || change.before.categoryId === "adjustment" || change.after.categoryId === "adjustment" || change.before.date.slice(0,10) !== change.after.date.slice(0,10) || enrichmentImage(protectedFields(change.before)) !== enrichmentImage(protectedFields(change.after))) throw new Error("Enrichment cannot change financial fields or the transaction day.");
  if (enrichmentImage(current) !== enrichmentImage(change.before) && enrichmentImage(current) !== enrichmentImage(change.after)) throw new Error("A transaction changed since this preview. Refresh and review again.");
}

export function planHistoryEnrichment(db: Database, evidence: TimeEvidence[] = [], now = new Date()) {
  const changes: EnrichmentChange[] = [], unknownTimeIds: string[] = [], conflicts: string[] = [];
  const validCategories = new Set(db.categories.map(c => c.id));
  const evidenceById = new Map<string, TimeEvidence[]>();
  for (const e of evidence) evidenceById.set(e.transactionId, [...(evidenceById.get(e.transactionId) ?? []), e]);
  for (const before of db.transactions) {
    if (before.type !== "EXPENSE" || before.categoryId === "adjustment" || before.date.slice(0,10) > indiaNow(now).slice(0,10)) continue;
    const reasons: string[] = [], ruleIds: string[] = [];
    let after = { ...before };
    const compatible = (evidenceById.get(before.id) ?? []).filter(e => e.amount === before.amount && e.accountId === before.accountId && e.bankDate === before.date.slice(0,10) && e.occurredAt.slice(0,10) === e.bankDate && ["bank", "payment"].includes(e.source) && validWallTime(e.occurredAt));
    if (new Set(compatible.map(e => e.occurredAt.slice(0,19))).size > 1) { conflicts.push(before.id); continue; }
    else if (!actualTransactionTime(before) && before.timing?.source !== "user" && compatible[0]) {
      const e = compatible[0];
      after = { ...after, date: e.occurredAt, timing: { source: e.source, precision: "exact", timezone: "Asia/Kolkata" } };
      reasons.push("Recovered actual time from the bank alert already linked to this transaction.");
    }
    const time = classificationTime(after);
    if (!actualTransactionTime(after)) unknownTimeIds.push(before.id);
    const meal = timedMealCategory(after.categoryId, time, before.description);
    if (meal && validCategories.has(meal) && meal !== after.categoryId) {
      after.categoryId = meal;
      reasons.push(`Meal rule (${after.timing?.source === "logged" ? "estimated logging time" : "verified time"}): ${time!.slice(11,16)} IST → ${meal.split(".")[1]}.`);
      ruleIds.push("meal-time-v1");
    }
    const matched = conditionalRulesFor(after, db.rules).filter(r => validCategories.has(r.categoryId) && r.categoryId !== "adjustment");
    if (new Set(matched.map(r => r.categoryId)).size <= 1) {
      for (const rule of matched) {
        if (!after.categoryId || after.categoryId === "other") after.categoryId = rule.categoryId;
        if (after.categoryId !== rule.categoryId) continue;
        const contexts = normaliseContexts([...after.contexts, ...rule.contexts.filter(c => !DERIVED_CONTEXT_VALUES.has(c.value))]);
        if (enrichmentImage(contexts) !== enrichmentImage(after.contexts)) reasons.push(`Applied approved rule “${rule.pattern}” for this merchant, time window and weekday.`);
        after.contexts = contexts;
        ruleIds.push(rule.id);
      }
    } else { conflicts.push(before.id); continue; }
    const factual = normaliseContexts([...after.contexts.filter(c => !DERIVED_CONTEXT_VALUES.has(c.value)), ...factualTimeContexts(after)]);
    if (enrichmentImage(factual) !== enrichmentImage(after.contexts)) {
      after.contexts = factual;
      reasons.push("Recomputed weekend and late-night tags from the date and recorded time; logging times remain estimates.");
    }
    if (enrichmentImage(after) === enrichmentImage(before)) continue;
    after = { ...after, enrichment: { version: 1, ruleIds: [...new Set([...(before.enrichment?.ruleIds ?? []), ...ruleIds])] }, updatedAt: now.toISOString() };
    changes.push({ before, after, reasons });
  }
  return { changes, unknownTimeIds, conflicts: [...new Set(conflicts)] };
}

/** Suggestions only. Four independently dated examples and 80% agreement are
 * required; automated/imported/enriched rows never train their own predictions. */
export function discoverTimePatterns(transactions: Transaction[], existing: ClassificationRule[], now = new Date()): PatternProposal[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.type !== "EXPENSE" || !["manual", "parsed"].includes(t.source) || Boolean(t.enrichment?.ruleIds.length) || !t.categoryId || ["other", "adjustment"].includes(t.categoryId) || t.date.slice(0,10) > indiaNow(now).slice(0,10)) continue;
    const time = classificationTime(t), key = merchantKey(t.merchant ?? "");
    if (!time || key.length < 3) continue;
    const hour = Number(time.slice(11,13)), window = MEAL_WINDOWS.find(w => hour >= w.start && hour < w.end)!;
    const weekday = new Date(time.slice(0,10) + "T12:00:00Z").getUTCDay();
    const group = JSON.stringify([key, window.start, window.end, weekday === 0 || weekday === 6]);
    groups.set(group, [...(groups.get(group) ?? []), t]);
  }
  const proposals: PatternProposal[] = [];
  for (const [group, rows] of groups) {
    const [key, startHour, endHour, weekend] = JSON.parse(group) as [string,number,number,boolean];
    const days = new Set(rows.map(t => t.date.slice(0,10))).size;
    if (rows.length < 4 || days < 3 || new Set(rows.map(t => t.categoryId)).size !== 1) continue;
    const conditions = { merchantKey: key, startHour, endHour, weekdays: weekend ? [0,6] : [1,2,3,4,5] };
    if (existing.some(r => enrichmentImage(r.conditions) === enrichmentImage(conditions))) continue;
    const candidates = normaliseContexts(rows.flatMap(t => t.contexts)).filter(c => ["PEOPLE", "PURPOSE", "ATTRIBUTE"].includes(c.type) && CONTEXT_DEFINITIONS.some(d => d.value === c.value) && !["gift", "impulse", "alcohol"].includes(c.value) && !DERIVED_CONTEXT_VALUES.has(c.value));
    const contexts = candidates.filter(c => rows.filter(t => t.contexts.some(v => v.type === c.type && v.value === c.value)).length >= Math.max(4, Math.ceil(rows.length * 0.8)));
    if (!contexts.length) continue;
    const support = rows.filter(t => contexts.every(c => t.contexts.some(v => v.type === c.type && v.value === c.value))).length;
    if (support < 4 || support / rows.length < 0.8) continue;
    const stamp = now.toISOString();
    proposals.push({ support, total: rows.length, days, explanation: `${support} of ${rows.length} user-recorded expenses across ${days} dates share these tags, ${weekend ? "on weekends" : "on weekdays"} between ${String(startHour).padStart(2,"0")}:00 and ${String(endHour).padStart(2,"0")}:00 IST. ${rows.filter(t => t.timing?.source === "logged").length} use estimated logging times. This is a pattern to confirm, not proof of purpose.`,
      rule: { id: `time_${encodeURIComponent(group)}`, pattern: key, merchant: rows[0]!.merchant, categoryId: rows[0]!.categoryId!, conditions, contexts, confidence: support / rows.length, timesApplied: 0, createdAt: stamp, updatedAt: stamp,
        learningEvidence: { source: "history", merchantKey: key, support, exampleIds: rows.map(t => t.id) } } });
  }
  return proposals.sort((a,b) => b.support - a.support);
}
