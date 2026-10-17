import type { NextRequest } from "next/server";
import { admin, checkOrigin, failure, GmailError, json, userFor } from "@/lib/gmail/server";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); const user = await userFor(request); const db = admin();
    const body = await request.json();
    if (typeof body.messageId !== "string" || !/^[a-f0-9]+$/.test(body.messageId)) throw new GmailError("Invalid message.");
    if (body.action === "ignore") {
      const result = await db.from("gmail_messages").update({ status: "ignored", reason: "Dismissed by you." }).eq("user_id", user.id).eq("message_id", body.messageId).eq("status", "review");
      if (result.error) throw result.error;
      return json({ status: "ignored" });
    }
    if (body.action !== "log" || !["EXPENSE", "INCOME", "TRANSFER"].includes(body.type) || typeof body.accountId !== "string") throw new GmailError("Choose the transaction type and account.");
    const result = await db.rpc("gmail_commit", {
      p_user: user.id, p_message: body.messageId, p_type: body.type, p_account: body.accountId,
      p_destination: typeof body.toAccountId === "string" && body.toAccountId || null,
      p_category: typeof body.categoryId === "string" && body.categoryId || null,
      p_refund: body.isRefund === true, p_reviewed: true, p_allow_duplicate: body.allowDuplicate === true,
    });
    if (result.error) throw new GmailError("Check the account, destination and category, then try again.");
    if (result.data === "review") throw new GmailError("Possible duplicate: check the ledger first. Confirm it is a separate transaction to add it.", 409);
    return json({ status: result.data });
  } catch (e) { return failure(e); }
}
