import { alertDate, plainText, senderAddress } from "./alerts";

/** Provider evidence is distinct from the cash event at the bank. */
export interface InvestmentNotice {
  kind: "investment-allocation" | "investment-schedule";
  provider: "Groww" | "KFintech";
  scheme: string;
  /** Allocation emails report invested value, not necessarily the bank debit. */
  netAmount?: number;
  scheduledAmount?: number;
  units?: string;
  nav?: string;
  orderId?: string;
  dueDate?: string;
  bank?: string;
  tail?: string;
}

function money(value: string): number | undefined {
  if (!/^\d+(?:,\d{3})*(?:\.\d{1,2})?$/.test(value)) return;
  const amount = Math.round(Number(value.replace(/,/g, "")) * 100);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

export function isInvestmentNotice(value: unknown): value is InvestmentNotice {
  return !!value && typeof value === "object" && "kind" in value
    && ["investment-allocation", "investment-schedule"].includes(String(value.kind));
}

export function parseInvestmentNotice(from: string, subject: string, text: string): InvestmentNotice | null {
  const body = plainText(text);
  const sender = senderAddress(from);
  if (sender === "noreply@groww.in" && /^SIP:\s*Units allocated\s*$/i.test(subject)) {
    const allocation = /Mutual fund units have been allocated to your portfolio\.\s*SCHEME NAME\s+(.+?)\s+SIP AMOUNT\s*₹\s*([\d,.]+)\s+UNITS ALLOCATED\s+([\d.]+)\s+NAV\s+([\d.]+)\s+ORDER ID\s+([A-Z0-9]{8,64})\b/i.exec(body);
    if (!allocation) return null;
    const netAmount = money(allocation[2]!);
    if (!netAmount || !/^\d+(?:\.\d+)?$/.test(allocation[3]!) || !/^\d+(?:\.\d+)?$/.test(allocation[4]!)
      || Number(allocation[3]) <= 0 || Number(allocation[4]) <= 0) return null;
    return { kind: "investment-allocation", provider: "Groww", scheme: allocation[1]!.trim(),
      netAmount, units: allocation[3], nav: allocation[4], orderId: allocation[5]!.toUpperCase() };
  }
  if (sender === "noreply@groww.in" && /^SIP:\s*Instalment due in \d+ days?\s*$/i.test(subject)) {
    const scheduled = /SCHEME NAME\s+(.+?)\s+SIP AMOUNT\s*₹\s*([\d,.]+)\s+DUE DATE\s+(\d{1,2})\s+([A-Za-z]{3})['’](\d{2})\s+BANK\s+(.+?)\s+BANK ACCOUNT NO\.\s+([\dXx*]{4,})\b/i.exec(body);
    if (!scheduled) return null;
    const scheduledAmount = money(scheduled[2]!);
    const dueDate = alertDate(`${scheduled[3]}-${scheduled[4]}-${scheduled[5]}`);
    const tail = /\d{4}$/.exec(scheduled[7]!)?.[0];
    if (!scheduledAmount || !dueDate || !tail) return null;
    return { kind: "investment-schedule", provider: "Groww", scheme: scheduled[1]!.trim(),
      scheduledAmount, dueDate, bank: scheduled[6]!.trim(), tail };
  }
  if (sender === "mfservice@kfintech.com" && /Purchase Confirmation/i.test(subject)) {
    const purchase = /processed your purchase request for Rs\.?\s*([\d,.]+)\s+in\s+(.+?)\.\s*Accordingly\s+([\d.]+)\s+units have been allotted\b/i.exec(body);
    const netAmount = purchase && money(purchase[1]!);
    if (!purchase || !netAmount || !/^\d+(?:\.\d+)?$/.test(purchase[3]!) || Number(purchase[3]) <= 0) return null;
    return { kind: "investment-allocation", provider: "KFintech", scheme: purchase[2]!.trim(), netAmount, units: purchase[3] };
  }
  return null;
}

export function investmentNoticeReason(notice: InvestmentNotice): string {
  return notice.kind === "investment-schedule"
    ? "Upcoming SIP only; this reminder does not confirm a debit. No payment was created."
    : "Units allocated. Match the actual bank debit before recording an investment. Allocated value may differ from the cash debited; the email date is not proof of the bank posting date.";
}
