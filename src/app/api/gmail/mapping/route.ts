import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { admin, checkOrigin, failure, GmailError, json, userFor } from "@/lib/gmail/server";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); const user = await userFor(request); const db = admin();
    const { messageId, accountId } = await request.json();
    if (typeof messageId !== "string" || typeof accountId !== "string") throw new GmailError("Choose an alert and account.");
    const lease = randomUUID();
    const lock = await db.rpc("gmail_acquire_lease", { p_user: user.id, p_lease: lease });
    if (lock.error) throw lock.error;
    if (!lock.data) throw new GmailError("Wait for the current sync to finish before changing account matches.", 409);
    try {
    const [mail, account, connection] = await Promise.all([
      db.from("gmail_messages").select("candidate").eq("user_id", user.id).eq("message_id", messageId).single(),
      db.from("accounts").select("id,type,is_active").eq("user_id", user.id).eq("id", accountId).single(),
      db.from("gmail_connections").select("aliases").eq("user_id", user.id).single(),
    ]);
    const a = mail.data?.candidate;
    if (!a || !account.data?.is_active || !connection.data) throw new GmailError("Choose a connected alert and an active account.");
    if (account.data.type !== (a.instrument === "credit_card" ? "CREDIT_CARD" : "BANK")) throw new GmailError("Match credit cards to credit card accounts, and debit cards to bank accounts.");
    const key = `${a.bank}:${a.instrument}:${a.tail}`;
    const saved = await db.from("gmail_connections").update({ aliases: { ...connection.data.aliases, [key]: accountId } }).eq("user_id", user.id);
    if (saved.error) throw saved.error;
    return json({ saved: true });
    } finally {
      await db.from("gmail_connections").update({ lease_id: null, lease_until: null }).eq("user_id", user.id).eq("lease_id", lease);
    }
  } catch (e) { return failure(e); }
}
