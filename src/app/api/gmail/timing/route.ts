import type { NextRequest } from "next/server";
import { admin, failure, GmailError, json, userFor } from "@/lib/gmail/server";
import { validWallTime } from "@/lib/domain/transaction-time";
import type { TimeEvidence } from "@/lib/engine/history-enrichment";

/** Read-only evidence from receipts already linked to canonical ledger IDs.
 * No email bodies, OAuth tokens, new mailbox scan or amount-only matching. */
export async function GET(request: NextRequest) {
  try {
    const session = json({});
    const user = await userFor(request, session);
    const db = admin(), evidence: TimeEvidence[] = [];
    let complete = false;
    for (let offset = 0; offset <= 10000; offset += 1000) {
      const result = await db.from("gmail_messages").select("transaction_id,candidate").eq("user_id", user.id).eq("status", "logged").not("transaction_id", "is", null).order("message_id").range(offset, offset + 999);
      if (result.error) throw result.error;
      for (const row of result.data ?? []) {
        const a = row.candidate;
        if (!a || a.direction !== "debit" || a.special || a.timeConfidence !== "exact" || !["bank", "payment"].includes(a.timeSource) || typeof a.occurredAt !== "string" || !validWallTime(a.occurredAt) || a.occurredAt.slice(0,10) !== a.date || !a.accountId || !Number.isSafeInteger(a.amount)) continue;
        evidence.push({ transactionId: row.transaction_id, occurredAt: a.occurredAt, source: a.timeSource, bankDate: a.date, accountId: a.accountId, amount: a.amount });
      }
      if ((result.data?.length ?? 0) < 1000) { complete = true; break; }
    }
    if (!complete) throw new GmailError("Too many saved receipts to load a complete preview. No historical transactions were changed.", 409);
    const response = json({ evidence });
    for (const cookie of session.cookies.getAll()) response.cookies.set(cookie);
    return response;
  } catch (error) { return failure(error); }
}
