import { completeLoad } from "@/lib/data/complete-load";
import { actionableGmailReviews, groupGmailReviews } from "@/lib/gmail/review-list";
import { domainRow } from "@/lib/gmail/learning-data";
import type { Transaction } from "@/lib/domain/types";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { admin, checkOrigin, configured, failure, GmailError, json, unseal, userFor } from "@/lib/gmail/server";
import { gmailHealth } from "@/lib/gmail/health";

export async function GET(request: NextRequest) {
  try {
    const session = json({}); const user = await userFor(request, session);
    if (!configured()) return json({ configured: false, connection: null, messages: [] });
    const db = admin();
    const [connection, messages, pending, historical, ledger, sources, categories] = await Promise.all([
      db.from("gmail_connections").select("email,start_date,last_synced_at,last_error,page_token,receipt_scan").eq("user_id", user.id).maybeSingle(),
      completeLoad<Record<string, any>>((from,to)=>db.from("gmail_messages").select("message_id,subject,candidate,reason,status,category_review,transaction_id,category_review_snapshot",{count:"exact"}).eq("user_id",user.id).or("status.eq.review,category_review.eq.true").order("message_id").range(from,to),row=>row.message_id),
      db.from("gmail_messages").select("message_id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
      db.from("gmail_backfill_runs").select("query,status,discovery_complete").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      completeLoad<Record<string, any>>((from,to)=>db.from("transactions").select("id,type,amount,date,description,merchant,notes,account_id,to_account_id,category_id",{count:"exact"}).eq("user_id",user.id).order("id").range(from,to),row=>row.id),
      completeLoad<Record<string, any>>((from,to)=>db.from("transaction_sources").select("source_kind,source_key,transaction_id,account_id,direction,amount,bank_reference",{count:"exact"}).eq("user_id",user.id).order("source_key").order("source_kind").range(from,to),row=>JSON.stringify([row.source_kind,row.source_key])),
      completeLoad<Record<string, any>>((from,to)=>db.from("categories").select("id",{count:"exact"}).eq("user_id",user.id).order("id").range(from,to),row=>row.id),
    ]);
    for (const result of [connection, pending, historical]) if (result.error) throw result.error;
    const actionable = actionableGmailReviews(messages.data as any,ledger.data.map(row=>domainRow<Transaction>(row)),sources.data as any,new Set(categories.data.map(row=>String(row.id))));
    const groups=groupGmailReviews(actionable,ledger.data.map(row=>domainRow<Transaction>(row)));
    const financialReviewCount=groups.financial.length+groups.possibleExisting.length;
    const categoryReviewCount=groups.category.length;
    const clean=(rows:typeof actionable)=>rows.slice(0,50).map(({category_review_snapshot:_snapshot,...row})=>row);
    const receiptWork=!!connection.data?.receipt_scan?.before;
    const health = gmailHealth({ lastSyncedAt: connection.data?.last_synced_at, error: connection.data?.last_error, hasNextPage: !!connection.data?.page_token,hasReceiptWork:receiptWork, pending: pending.count ?? 0, review: financialReviewCount, historical: historical.data });
    const response = json({ configured: true, connection: connection.data ? { ...connection.data, page_token: undefined,receipt_scan:undefined, more: !!connection.data.page_token||receiptWork } : null,
      messages:clean(groups.financial),categoryMessages:clean(groups.category),possibleExistingMessages:clean(groups.possibleExisting),
      reviewCount:groups.financial.length,financialReviewCount,categoryReviewCount,possibleExistingCount:groups.possibleExisting.length,health });
    for (const cookie of session.cookies.getAll()) response.cookies.set(cookie);
    return response;
  } catch (e) { return failure(e); }
}

export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request); const user = await userFor(request); const db = admin();
    const lease = randomUUID();
    const lock = await db.rpc("gmail_acquire_lease", { p_user: user.id, p_lease: lease });
    if (lock.error) throw lock.error;
    const result = await db.from("gmail_connections").select("refresh_token").eq("user_id", user.id).maybeSingle();
    if (result.error) throw result.error;
    if (result.data && !lock.data) throw new GmailError("Wait for the current sync to finish, then disconnect.", 409);
    if (result.data) {
      try {
      const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: unseal(result.data.refresh_token, user.id) }), signal: AbortSignal.timeout(10000) });
      if (!response.ok && response.status !== 400) throw new GmailError("Google could not revoke access. Please retry.", 502);
      const removed = await db.from("gmail_connections").delete().eq("user_id", user.id);
      if (removed.error) throw removed.error;
      } finally {
        await db.from("gmail_connections").update({ lease_id: null, lease_until: null }).eq("user_id", user.id).eq("lease_id", lease);
      }
    }
    // Keep ledger entries and dedup receipts so reconnecting cannot duplicate them.
    return json({ disconnected: true });
  } catch (e) { return failure(e); }
}
