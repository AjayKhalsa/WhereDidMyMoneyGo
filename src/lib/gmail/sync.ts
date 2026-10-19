import { createHash, randomUUID } from "node:crypto";
import type { Account } from "@/lib/domain/types";
import { accountForAlert, authenticatedSender, automaticReason, BANK_SENDERS, header, mailText, parseAlert, type MailPart } from "./alerts";
import { admin, GmailError, google, tokenRequest, unseal } from "./server";
import { historicalRules, classifiedAlert } from "./classification";
import { learningData, ruleRow } from "./learning-data";
import { merchantKey } from "@/lib/engine/merchant-identity";

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
    const q = `after:${after} before:${Math.ceil(new Date(scanStarted).getTime()/1000)} -in:spam -in:trash -subject:OTP -subject:statement {${Object.keys(BANK_SENDERS).map(s => `from:${s}`).join(" ")}}`;
    const params = new URLSearchParams({ q, maxResults: "25" });
    if (connection.page_token) params.set("pageToken", connection.page_token);
    const page = await google<{ messages?: { id: string }[]; nextPageToken?: string }>(`${base}/messages?${params}`, { headers });
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
      db.from("gmail_messages").select("message_id").eq("user_id", userId).eq("status", "pending").order("created_at").limit(25),
    ]);
    for (const result of [accountResult, categoryResult, inboxResult]) if (result.error) throw result.error;
    const accounts = (accountResult.data ?? []).map(a => ({ ...a, isActive: a.is_active })) as Pick<Account, "id" | "name" | "type" | "hint" | "isActive">[];
    let learned = await learningData(db,userId,true);
    const trained=historicalRules(learned.transactions,learned.rules);
    if(trained.rules.length){
      const seeded=await db.rpc('gmail_seed_rules',{p_user:userId,p_rules:trained.rules.map(r=>ruleRow({...r,id:`${userId}_${r.id}`}))});if(seeded.error)throw seeded.error;
      learned=await learningData(db,userId);
    }
    learned.rules=learned.rules.filter(r=>r.learningEvidence?.source!=='history'||!trained.conflicts.includes(r.learningEvidence.merchantKey));
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
      const reason = candidate ? automaticReason(candidate, authenticatedSender(mail.payload), connection.start_date) : "Unrecognized alert format. Check the email before entering it manually.";
      // Reference dedup is independent of message id. No reference means review
      // on a ledger amount/date collision, never silently drop a real purchase.
      const eventKey = candidate?.reference ? createHash("sha256").update([candidate.bank, candidate.instrument, candidate.tail, candidate.direction, candidate.reference, candidate.amount].join("|")).digest("hex") : null;
      const saved = await db.from("gmail_messages").update({ subject, candidate, status: "review", reason, event_key: eventKey }).eq("user_id", userId).eq("message_id", item.message_id).eq("status", "pending");
      if (saved.error?.code === "23505") {
        const original = await db.from("gmail_messages").select("status,transaction_id").eq("user_id", userId).eq("event_key", eventKey).maybeSingle();
        if (original.error) throw original.error;
        const originalTransaction = original.data?.transaction_id
          ? await db.from("transactions").select("id").eq("user_id", userId).eq("id", original.data.transaction_id).maybeSingle() : null;
        if (originalTransaction?.error) throw originalTransaction.error;
        if (original.data?.status !== "logged" || !originalTransaction?.data) {
          const duplicate = await db.from("gmail_messages").update({ subject, status: "duplicate", reason: "Another alert for this reference is already dismissed or awaiting review." }).eq("user_id", userId).eq("message_id", item.message_id);
          if (duplicate.error) throw duplicate.error;
          continue;
        }
        const pendingMatch = await db.from("gmail_messages").update({ subject, candidate, status: "review", reason, event_key: null }).eq("user_id", userId).eq("message_id", item.message_id).eq("status", "pending");
        if (pendingMatch.error) throw pendingMatch.error;
      }
      if (saved.error && saved.error.code !== "23505") throw saved.error;
      if (candidate && !reason) {
        const result = await db.rpc("gmail_commit_classified", { p_user: userId, p_message: item.message_id });
        if (result.error) throw result.error;
        if (result.data === "logged") logged++; else if (result.data === "matched") matched++; else reviewed++;
      } else reviewed++;
    }
    const pending = await db.from("gmail_messages").select("message_id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending");
    if (pending.error) throw pending.error;
    const cleared = await db.from("gmail_connections").update({ last_error: null }).eq("user_id", userId).eq("lease_id", lease);
    if (cleared.error) throw cleared.error;
    return { logged, reviewed, matched, more: !!page.nextPageToken || (pending.count ?? 0) > 0 };
  } catch (error) {
    await db.from("gmail_connections").update({ last_error: error instanceof GmailError ? error.message : "Sync interrupted. Retry to continue safely." }).eq("user_id", userId).eq("lease_id", lease);
    throw error;
  } finally {
    await db.from("gmail_connections").update({ lease_id: null, lease_until: null }).eq("user_id", userId).eq("lease_id", lease);
  }
}
