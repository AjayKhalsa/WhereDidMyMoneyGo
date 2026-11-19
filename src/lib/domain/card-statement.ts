import type { CreditCardDetail } from "./types";

export function validCardStatement(value: unknown): value is NonNullable<CreditCardDetail["reportedStatement"]> {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  const day = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  return Object.keys(s).every(k => ["issuedOn", "dueOn", "amount", "source", "recordedAt"].includes(k)) &&
    day(s.issuedOn) && day(s.dueOn) && s.dueOn >= s.issuedOn &&
    typeof s.amount === "number" && Number.isSafeInteger(s.amount) && s.amount >= 0 &&
    typeof s.source === "string" && s.source.trim().length > 0 && s.source.length <= 120 &&
    typeof s.recordedAt === "string" && !Number.isNaN(Date.parse(s.recordedAt));
}
