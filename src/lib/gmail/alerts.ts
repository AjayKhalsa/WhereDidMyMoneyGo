import type { Account } from "@/lib/domain/types";
import { MERCHANTS } from "@/lib/engine/lexicon";
import { alertTime, type AlertTime } from "./alert-time";
import { normalizeBankReference } from "@/lib/import/identity";

export const BANK_SENDERS: Record<string, string> = {
  "alerts@hdfcbank.bank.in": "HDFC", "alerts@hdfcbank.net": "HDFC",
  "credit_cards@icici.bank.in": "ICICI", "credit_cards@icicibank.com": "ICICI",
  "customernotification@icici.bank.in": "ICICI", "customernotification@icicibank.com": "ICICI",
  "alerts@axis.bank.in": "Axis", "alerts@axisbank.com": "Axis",
  "hsbc@mail.hsbc.co.in": "HSBC",
  "hsbc@hsbc.bank.in": "HSBC",
  "protect@cred.club": "CRED",
};
// Bump only when review receipts need another deterministic parsing attempt.
export const ALERT_PARSER_VERSION = 2;
export function financialSendersQuery(): string {
  return `(${Object.keys(BANK_SENDERS).filter(sender => sender !== 'protect@cred.club').map(sender => `from:${sender}`).join(' OR ')} OR (from:protect@cred.club subject:"your credit card bill payment was successful"))`;
}
export interface Alert extends Partial<AlertTime> {
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
  vpa?: string;
  paymentRail?: "UPI" | "NEFT" | "IMPS";
  upiRecipientKind?: "person" | "merchant";
  creditKind?: "refund" | "income" | "repayment" | "unknown";
  incomeKind?: "salary";
  refundStatus?: "initiated" | "posted";
  refundInitiatedAt?: string;
  providerReference?: string;
  classification?: import("./classification").CategorySuggestion;
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
    .replace(/&#8377;|&#x20b9;/gi, "₹").replace(/&bull;|&#8226;|&#x2022;/gi, "•")
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

/** Explicit bank narration, not a payee containing 'Salary' or an estimate. */
export function isSalaryNarration(text: string): boolean {
  return !/\b(?:refund|reversal|cashback|loan|self[ -]?transfer|own[ -]?transfer)\b/i.test(text)
    && /(?:^|[-/:\s])SAL(?:ARY)?\s+(?:FOR\s+)?(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+(?:20\d{2}|\d{2})\b/i.test(text);
}

export function isSalaryAlert(alert: Alert): boolean {
  return alert.direction === 'credit' && alert.instrument === 'bank' && alert.creditKind === 'income'
    && alert.incomeKind === 'salary' && isSalaryNarration(alert.merchant);
}

/** Exact known alert layouts only. No language model sees mailbox contents. */
export function parseAlert(from: string, subject: string, text: string, receivedAt?: string | number): Alert | null {
  let bank = BANK_SENDERS[senderAddress(from)];
  if (!bank || /otp|one.time|statement|failed|declined|unsuccessful|scheduled|reminder|limit|ready for/i.test(subject)) return null;
  const body = plainText(text);
  let amount: string | undefined, tail: string | undefined, date: string | undefined, merchant: string | undefined;
  let instrument: Alert["instrument"] = "credit_card", direction: Alert["direction"] = "debit";
  let repayment = false, providerReference: string | undefined;
  let refundStatus: Alert['refundStatus'];
  const match = bank === "HSBC" ? /credit card\s+x+(\d{4})\s+was used for a transaction of INR\s+([\d,.]+)\s+at\s+(.+?)\s+on\s+(\d{2}\/\d{2}\/\d{2,4})/i.exec(body) : null;
  if (match) [, tail, amount, merchant, date] = match;
  else if (bank === "HSBC") {
    const purchase = /credit card no ending with\s+(\d{4}),?\s*has been used for INR\s*([\d,.]+)\s+for payment to\s+(.+?)\s+on\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+at\s+\d{1,2}:\d{2}/i.exec(body);
    if (purchase) [, tail, amount, merchant, date] = purchase;
  }
  else if (bank === "ICICI") {
    const card = /credit card\s+x+(\d{4})\s+has been used for a transaction of INR\s+([\d,.]+)\s+on\s+([A-Za-z]+ \d{1,2}, \d{4})\s+at\s+[\d:]+\.\s+Info:\s+(.+?)\.\s+The Available/i.exec(body);
    const acct = /bank account\s+x+(\d{3,4})\s+has been (credited|debited) with INR\s+([\d,.]+)\s+on\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})\.\s+Info:\s+(.+?)\.\s+(?:NEVER|The|In case)/i.exec(body);
    const payment = /We have received payment of INR\s+([\d,.]+)\s+on your ICICI Bank Credit Card account\s+\d{4}\s+X{4}\s+X{4}\s+(\d{4})\s+on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})\b/i.exec(body);
    if (card) [, tail, amount, date, merchant] = card;
    else if (acct) { tail = acct[1]; direction = acct[2]!.toLowerCase() === "credited" ? "credit" : "debit"; amount = acct[3]; date = acct[4]; merchant = acct[5]; instrument = "bank"; }
    else if (payment) { [, amount, tail, date] = payment; merchant = "ICICI card repayment"; direction = "credit"; repayment = true; }
  } else if (bank === "HDFC") {
    const reversal = /A transaction reversal of Rs\.?\s*([\d,.]+)\s+has been\s+(initiated|credited|posted)\s+to your HDFC Bank Credit Card ending\s+(\d{4})\s+From Merchant:\s*(.+?)\s+Date\s*(?:&\s*)?Time:\s*(\d{1,2}\s+[A-Za-z]{3},\s*\d{4})\s+at\s+\d{1,2}:\d{2}(?::\d{2})?/i.exec(body);
    const hdfc = /Rs\.?\s*([\d,.]+)\s+(?:is|has been)\s+(debited|credited)\s+(?:from|to)\s+your\s+(?:HDFC Bank\s+)?(Credit Card|Debit Card|account)\s+ending\s+(\d{4})\s+(?:at|towards|by)\s+(.+?)\s+on\s+(\d{1,2}(?:-[\d]{1,2}-\d{2,4}| [A-Za-z]{3}, \d{4}))/i.exec(body);
    if (reversal) { [, amount, , tail, merchant, date] = reversal; direction = 'credit'; refundStatus = reversal[2]!.toLowerCase() === 'initiated' || /allow\s+(?:up to\s+)?\d+\s+hours/i.test(body) ? 'initiated' : 'posted'; }
    else if (hdfc) { [, amount, , , tail, merchant, date] = hdfc; direction = hdfc[2]!.toLowerCase() === "credited" ? "credit" : "debit"; instrument = hdfc[3]!.toLowerCase() === "account" ? "bank" : hdfc[3]!.toLowerCase() === "debit card" ? "debit_card" : "credit_card"; if (direction==='credit' && instrument==='credit_card' && /refund|reversal/i.test(merchant!)) refundStatus='posted'; }
    else {
      const credit = /Rs\.?\s*([\d,.]+)\s+has been successfully credited to your HDFC Bank account ending in\s+(\d{4})\.\s*Transaction Details:\s*a\.\s*Date:\s*(\d{1,2}-\d{1,2}-\d{2,4})\s*b\.\s*Sender:\s*(.+?)\s*c\.\s*UPI Reference No\.?\s*:\s*\d+/i.exec(body);
      const deposit = /You have received a credit in your HDFC Bank account\.\s*Details of the transaction:\s*Amount received:\s*INR\s*([\d,.]+)\s*Account:\s*X+(\d{4})\s*Date:\s*(\d{1,2}-[A-Za-z]{3}-\d{4})\s*Reference Details:\s*(.+?)\s*Available Balance:/i.exec(body);
      if (credit || deposit) { [, amount, tail, date, merchant] = (credit ?? deposit)!; direction = "credit"; instrument = "bank"; }
    }
  } else if (bank === "Axis") {
    if (/spent on credit card/i.test(subject)) {
      const axis = /Transaction Amount:\s*INR\s*([\d,.]+)\s+Merchant Name:\s*(.+?)\s+Axis Bank Credit Card No\.\s*X+(\d{4})\s+Date\s*&\s*Time:\s*(\d{2}-\d{2}-\d{4})/i.exec(body);
      if (axis) [, amount, merchant, tail, date] = axis;
    } else {
      const account = /Amount\s+(Debited|Credited):\s*INR\s*([\d,.]+)\s+Account Number:\s*X+(\d{4})\s+Date\s*&\s*Time:\s*(\d{2}-\d{2}-\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?\s+IST\s+Transaction Info:\s*(.+?)(?=\s+(?:If this transaction|Available Balance|Regards)|$)/i.exec(body);
      if (account) { [, , amount, tail, date, merchant] = account; direction = account[1]!.toLowerCase() === "credited" ? "credit" : "debit"; instrument = "bank"; }
    }
  } else if (bank === "CRED" && /^your credit card bill payment was successful\s*$/i.test(subject.trim())) {
    // Successful payment receipts only. Due reminders and statement balances
    // are not payments. The provider UTR is not assumed to be a bank RRN.
    const payment = /Your credit card payment was successful(?:\s+in\s+[\d.]+\s+seconds)?\s+(HSBC|ICICI|Axis|HDFC)\s+Bank\s+[•●*Xx]{4}\s*(\d{4})\s+payment details\s+amount paid\s+₹\s*([\d,.]+)\s+payment date\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})\s+credited to card\s+[A-Za-z]+\s+\d{1,2},\s*\d{4}\s+transaction summary\s+Order ID:\s*([A-Z0-9]{6,64})\b/i.exec(body);
    if (payment) { [, bank, tail, amount, date, providerReference] = payment; bank = bank!.toLowerCase() === "axis" ? "Axis" : bank!.toUpperCase(); providerReference = `CRED:${providerReference!.toUpperCase()}`; merchant = `${bank} card repayment via CRED`; direction = "credit"; repayment = true; }
  }
  const day = date ? alertDate(date) : undefined;
  if (!amount || !/^\d+(?:,\d+)*(?:\.\d{1,2})?$/.test(amount) || !tail || !day || !merchant) return null;
  const paise = Math.round(Number(amount.replace(/,/g, "")) * 100);
  if (!Number.isSafeInteger(paise) || paise <= 0) return null;
  const reference = normalizeBankReference(merchant.match(/^UPI[-/](?:P2[MP]\/)?(\d{10,})[-/]/i)?.[1] ?? body.match(/UPI (?:transaction )?reference no\.?\s*:\s*(\d{10,})/i)?.[1]);
  const vpa = merchant.match(/\bVPA:?\s+(\S+@[^\s)]+)/i)?.[1];
  const recipient = /^UPI\/P2([MP])\//i.exec(merchant)?.[1]?.toUpperCase();
  const upiRecipientKind = recipient === 'P' ? 'person' : recipient === 'M' ? 'merchant' : undefined;
  const paymentRail = /\bUPI\b/i.test(body) ? "UPI" : /\bNEFT\b/i.test(merchant) ? "NEFT" : /\bIMPS\b/i.test(merchant) ? "IMPS" : undefined;
  const parsedTime = alertTime(body, date!, day, receivedAt);
  const refundInitiatedAt = refundStatus === 'initiated' && parsedTime.timeSource === 'bank' ? parsedTime.occurredAt : undefined;
  // A reversal's initiation clock is not proof of its eventual posting clock.
  const time = refundStatus === 'initiated' ? {timeSource:'unknown' as const,timeConfidence:'unknown' as const} : parsedTime;
  const transactionDay = time.timeSource === "bank" || time.timeSource === "payment" ? time.occurredAt!.slice(0, 10) : day;
  const creditKind = direction !== "credit" ? undefined : repayment ? "repayment" : refundStatus || /refund|reversal|cashback/i.test(merchant) ? "refund" : /\bSAL(?:ARY)?\b|Int\.Pd|interest paid/i.test(merchant) ? "income" : "unknown";
  const incomeKind = direction === 'credit' && instrument === 'bank' && creditKind === 'income' && isSalaryNarration(merchant) ? 'salary' : undefined;
  merchant = merchant.replace(/^UPI(?:\/P2[MP])?[-/]\d+[-/]/i, "").replace(/^VPA\s+\S+\s+\((.+)\)$/i, "$1").trim().slice(0, 180);
  const special = repayment || !!refundStatus || /refund|reversal|cashback|billpay|card payment|\bcred\b|dreamplug|neft|imps|zerodha|mutual fund|mandate/i.test(merchant);
  const words = merchant.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/);
  const matches = MERCHANTS.filter(m => m.aliases.some(a => words.includes(a)));
  const categoryId = new Set(matches.map(m => m.categoryId)).size === 1 ? matches[0]?.categoryId : undefined;
  return { bank, instrument, tail, amount: paise, date: transactionDay, merchant, direction, reference, providerReference, categoryId, special, vpa, paymentRail, upiRecipientKind, creditKind, incomeKind, refundStatus, refundInitiatedAt, ...time };
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
  if (alert.date > new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)) return "Transaction date is in the future.";
  if (!alert.accountId) return "Match this card or account once before importing.";
  if (alert.refundStatus === 'initiated') return "Refund initiated; the bank says it may take up to 48 hours to appear. Confirm it is posted to your card before recording it.";
  if (isSalaryAlert(alert) || (alert.direction === 'credit' && alert.instrument === 'credit_card' && alert.creditKind === 'refund' && alert.refundStatus === 'posted')) return null;
  if (alert.creditKind === "repayment") return "Card repayment received. Link the existing transfer, or choose the paying account. This is not income or new spending.";
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
