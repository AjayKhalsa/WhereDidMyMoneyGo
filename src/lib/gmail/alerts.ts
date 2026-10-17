import type { Account } from "@/lib/domain/types";
import { MERCHANTS } from "@/lib/engine/lexicon";

export const BANK_SENDERS: Record<string, string> = {
  "alerts@hdfcbank.bank.in": "HDFC", "alerts@hdfcbank.net": "HDFC",
  "credit_cards@icici.bank.in": "ICICI", "credit_cards@icicibank.com": "ICICI",
  "customernotification@icici.bank.in": "ICICI", "customernotification@icicibank.com": "ICICI",
  "alerts@axis.bank.in": "Axis", "alerts@axisbank.com": "Axis",
  "hsbc@mail.hsbc.co.in": "HSBC",
};
export interface Alert {
  bank: string;
  instrument: "bank" | "credit_card" | "debit_card";
  tail: string;
  amount: number;
  date: string;
  merchant: string;
  direction: "debit" | "credit";
  reference?: string;
  categoryId?: string;
  accountId?: string;
  special?: boolean;
}
export interface MailPart {
  mimeType?: string; filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string }; parts?: MailPart[];
}
export function header(part: MailPart, name: string): string {
  return part.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
export function senderAddress(from: string): string {
  return (from.match(/<([^<>]+)>/)?.[1] ?? from).trim().toLowerCase();
}
export function plainText(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ").trim();
}
/** Choose one alternative, never concatenate both HTML and text versions. */
export function mailText(part: MailPart): string {
  if (part.filename) return "";
  if (part.body?.data && /^text\/(plain|html)$/.test(part.mimeType ?? "")) {
    return plainText(Buffer.from(part.body.data, "base64url").toString("utf8"));
  }
  const children = part.parts ?? [];
  if (part.mimeType === "multipart/alternative") {
    return mailText(children.find(p => p.mimeType === "text/plain") ?? children.find(p => p.mimeType === "text/html") ?? children[0] ?? {});
  }
  return children.map(mailText).filter(Boolean).join(" ");
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function alertDate(raw: string): string | undefined {
  let d: number, m: number, y: number;
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(raw.trim());
  const words = raw.toLowerCase().replace(/[,.-]/g, " ").trim().split(/\s+/);
  if (numeric) [d, m, y] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
  else if (MONTHS.includes(words[0]?.slice(0, 3) ?? "")) [d, m, y] = [Number(words[1]), MONTHS.indexOf(words[0]!.slice(0, 3)) + 1, Number(words[2])];
  else [d, m, y] = [Number(words[0]), MONTHS.indexOf(words[1]?.slice(0, 3) ?? "") + 1, Number(words[2])];
  if (y < 100) y += 2000;
  if (!d || !m || !y || y < 2000 || y > 2100) return;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return;
  return date.toISOString().slice(0, 10);
}

/** Exact known alert layouts only. No language model sees mailbox contents. */
export function parseAlert(from: string, subject: string, text: string): Alert | null {
  const bank = BANK_SENDERS[senderAddress(from)];
  if (!bank || /otp|one.time|statement|failed|declined|unsuccessful|scheduled|reminder|limit|ready for/i.test(subject)) return null;
  const body = plainText(text);
  let amount: string | undefined, tail: string | undefined, date: string | undefined, merchant: string | undefined;
  let instrument: Alert["instrument"] = "credit_card", direction: Alert["direction"] = "debit";
  const match = bank === "HSBC" ? /credit card\s+x+(\d{4})\s+was used for a transaction of INR\s+([\d,.]+)\s+at\s+(.+?)\s+on\s+(\d{2}\/\d{2}\/\d{2,4})/i.exec(body) : null;
  if (match) [, tail, amount, merchant, date] = match;
  else if (bank === "ICICI") {
    const card = /credit card\s+x+(\d{4})\s+has been used for a transaction of INR\s+([\d,.]+)\s+on\s+([A-Za-z]+ \d{1,2}, \d{4})\s+at\s+[\d:]+\.\s+Info:\s+(.+?)\.\s+The Available/i.exec(body);
    const acct = /bank account\s+x+(\d{3,4})\s+has been (credited|debited) with INR\s+([\d,.]+)\s+on\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})\.\s+Info:\s+(.+?)\.\s+(?:NEVER|The|In case)/i.exec(body);
    if (card) [, tail, amount, date, merchant] = card;
    else if (acct) { tail = acct[1]; direction = acct[2]!.toLowerCase() === "credited" ? "credit" : "debit"; amount = acct[3]; date = acct[4]; merchant = acct[5]; instrument = "bank"; }
  } else if (bank === "HDFC") {
    const hdfc = /Rs\.?\s*([\d,.]+)\s+(?:is|has been)\s+(debited|credited)\s+(?:from|to)\s+your\s+(?:HDFC Bank\s+)?(Credit Card|Debit Card|account)\s+ending\s+(\d{4})\s+(?:at|towards|by)\s+(.+?)\s+on\s+(\d{1,2}(?:-[\d]{1,2}-\d{2,4}| [A-Za-z]{3}, \d{4}))/i.exec(body);
    if (hdfc) { [, amount, , , tail, merchant, date] = hdfc; direction = hdfc[2]!.toLowerCase() === "credited" ? "credit" : "debit"; instrument = hdfc[3]!.toLowerCase() === "account" ? "bank" : hdfc[3]!.toLowerCase() === "debit card" ? "debit_card" : "credit_card"; }
  } else if (bank === "Axis" && /spent on credit card/i.test(subject)) {
    const axis = /Transaction Amount:\s*INR\s*([\d,.]+)\s+Merchant Name:\s*(.+?)\s+Axis Bank Credit Card No\.\s*X+(\d{4})\s+Date\s*&\s*Time:\s*(\d{2}-\d{2}-\d{4})/i.exec(body);
    if (axis) [, amount, merchant, tail, date] = axis;
  }
  const day = date ? alertDate(date) : undefined;
  if (!amount || !/^\d+(?:,\d+)*(?:\.\d{1,2})?$/.test(amount) || !tail || !day || !merchant) return null;
  const paise = Math.round(Number(amount.replace(/,/g, "")) * 100);
  if (!Number.isSafeInteger(paise) || paise <= 0) return null;
  const reference = merchant.match(/^UPI-(\d{10,})-/i)?.[1] ?? body.match(/UPI transaction reference no\.?\s*:\s*(\d{10,})/i)?.[1];
  merchant = merchant.replace(/^UPI-\d+-/i, "").replace(/^VPA\s+\S+\s+\((.+)\)$/i, "$1").trim().slice(0, 180);
  const special = /refund|reversal|cashback|billpay|card payment|neft|imps|zerodha|mutual fund|mandate/i.test(merchant);
  const words = merchant.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/);
  const matches = MERCHANTS.filter(m => m.aliases.some(a => words.includes(a)));
  const categoryId = new Set(matches.map(m => m.categoryId)).size === 1 ? matches[0]?.categoryId : undefined;
  return { bank, instrument, tail, amount: paise, date: day, merchant, direction, reference, categoryId, special };
}

