import { header, mailText, senderAddress, type MailPart } from "./alerts";

export const STATEMENT_DOMAINS: Record<string, string> = {
  "hdfcbank.net": "HDFC", "hdfcbank.bank.in": "HDFC", "icicibank.com": "ICICI", "icici.bank.in": "ICICI",
  "hsbc.co.in": "HSBC", "hsbc.bank.in": "HSBC", "axisbank.com": "Axis", "axis.bank.in": "Axis", "cred.club": "CRED",
};
export const STATEMENT_QUERY = `(${Object.keys(STATEMENT_DOMAINS).map(domain => `from:(@${domain})`).join(" OR ")}) (subject:statement OR subject:"bill is ready" OR subject:"bill generated" OR subject:"payment due" OR subject:"amount due") -subject:OTP`;

export function statementEvidence(payload: MailPart, receivedAt: string | undefined) {
  const sender = senderAddress(header(payload, "From")), domain = sender.split("@")[1] ?? "";
  const root = Object.keys(STATEMENT_DOMAINS).find(d => domain === d || domain.endsWith(`.${d}`));
  const auth = header(payload, "Authentication-Results");
  const aligned = /dmarc=pass\b[^;]*\bheader\.from=([\w.-]+)/i.exec(auth)?.[1]?.toLowerCase();
  if (!root || !/^mx\.google\.com;/i.test(auth.trim()) || !aligned || !(domain === aligned || domain.endsWith(`.${aligned}`))) return;
  const subject = header(payload, "Subject").slice(0, 250);
  if (/otp|one.time.password/i.test(subject) || !/statement|bill.*(?:ready|generat)|(?:payment|amount)\s+due/i.test(subject)) return;
  const stamp = Number(receivedAt);
  if (!Number.isFinite(stamp) || stamp <= 0) return;
  const attachments: { name: string; mimeType: string }[] = [];
  const visit = (p: MailPart) => {
    if (p.filename) attachments.push({ name: p.filename.slice(0, 200), mimeType: p.mimeType ?? "" });
    for (const child of p.parts ?? []) visit(child);
  };
  visit(payload);
  // Keep the private financial source for review; exclude actionable URLs.
  // Never store OAuth tokens, general mailbox content or attachment binaries.
  const body = mailText(payload).replace(/https?:\/\/\S+/gi, "[link]").slice(0, 20000);
  return { bank: STATEMENT_DOMAINS[root]!, sender, subject, received_at: new Date(stamp).toISOString(), body_text: body, attachments };
}
