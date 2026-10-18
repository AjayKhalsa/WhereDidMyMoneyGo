import type { NextRequest } from "next/server";
import { admin, checkOrigin, failure, GmailError, json, userFor } from "@/lib/gmail/server";
import { correctedRule } from "@/lib/gmail/classification";
import { learningData, ruleRow } from "@/lib/gmail/learning-data";
import type { Alert } from "@/lib/gmail/alerts";

export async function POST(request: NextRequest) {
  try {
    checkOrigin(request); const user = await userFor(request); const db = admin();
    const body = await request.json();
    if (typeof body.messageId !== "string" || !/^[a-f0-9]+$/.test(body.messageId)) throw new GmailError("Invalid message.");
    if (body.action === "ignore") {
      const kept = await db.from("gmail_messages").update({category_review:false,category_review_snapshot:null,reason:null}).eq("user_id",user.id).eq("message_id",body.messageId).eq("status","logged").eq("category_review",true);
      if(kept.error)throw kept.error;
      const result = await db.from("gmail_messages").update({ status: "ignored", reason: "Dismissed by you." }).eq("user_id", user.id).eq("message_id", body.messageId).eq("status", "review");
      if (result.error) throw result.error;
      return json({ status: "ignored" });
    }
    if (body.action === "match" && typeof body.existingTransactionId === "string" && typeof body.accountId === "string") {
      const result = await db.rpc("gmail_match_existing", { p_user: user.id, p_message: body.messageId,
        p_account: body.accountId, p_transaction: body.existingTransactionId });
      if (result.error || result.data === "review") throw new GmailError("The chosen entry does not match this alert. Check the account, direction, date and amount.", 409);
      return json({ status: result.data });
    }
    if (body.action !== "log" || !["EXPENSE", "INCOME", "TRANSFER"].includes(body.type) || typeof body.accountId !== "string") throw new GmailError("Choose the transaction type and account.");
    let ruleChange=null;
    if(body.learnCategory===true&&body.type==='EXPENSE'&&body.isRefund!==true&&typeof body.categoryId==='string'){
      const mail=await db.from('gmail_messages').select('candidate').eq('user_id',user.id).eq('message_id',body.messageId).maybeSingle();if(mail.error)throw mail.error;
      if(mail.data?.candidate){const data=await learningData(db,user.id);const change=correctedRule(mail.data.candidate as Alert,body.categoryId,data.rules);
        if(change)ruleChange={before:change.before?ruleRow(change.before):null,after:ruleRow({...change.after,id:change.before?.id??`${user.id}_${change.after.id}`})};}
    }
    const result = await db.rpc("gmail_review_save", {
      p_user: user.id, p_message: body.messageId, p_type: body.type, p_account: body.accountId,
      p_destination: typeof body.toAccountId === "string" && body.toAccountId || null,
      p_category: typeof body.categoryId === "string" && body.categoryId || null,
      p_refund: body.isRefund === true, p_allow_duplicate: body.allowDuplicate === true,p_rule:ruleChange,
    });
    if (result.error) throw new GmailError("The entry or rule may have changed. Reload and review it, or keep the current ledger entry.",409);
    if (result.data === "review") throw new GmailError("Possible duplicate: check the ledger first. Confirm it is a separate transaction to add it.", 409);
    return json({ status: result.data });
  } catch (e) { return failure(e); }
}
