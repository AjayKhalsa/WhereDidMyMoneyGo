import { nonPaymentNotice } from "./bank-notices";
import { createHash, randomUUID } from "node:crypto";
import type { Account } from "@/lib/domain/types";
import { accountForAlert, authenticatedSender, automaticReason, financialSendersQuery, ALERT_PARSER_VERSION, header, mailText, parseAlert, type MailPart } from "./alerts";
import { admin, GmailError, GoogleRequestError, google, tokenRequest, unseal } from "./server";
import { historicalRules, classifiedAlert } from "./classification";
import { learningData, ruleRow } from "./learning-data";
import { investmentNoticeReason, parseInvestmentNotice } from "./investment-notices";
import { classificationMerchantKey, merchantKey } from "@/lib/engine/merchant-identity";
import { syncFoodReceipts } from './receipt-sync';

export async function syncMailbox(userId: string, deadline = Date.now() + 45000) {
  const db = admin(), lease = randomUUID();
  const acquired = await db.rpc("gmail_acquire_lease", { p_user: userId, p_lease: lease });
  if (acquired.error) throw acquired.error;
  if (!acquired.data) throw new GmailError("A sync is already running, or Gmail is not connected.", 409);
  const started = Date.now();
  let logged = 0, reviewed = 0, matched = 0;
  try {
    const connectionResult = await db.from("gmail_connections").select("*").eq("user_id", userId).single();
    if (connectionResult.error) throw connectionResult.error;
    const connection = connectionResult.data;
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: unseal(connection.refresh_token, userId) });
    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const base = "https://gmail.googleapis.com/gmail/v1/users/me";
    const start = new Date(`${connection.start_date}T00:00:00+05:30`).getTime();
    // Fixed query for the lifetime of a paginated scan. Overlap handles delayed alerts.
    const scanStarted = connection.scan_started_at ?? new Date().toISOString();
    const after = connection.scan_after ?? Math.floor(Math.max(start - 86400000, connection.last_synced_at ? new Date(connection.last_synced_at).getTime() - 7 * 86400000 : 0) / 1000);
    const q = `after:${after} before:${Math.ceil(new Date(scanStarted).getTime()/1000)} -in:spam -in:trash -subject:OTP -subject:statement ${financialSendersQuery()}`;
    const params = new URLSearchParams({ q, maxResults: "25" });
    if (connection.page_token) params.set("pageToken", connection.page_token);
    type Page={ messages?: { id: string }[]; nextPageToken?: string };
    let page:Page;
    try { page=await google<Page>(`${base}/messages?${params}`,{headers}); }
    catch(error) {
      // Gmail cursors expire. Restart the same fixed scan, retaining all queued
      // receipts and its time bounds; idempotent upserts make replay safe.
      // Auth, rate-limit and network failures must not erase a valid cursor.
      if(!connection.page_token||!(error instanceof GoogleRequestError)||error.upstreamStatus!==400)throw error;
      const reset=await db.from('gmail_connections').update({page_token:null}).eq('user_id',userId).eq('lease_id',lease);
      if(reset.error)throw reset.error;
      params.delete('pageToken');
      page=await google<Page>(`${base}/messages?${params}`,{headers});
    }
    if (page.messages?.length) {
      const inserted = await db.from("gmail_messages").upsert(page.messages.map(m => ({ user_id: userId, message_id: m.id })), { onConflict: "user_id,message_id", ignoreDuplicates: true });
      if (inserted.error) throw inserted.error;
    }
    // Queue ids durably before moving the cursor; an interruption can be retried.
    const cursor = await db.from("gmail_connections").update(page.nextPageToken ? {
      page_token: page.nextPageToken, scan_after: after, scan_started_at: scanStarted,
    } : { page_token: null, scan_after: null, scan_started_at: null, last_synced_at: scanStarted }).eq("user_id", userId).eq("lease_id", lease);
    if (cursor.error) throw cursor.error;
    const [accountResult, categoryResult, inboxResult] = await Promise.all([
      db.from("accounts").select("id,name,type,hint,is_active").eq("user_id", userId),
      db.from("categories").select("id").eq("user_id", userId),
      db.from("gmail_messages").select("message_id").eq("user_id", userId).or(`status.eq.pending,and(status.eq.review,parser_version.lt.${ALERT_PARSER_VERSION})`).order("created_at").limit(25),
    ]);
    for (const result of [accountResult, categoryResult, inboxResult]) if (result.error) throw result.error;
    const accounts = (accountResult.data ?? []).map(a => ({ ...a, isActive: a.is_active })) as Pick<Account, "id" | "name" | "type" | "hint" | "isActive">[];
    let learned = await learningData(db,userId,true);
    const trained=historicalRules(learned.transactions,learned.rules);
    if(trained.rules.length){
      const seeded=await db.rpc('gmail_seed_rules',{p_user:userId,p_rules:trained.rules.map(r=>ruleRow({...r,id:`${userId}_${r.id}`}))});if(seeded.error)throw seeded.error;
      learned=await learningData(db,userId);
    }
    learned.rules=learned.rules.filter(r=>r.learningEvidence?.source!=='history'||!trained.conflicts.includes(classificationMerchantKey(r.learningEvidence.merchantKey)));
    const profile=await db.from('profiles').select('name').eq('id',userId).maybeSingle();if(profile.error)throw profile.error;
    for (const item of inboxResult.data ?? []) {
      if (Date.now() - started > 40000 || deadline - Date.now() < 12000) break;
      const mail = await google<{ payload: MailPart; internalDate?: string }>(`${base}/messages/${encodeURIComponent(item.message_id)}?format=full`, { headers });
      const subject = header(mail.payload, "Subject").slice(0, 250);
      const receivedAt = mail.internalDate && /^\d+$/.test(mail.internalDate) ? Number(mail.internalDate) : undefined;
      const candidate = parseAlert(header(mail.payload, "From"), subject, mailText(mail.payload), receivedAt);
      if (candidate) {
        candidate.accountId = accountForAlert(candidate, accounts, connection.aliases ?? {});
        const selfName=profile.data?.name;
        if(selfName&&merchantKey(selfName).length>=3&&merchantKey(candidate.merchant).includes(merchantKey(selfName)))candidate.special=true;
        Object.assign(candidate,classifiedAlert(candidate,learned.rules,learned.categories,selfName?[selfName]:[],trained.conflicts));
        if (!categoryResult.data?.some(c => c.id === candidate.categoryId)) candidate.categoryId = undefined;
      }
      const notice = candidate ? null : parseInvestmentNotice(header(mail.payload, "From"), subject, mailText(mail.payload));
      const authenticated = authenticatedSender(mail.payload);
      const informational = !candidate && !notice && authenticated ? nonPaymentNotice(header(mail.payload,"From"),subject,mailText(mail.payload)) : undefined;
      const reason = informational ?? (candidate ? automaticReason(candidate, authenticated, connection.start_date) : notice ? (authenticated ? investmentNoticeReason(notice) : "Sender authentication could not be verified.") : "Unrecognized alert format. Check the email before entering it manually.");
      // Reference dedup is independent of message id. No reference means review
      // on a ledger amount/date collision, never silently drop a real purchase.
      const eventKey = candidate?.reference ? createHash("sha256").update([candidate.bank, candidate.instrument, candidate.tail, candidate.direction, candidate.reference, candidate.amount].join("|")).digest("hex") : null;
      // Mark the parser version only after matching/committing succeeds. A
      // transient failure must leave this review receipt eligible for retry.
      const saved = await db.from("gmail_messages").update({ subject, candidate: candidate ?? notice, status: informational || notice?.kind === "investment-schedule" && authenticated ? "ignored" : "review", reason, event_key: eventKey }).eq("user_id", userId).eq("message_id", item.message_id).in("status", ["pending", "review"]).select("message_id").maybeSingle();
      if (!saved.error && !saved.data) continue; // User resolved/dismissed it during this pass.
      if (saved.error?.code === "23505") {
        const original = await db.from("gmail_messages").select("status,transaction_id").eq("user_id", userId).eq("event_key", eventKey).maybeSingle();
        if (original.error) throw original.error;
        const originalTransaction = original.data?.transaction_id
          ? await db.from("transactions").select("id").eq("user_id", userId).eq("id", original.data.transaction_id).maybeSingle() : null;
        if (originalTransaction?.error) throw originalTransaction.error;
        if (original.data?.status !== "logged" || !originalTransaction?.data) {
          const duplicate = await db.from("gmail_messages").update({ subject, status: "duplicate", reason: "Another alert for this reference is already dismissed or awaiting review.", parser_version: ALERT_PARSER_VERSION }).eq("user_id", userId).eq("message_id", item.message_id).in("status", ["pending", "review"]);
          if (duplicate.error) throw duplicate.error;
          continue;
        }
        const pendingMatch = await db.from("gmail_messages").update({ subject, candidate, status: "review", reason, event_key: null }).eq("user_id", userId).eq("message_id", item.message_id).in("status", ["pending", "review"]);
        if (pendingMatch.error) throw pendingMatch.error;
      }
      if (saved.error && saved.error.code !== "23505") throw saved.error;
      const finish = async () => {
        const done = await db.from('gmail_messages').update({ parser_version: ALERT_PARSER_VERSION }).eq('user_id',userId).eq('message_id',item.message_id);
        if (done.error) throw done.error;
      };
      if (informational || notice?.kind === "investment-schedule" && authenticated) { await finish(); continue; }
      if (candidate && authenticated) {
        const existing = await db.rpc("gmail_match_recorded", { p_user: userId, p_message: item.message_id, p_authenticated: true });
        if (existing.error) throw existing.error;
        if (existing.data === "matched") { await finish(); matched++; continue; }
        if (existing.data === "duplicate") { await finish(); continue; }
      }
      if (candidate && !reason) {
        const result = candidate.direction === 'credit'
          ? await db.rpc('gmail_commit_identified_credit',{ p_user:userId,p_message:item.message_id,p_authenticated:authenticated })
          : await db.rpc("gmail_commit_classified", { p_user: userId, p_message: item.message_id });
        if (result.error) throw result.error;
        if (result.data === "logged") logged++; else if (result.data === "matched") matched++; else reviewed++;
      } else reviewed++;
      await finish();
    }
    const pending = await db.from("gmail_messages").select("message_id", { count: "exact", head: true }).eq("user_id", userId).or(`status.eq.pending,and(status.eq.review,parser_version.lt.${ALERT_PARSER_VERSION})`);
    if (pending.error) throw pending.error;
    const financialMore=!!page.nextPageToken||(pending.count??0)>0;
    // Payment capture has priority. Receipt metadata shares this lease and the
    // remaining deadline, but uses an independent durable discovery cursor.
    const receipts=financialMore?undefined:await syncFoodReceipts({db,userId,lease,accessToken:tokens.access_token,state:connection.receipt_scan??{},startDate:connection.start_date,deadline});
    const cleared = await db.from("gmail_connections").update({ last_error: null }).eq("user_id", userId).eq("lease_id", lease);
    if (cleared.error) throw cleared.error;
    return { logged, reviewed, matched, more: financialMore||!!receipts?.more, ...(receipts?{receiptsChecked:receipts.checked,receiptsLinked:receipts.linked}:{}) };
  } catch (error) {
    await db.from("gmail_connections").update({ last_error: error instanceof GmailError ? error.message : "Sync interrupted. Retry to continue safely." }).eq("user_id", userId).eq("lease_id", lease);
    throw error;
  } finally {
    await db.from("gmail_connections").update({ lease_id: null, lease_until: null }).eq("user_id", userId).eq("lease_id", lease);
  }
}
