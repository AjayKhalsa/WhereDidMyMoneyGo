import type { Transaction, TransactionContext, TransactionTiming } from "./types";

export const UNKNOWN_TIMING: TransactionTiming = { source: "unknown", precision: "date", timezone: "Asia/Kolkata" };
export function validWallTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) return false;
  const date = new Date(value + "Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

/** A clock stored in `date` is not evidence: older imports used midnight and
 * manual entries used the time they were logged. Never use createdAt/email time. */
export function actualTransactionTime(t: Pick<Transaction, "date" | "timing" | "notes">): string | undefined {
  if (t.timing) return t.timing.precision === "exact" && !["unknown", "logged"].includes(t.timing.source) && t.timing.timezone === "Asia/Kolkata" && validWallTime(t.date) ? t.date.slice(0, 19) : undefined;
  const legacy = /; transaction time (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}) Asia\/Kolkata; source (bank|payment)(?:;|$)/.exec(t.notes ?? "");
  return legacy && legacy[1] === t.date.slice(0, 19) && validWallTime(legacy[1]) ? legacy[1] : undefined;
}

export function timingFor(t: Pick<Transaction, "date" | "timing" | "notes">): TransactionTiming {
  if (t.timing) return t.timing;
  return actualTransactionTime(t) ? { source: t.notes?.includes("; source payment") ? "payment" : "bank", precision: "exact", timezone: "Asia/Kolkata" } : UNKNOWN_TIMING;
}

/** User-preferred fallback for new manual entries, explicitly marked estimated. */
export function classificationTime(t: Pick<Transaction, "date" | "timing" | "notes">): string | undefined {
  return actualTransactionTime(t) ?? (t.timing?.source === "logged" && t.timing.precision === "estimated" && t.timing.timezone === "Asia/Kolkata" && validWallTime(t.date) ? t.date.slice(0,19) : undefined);
}

export function timeLabel(t: Pick<Transaction, "date" | "timing" | "notes">): string {
  if (t.timing?.source === "logged" && classificationTime(t)) return `${t.date.slice(11,16)} IST · logged time`;
  const time = actualTransactionTime(t);
  return time ? `${time.slice(11, 16)} IST · ${timingFor(t).source === "user" ? "confirmed" : `${timingFor(t).source} time`}` : "Time unknown";
}

export function factualTimeContexts(t: Pick<Transaction, "date" | "timing" | "notes">): TransactionContext[] {
  const day = new Date(t.date.slice(0, 10) + "T12:00:00Z").getUTCDay();
  const contexts: TransactionContext[] = [];
  if (day === 0 || day === 6) contexts.push({ type: "OCCASION", value: "weekend" });
  const actual = classificationTime(t);
  if (actual && (Number(actual.slice(11, 13)) >= 22 || Number(actual.slice(11, 13)) < 4)) contexts.push({ type: "OCCASION", value: "late-night" });
  return contexts;
}

export function indiaNow(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 19);
}

/** Editing a label must not replace an unverified stored clock with midnight.
 * Preserve the wall-clock for ledger/checkpoint stability, without trusting it. */
export function dateForTransactionEdit(day: string, clock: string, existingDate?: string, clockEdited = false): string {
  if (clock) return `${day}T${clock.length === 5 ? clock + ":00" : clock}`;
  if (!clockEdited && existingDate?.slice(0,10) === day && validWallTime(existingDate)) return existingDate.slice(0,19);
  return `${day}T00:00:00`;
}
