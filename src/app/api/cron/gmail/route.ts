import type { NextRequest } from "next/server";
import { admin, configured, failure, json, safeEqual } from "@/lib/gmail/server";
import { syncMailbox } from "@/lib/gmail/sync";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${process.env.CRON_SECRET}`)) return json({ error: "Unauthorized" }, 401);
  if (!configured()) return json({ error: "Gmail is not configured." }, 503);
  try {
    // Personal app. Oldest checked mailbox first; bounded work fits the cron budget.
    const result = await admin().from("gmail_connections").select("user_id").order("last_synced_at", { nullsFirst: true }).limit(1);
    if (result.error) throw result.error;
    if (!result.data?.length) return json({ connected: false });
    return json(await syncMailbox(result.data[0]!.user_id));
  } catch (e) { return failure(e); }
}
