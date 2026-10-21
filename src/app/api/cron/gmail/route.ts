import { notifySyncIssue } from "@/lib/notifications/server";
import type { NextRequest } from "next/server";
import { admin, configured, failure, json, safeEqual } from "@/lib/gmail/server";
import { syncMailbox } from "@/lib/gmail/sync";
import { drainMailbox } from "@/lib/gmail/health";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${process.env.CRON_SECRET}`)) return json({ error: "Unauthorized" }, 401);
  if (!configured()) return json({ error: "Gmail is not configured." }, 503);
  let userId: string | undefined;
  try {
    // Personal app. Oldest checked mailbox first; bounded work fits the cron budget.
    const result = await admin().from("gmail_connections").select("user_id").order("last_synced_at", { nullsFirst: true }).limit(1);
    if (result.error) throw result.error;
    if (!result.data?.length) return json({ connected: false });
    userId = result.data[0]!.user_id;
    const summary = await drainMailbox(deadline => syncMailbox(result.data[0]!.user_id, deadline));
    if (!summary.complete) await notifySyncIssue(userId!, "incomplete");
    return json(summary, summary.complete ? 200 : 202);
  } catch (e) {
    if (userId && (e as { status?: number }).status !== 409) await notifySyncIssue(userId, "failed");
    return failure(e);
  }
}