export function accountForAlert(alert: Alert, accounts: Pick<Account, "id" | "name" | "type" | "hint" | "isActive">[], aliases: Record<string, string>): string | undefined {
  const key = `${alert.bank}:${alert.instrument}:${alert.tail}`;
  const type = alert.instrument === "credit_card" ? "CREDIT_CARD" : "BANK";
  const active = accounts.filter(a => a.isActive && a.type === type);
  if (aliases[key]) return active.find(a => a.id === aliases[key])?.id;
  // Debit card digits are not bank account digits. Short suffixes need a one-time mapping.
  if (alert.instrument === "debit_card" || alert.tail.length !== 4) return;
  const hits = active.filter(a => a.name.toLowerCase().includes(alert.bank.toLowerCase()) && a.hint?.replace(/\D/g, "").endsWith(alert.tail));
  return hits.length === 1 ? hits[0]!.id : undefined;
}
export function automaticReason(alert: Alert, authenticated: boolean, startDate: string): string | null {
  if (!authenticated) return "Sender authentication could not be verified.";
  if (alert.date < startDate) return "Transaction predates the selected import start date.";
  if (alert.date > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) return "Transaction date is in the future.";
  if (!alert.accountId) return "Match this card or account once before importing.";
  if (alert.direction === "credit" || alert.special) return "Confirm whether this is income, a refund, or a transfer.";
  if (!alert.categoryId) return "Choose a category for this merchant.";
  return null;
}

export function authenticatedSender(part: MailPart): boolean {
  const address = senderAddress(header(part, "From"));
  if (!BANK_SENDERS[address]) return false;
  // Use Google's first Authentication-Results, not a body claim or ARC from the sender.
  const auth = part.headers?.find(h => h.name.toLowerCase() === "authentication-results")?.value ?? "";
  const domain = address.split("@")[1] ?? "";
  const aligned = /dmarc=pass\b[^;]*\bheader\.from=([\w.-]+)/i.exec(auth)?.[1]?.toLowerCase();
  return /^mx\.google\.com;/i.test(auth.trim()) && !!aligned && (domain === aligned || domain.endsWith(`.${aligned}`));
}
