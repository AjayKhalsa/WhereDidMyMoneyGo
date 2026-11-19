import type { SupabaseClient } from "@supabase/supabase-js";
import { GmailError, GoogleRequestError, google } from "./server";
import type { MailPart } from "./alerts";
import type { ReceiptScan } from "./receipt-sync";
import { STATEMENT_QUERY, statementEvidence } from "./statement-evidence";

/** Independent, durable statement discovery. A statement is evidence, never
 * an expense. The caller holds the same mailbox lease as transaction sync. */
export async function syncStatementEvidence(input: {
  db: SupabaseClient; userId: string; lease: string; accessToken: string;
  state: ReceiptScan; startDate: string; deadline: number; now?: () => number;
}) {
  const { db, userId, lease, accessToken, deadline } = input, now = input.now ?? Date.now;
  let state = { ...input.state }, checked = 0;
  const save = async (next: ReceiptScan) => {
    const result = await db.from("gmail_connections").update({ statement_scan: next }).eq("user_id", userId)
      .eq("lease_id", lease).gt("lease_until", new Date(now()).toISOString()).select("user_id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new GmailError("Statement scan paused safely. Retry to continue.", 409);
    state = next;
  };
  if (deadline - now() < 12000) return { checked, more: true };
  if (!state.before) {
    const previous = state.completedAt ? Date.parse(state.completedAt) : NaN;
    await save({ completedAt: state.completedAt, after: Math.floor(Math.max(Date.parse(input.startDate + "T00:00:00+05:30") - 86400000,
      Number.isFinite(previous) ? previous - 7 * 86400000 : now() - 100 * 86400000) / 1000), before: Math.ceil(now() / 1000) });
  }
  const base = "https://gmail.googleapis.com/gmail/v1/users/me", headers = { Authorization: `Bearer ${accessToken}` };
  if (!state.loaded) {
    const params = new URLSearchParams({ q: `after:${state.after} before:${state.before} -in:spam -in:trash ${STATEMENT_QUERY}`, maxResults: "8" });
    if (state.token) params.set("pageToken", state.token);
    type Page = { messages?: { id: string }[]; nextPageToken?: string }; let page: Page;
    try { page = await google<Page>(`${base}/messages?${params}`, { headers }); }
    catch (error) {
      if (!state.token || !(error instanceof GoogleRequestError) || error.upstreamStatus !== 400) throw error;
      await save({ ...state, token: undefined }); params.delete("pageToken");
      page = await google<Page>(`${base}/messages?${params}`, { headers });
    }
    await save({ ...state, loaded: true, pending: [...new Set((page.messages ?? []).map(m => m.id))], next: page.nextPageToken });
  }
  for (const id of [...state.pending ?? []]) {
    if (deadline - now() < 12000) break;
    const existing = await db.from("financial_mail_evidence").select("message_id").eq("user_id", userId).eq("message_id", id).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) {
      let mail: { payload: MailPart; internalDate?: string } | null;
      try { mail = await google<{ payload: MailPart; internalDate?: string }>(`${base}/messages/${encodeURIComponent(id)}?format=full`, { headers }); }
      catch (error) { if (error instanceof GoogleRequestError && error.upstreamStatus === 404) mail = null; else throw error; }
      const evidence = mail && statementEvidence(mail.payload, mail.internalDate);
      if (evidence) {
        const result = await db.from("financial_mail_evidence").upsert({ user_id: userId, message_id: id, ...evidence }, { onConflict: "user_id,message_id", ignoreDuplicates: true });
        if (result.error) throw result.error;
      }
    }
    await save({ ...state, pending: state.pending!.filter(x => x !== id) }); checked++;
  }
  if (state.pending?.length) return { checked, more: true };
  if (state.next) { await save({ completedAt: state.completedAt, after: state.after, before: state.before, token: state.next }); return { checked, more: true }; }
  await save({ completedAt: new Date(state.before! * 1000).toISOString() });
  return { checked, more: false };
}
