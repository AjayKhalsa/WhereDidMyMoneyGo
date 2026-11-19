import { accountForAlert, alertDate, type Alert } from "./alerts";
import type { Account } from "@/lib/domain/types";

export interface ParsedStatement {
  kind: "card_statement" | "bank_statement" | "notice";
  bank: string; tail?: string; issuedOn?: string; dueOn?: string; amount?: number;
  periodStart?: string; periodEnd?: string;
}

export function statementAccount(source: ParsedStatement, accounts: Pick<Account, "id" | "name" | "type" | "hint" | "isActive">[], aliases: Record<string, string>) {
  if (source.kind !== "card_statement") return;
  if (source.tail) return accountForAlert({ bank: source.bank, instrument: "credit_card", tail: source.tail } as Alert, accounts, aliases);
  const hits = accounts.filter(a => a.isActive && a.type === "CREDIT_CARD" && a.name.toLowerCase().includes(source.bank.toLowerCase()));
  return hits.length === 1 ? hits[0]!.id : undefined;
}
const DATE = "(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|[A-Za-z]+\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[-\\s][A-Za-z]+[-\\s]\\d{4})";
const dayAfter = (s: string) => new Date(Date.parse(s) + 86400000).toISOString().slice(0, 10);
const labelledDate = (text: string, label: string) => alertDate(new RegExp(`${label}\\s*:?\\s*(${DATE})`, "i").exec(text)?.[1] ?? "");

/** Explicit statement fields only. A minimum due, credit limit, payment or
 * merchant amount can never substitute for the total billed balance. */
export function parseIssuerStatement(source: { bank: string; subject: string; body_text: string; attachments?: { name: string }[]; pdf_text?: string | null }): ParsedStatement {
  const body = source.body_text + " " + (source.pdf_text ?? "");
  const card = /credit\s*card|diners|millennia|travelone|coral/i.test(source.subject + " " + source.body_text);
  const bank = source.bank === "CRED" ? /\bHDFC\b/i.test(body + source.subject) ? "HDFC" : /\bICICI\b/i.test(body + source.subject) ? "ICICI" : /\bHSBC\b/i.test(body + source.subject) ? "HSBC" : /\bAxis\b/i.test(body + source.subject) ? "Axis" : "CRED" : source.bank;
  const result: ParsedStatement = { kind: card ? "card_statement" : /account statement|bank statement/i.test(source.subject) ? "bank_statement" : "notice", bank };
  if (!card) return result;
  result.tail = /(?:credit\s*card|card|Bank)\s*(?:no\.?|number|ending(?:\s+in)?|\u2022|\s)*\s*(?:[Xx*•][\s-]*){2,}(\d{4})\b/i.exec(body + " " + source.subject)?.[1];
  if (!result.tail) {
    const tails = [...body.matchAll(/(?:[Xx*•][\s-]*){2,}(\d{4})\b/g)].map(m => m[1]);
    if (new Set(tails).size === 1) result.tail = tails[0];
  }
  const amounts = [...body.matchAll(/\btotal\s+(?:(?:amount|payment)\s+)?due\s*:?\s*(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/gi)]
    .map(m => Math.round(Number(m[1]!.replaceAll(",", "")) * 100)).filter(n => Number.isSafeInteger(n) && n >= 0);
  if (new Set(amounts).size === 1) result.amount = amounts[0];
  result.dueOn = labelledDate(body, "(?:payment\\s+due\\s+(?:by|date)|due\\s+date)");
  const period = /for the period\s+([A-Za-z]+\s+\d{1,2}\s+\d{4})\s+to\s+([A-Za-z]+\s+\d{1,2}\s+\d{4})/i.exec(source.subject);
  if (period) {
    result.periodStart = alertDate(period[1]!); result.periodEnd = alertDate(period[2]!);
    if (result.periodEnd) result.issuedOn = dayAfter(result.periodEnd);
  }
  result.issuedOn ??= labelledDate(body, "(?:statement\\s+date|bill\\s+generated\\s+on)");
  // HDFC supplies the issuer's statement date in the attachment filename.
  if (bank === "HDFC" && source.bank !== "CRED") {
    const dates = (source.attachments ?? []).flatMap(a => { const d = /_(\d{2}-\d{2}-\d{4})_/.exec(a.name); return d ? [alertDate(d[1]!)] : []; }).filter(Boolean);
    if (new Set(dates).size === 1) result.issuedOn = dates[0];
  }
  if (bank === "HSBC") {
    const dates = (source.attachments ?? []).flatMap(a => { const d = /^(20\d{2})(\d{2})(\d{2})\.pdf$/i.exec(a.name); return d ? [`${d[1]}-${d[2]}-${d[3]}`] : []; });
    if (dates.length === 1) result.issuedOn ??= dates[0];
  }
  return result;
}
