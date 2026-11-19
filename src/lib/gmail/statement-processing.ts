import type { SupabaseClient } from "@supabase/supabase-js";
import type { Account, Transaction } from "@/lib/domain/types";
import { completeLoad } from "@/lib/data/complete-load";
import { balanceAt, ledgerFingerprint } from "@/lib/engine/reconciliation";
import { domainRow } from "./learning-data";
import { validCardStatement } from "@/lib/domain/card-statement";
import { type MailPart } from "./alerts";
import { google, unseal } from "./server";
import { parseIssuerStatement, statementAccount } from "./statement-parser";
import { statementPdfText } from "./statement-pdf";

export const STATEMENT_PARSER_VERSION = 2;
type Evidence = { message_id: string; bank: string; subject: string; body_text: string; received_at: string; attachments: { name: string }[]; pdf_text?: string; pdf_status: string };

async function checkIssuerClosing(db: SupabaseClient, userId: string, accountId: string, issuedOn: string, balance: number, source: string) {
  const result = await db.from("accounts").select("*").eq("user_id", userId).eq("id", accountId).maybeSingle();
  if (result.error) throw result.error; if (!result.data) return;
  const account = domainRow<Account>(result.data), asOf = new Date(Date.parse(issuedOn) - 86400000).toISOString().slice(0, 10);
  if (account.reconciliation && account.reconciliation.asOf > asOf) return;
  const rows = await completeLoad((from,to) => db.from("transactions").select("*", { count: "exact" }).eq("user_id", userId).order("id").range(from,to), row => row.id);
  const transactions = rows.data.map(row => domainRow<Transaction>(row)), matches = balanceAt(account, transactions, asOf) === balance;
  const recordedAt = new Date().toISOString();
  const saved = await db.from("accounts").update({ reconciliation: { balance, asOf, source, recordedAt,
    fingerprint: ledgerFingerprint(account, transactions, asOf), status: matches ? "verified" : "stale" },
    ...(matches ? { last_reconciled_at: recordedAt } : {}) }).eq("user_id", userId).eq("id", accountId);
  if (saved.error) throw saved.error;
  return matches;
}
export async function processStatementEvidence(input: {
  db: SupabaseClient; userId: string; accessToken: string; deadline: number;
  accounts: Pick<Account, "id" | "name" | "type" | "hint" | "isActive">[]; aliases: Record<string, string>;
}) {
  const { db, userId, accessToken, deadline, accounts, aliases } = input;
  const pending = await db.from("financial_mail_evidence").select("*").eq("user_id", userId).lt("parser_version", STATEMENT_PARSER_VERSION).order("received_at", { ascending: false }).limit(5);
  if (pending.error) throw pending.error;
  let processed = 0;
  for (const e of pending.data as Evidence[] ?? []) {
    if (deadline - Date.now() < 14000) break;
    let candidate = parseIssuerStatement(e), pdfStatus = e.pdf_status, pdfText = e.pdf_text;
    let accountId = statementAccount(candidate, accounts, aliases);
    let credentialVersion: string | undefined;
    let hadPassword = false, issuerDateCorroborated = false;
    const notes: string[] = [];
    const needsPdf = candidate.kind === "card_statement" && (candidate.amount === undefined || !candidate.dueOn || !candidate.issuedOn);
    if (needsPdf && e.attachments.length && !pdfText) {
      const credentials = accountId ? await db.from("statement_credentials").select("sealed_password,updated_at").eq("user_id", userId).eq("account_id", accountId).maybeSingle() : null;
      if (credentials?.error) throw credentials.error;
      credentialVersion = credentials?.data?.updated_at;
      const password = credentials?.data ? unseal(credentials.data.sealed_password, `${userId}:statement:${accountId}`) : undefined;
      hadPassword = !!password;
      const mail = await google<{ payload: MailPart }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(e.message_id)}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const pdfs: MailPart[] = [];
      const visit = (p: MailPart) => { if (p.filename && /\.pdf$/i.test(p.filename.trim()) && !/terms|conditions|mitc|important.*information/i.test(p.filename)) pdfs.push(p); for (const c of p.parts ?? []) visit(c); };
      visit(mail.payload);
      pdfStatus = "unsupported";
      // Never guess which of several statement PDFs belongs to this card.
      if (pdfs.length === 1 && (pdfs[0]!.body?.size ?? 0) <= 5_000_000) {
        const part = pdfs[0]!;
        const body = part.body?.attachmentId ? await google<{ data?: string }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(e.message_id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`, { headers: { Authorization: `Bearer ${accessToken}` } }) : part.body;
        if (body?.data && body.data.length <= 7_000_000) {
          const result = await statementPdfText(Uint8Array.from(Buffer.from(body.data, "base64url")), password);
          pdfStatus = result.status;
          if (result.status === "read") { pdfText = result.text; candidate = parseIssuerStatement({ ...e, pdf_text: pdfText }); accountId = statementAccount(candidate, accounts, aliases); }
        }
      }
    } else if (!e.attachments.length) pdfStatus = "none";
    if (e.bank === "CRED" && accountId && candidate.issuedOn) {
      const peers = await db.from("financial_mail_evidence").select("bank,subject,body_text,attachments").eq("user_id", userId).eq("bank", candidate.bank);
      if (peers.error) throw peers.error;
      const dates = (peers.data ?? []).map(peer => parseIssuerStatement(peer)).filter(peer => peer.issuedOn &&
        statementAccount(peer, accounts, aliases) === accountId && Math.abs(Date.parse(peer.issuedOn) - Date.parse(candidate.issuedOn!)) <= 3 * 86400000).map(peer => peer.issuedOn!);
      if (new Set(dates).size === 1) { candidate.issuedOn = dates[0]; issuerDateCorroborated = true; }
    }
    if (pdfStatus === "locked") notes.push(hadPassword ? "This PDF could not be unlocked with the saved password. Update the PDF password to retry." : "PDF needs its password. Set it once for this account; it is stored encrypted on the server.");
    if (!accountId && candidate.kind === "card_statement") notes.push("Match this statement to a card before applying its bill.");
    if (accountId && candidate.amount !== undefined && candidate.issuedOn && candidate.dueOn) {
      const statement = { amount: candidate.amount, issuedOn: candidate.issuedOn, dueOn: candidate.dueOn, source: `${e.bank === "CRED" ? "CRED bill" : e.bank + " statement"} email`, recordedAt: new Date().toISOString() };
      const receivedDay = new Date(Date.parse(e.received_at) + 330 * 60000).toISOString().slice(0, 10);
      if (validCardStatement(statement) && Date.parse(statement.issuedOn) <= Date.parse(receivedDay) + 2 * 86400000 && Date.parse(statement.dueOn) <= Date.parse(statement.issuedOn) + 60 * 86400000) {
        const result = await db.rpc("apply_issuer_statement", { p_user: userId, p_message: e.message_id, p_account: accountId, p_statement: statement,
          p_statement_day: e.bank !== "CRED" ? Number(candidate.issuedOn.slice(8, 10)) : null });
        if (result.error) throw result.error;
        notes.push(result.data === "applied" ? "Issuer bill updated automatically; transaction history is unchanged." : result.data === "older" ? "Older bill retained as source evidence." : "Statement conflicts with saved details; review it.");
        if (result.data === "applied" && (e.bank !== "CRED" || issuerDateCorroborated)) {
          const checked = await checkIssuerClosing(db, userId, accountId, candidate.issuedOn, candidate.amount, `${candidate.bank} statement email`);
          if (checked === true) notes.push("Closing balance matches recorded history.");
          if (checked === false) notes.push("Recorded closing balance differs from the issuer; review missing entries or credits.");
        }
      } else notes.push("Statement dates or total need review; saved bill is unchanged.");
    } else if (candidate.kind === "card_statement" && pdfStatus !== "locked") notes.push("A complete billed amount and dates could not be read yet.");
    // A password may be saved while this pass is reading the same document.
    // Do not consume that retry if this pass used the previous credential.
    let retryWithNewPassword = false;
    if (accountId && pdfStatus === "locked") {
      const latest = await db.from("statement_credentials").select("updated_at").eq("user_id", userId).eq("account_id", accountId).maybeSingle();
      if (latest.error) throw latest.error;
      retryWithNewPassword = !!latest.data && latest.data.updated_at !== credentialVersion;
    }
    const result = await db.from("financial_mail_evidence").update({ parsed: candidate, account_id: accountId ?? null, pdf_text: pdfText ?? null, pdf_status: pdfStatus,
      parser_version: retryWithNewPassword ? 0 : STATEMENT_PARSER_VERSION, processed_at: new Date().toISOString(), processing_note: retryWithNewPassword ? "A new PDF password was saved during this scan. A retry is queued." : notes.join(" ") || "Source checked; no card bill inferred." }).eq("user_id", userId).eq("message_id", e.message_id);
    if (result.error) throw result.error;
    processed++;
  }
  const remaining = await db.from("financial_mail_evidence").select("message_id", { count: "exact", head: true }).eq("user_id", userId).lt("parser_version", STATEMENT_PARSER_VERSION);
  if (remaining.error) throw remaining.error;
  return { processed, more: (remaining.count ?? 0) > 0 };
}
