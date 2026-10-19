import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { admin, checkOrigin, configured, failure, GmailError, json, unseal, userFor } from "@/lib/gmail/server";
import { gmailHealth } from "@/lib/gmail/health";

export async function GET(request: NextRequest) {
  try {
    const session = json({}); const user = await userFor(request, session);
    if (!configured()) return json({ configured: false, connection: null, messages: [] });
    const db = admin();
    const [connection, messages, count, pending, historical] = await Promise.all([
      db.from("gmail_connections").select("email,start_date,last_synced_at,last_error,page_token").eq("user_id", user.id).maybeSingle(),
      db.from("gmail_messages").select("message_id,subject,candidate,reason,status,category_review,transaction_id").eq("user_id", user.id).or("status.eq.review,category_review.eq.true").order("created_at").limit(50),
      db.from("gmail_messages").select("message_id", { count: "exact", head: true }).eq("user_id", user.id).or("status.eq.review,category_review.eq.true"),
      db.from("gmail_messages").select("message_id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
      db.from("gmail_backfill_runs").select("query,status,discovery_complete").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const result of [connection, messages, count, pending, historical]) if (result.error) throw result.error;
    const health = gmailHealth({ lastSyncedAt: connection.data?.last_synced_at, error: connection.data?.last_error, hasNextPage: !!connection.data?.page_token, pending: pending.count ?? 0, review: count.count ?? 0, historical: historical.data });
    const response = json({ configured: true, connection: connection.data ? { ...connection.data, page_token: undefined, more: !!connection.data.page_token } : null, messages: messages.data, reviewCount: count.count, health });
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
