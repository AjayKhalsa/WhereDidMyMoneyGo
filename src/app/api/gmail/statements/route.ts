import type { NextRequest } from "next/server";
import { admin, checkOrigin, failure, GmailError, json, seal, userFor } from "@/lib/gmail/server";
import { drainMailbox } from "@/lib/gmail/health";
import { syncMailbox } from "@/lib/gmail/sync";

export const maxDuration = 60;
async function accountFor(userId: string, accountId: unknown) {
  if (typeof accountId !== "string" || !accountId || accountId.length > 200) throw new GmailError("Choose an account.");
  const db = admin();
  const account = await db.from("accounts").select("id,type").eq("user_id", userId).eq("id", accountId).eq("is_active", true).maybeSingle();
  if (account.error) throw account.error;
  if (!account.data || account.data.type !== "CREDIT_CARD") throw new GmailError("Card is unavailable.");
  return { db, accountId };
}

export async function GET(request: NextRequest) {
  try {
    const user = await userFor(request), { db, accountId } = await accountFor(user.id, request.nextUrl.searchParams.get("accountId"));
    const [credential, evidence] = await Promise.all([
      db.from("statement_credentials").select("account_id").eq("user_id", user.id).eq("account_id", accountId).maybeSingle(),
      db.from("financial_mail_evidence").select("message_id,bank,subject,received_at,pdf_status,processing_note,parsed").eq("user_id", user.id).eq("account_id", accountId).order("received_at", { ascending: false }).limit(3),
    ]);
    if (credential.error) throw credential.error; if (evidence.error) throw evidence.error;
    return json({ configured: !!credential.data, evidence: evidence.data });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); const user = await userFor(request), body = await request.json();
    const { db, accountId } = await accountFor(user.id, body.accountId);
    if (typeof body.password !== "string" || !body.password || body.password.length > 160 || /[\r\n\0]/.test(body.password)) throw new GmailError("Enter the PDF password exactly as supplied by your bank.");
    const saved = await db.from("statement_credentials").upsert({ user_id: user.id, account_id: accountId,
      sealed_password: seal(body.password, `${user.id}:statement:${accountId}`), updated_at: new Date().toISOString() }, { onConflict: "user_id,account_id" });
    if (saved.error) throw saved.error;
    const reset = await db.from("financial_mail_evidence").update({ parser_version: 0 }).eq("user_id", user.id).eq("account_id", accountId).in("pdf_status", ["locked", "unsupported"]);
    if (reset.error) throw reset.error;
    try {
      const sync = await drainMailbox(deadline => syncMailbox(user.id, deadline));
      return json({ saved: true, complete: sync.complete });
    } catch { return json({ saved: true, complete: false, message: "Password saved encrypted. Gmail sync will retry; check the statement status." }); }
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request); const user = await userFor(request), body = await request.json();
    const { db, accountId } = await accountFor(user.id, body.accountId);
    const result = await db.from("statement_credentials").delete().eq("user_id", user.id).eq("account_id", accountId);
    if (result.error) throw result.error;
    return json({ removed: true });
  } catch (error) { return failure(error); }
}
