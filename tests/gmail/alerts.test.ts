import assert from "node:assert/strict";
import { test } from "node:test";
import { accountForAlert, alertDate, authenticatedSender, automaticReason, mailText, parseAlert, type Alert } from "../../src/lib/gmail/alerts";
import type { Account } from "../../src/lib/domain/types";

// Synthetic fixtures preserving observed bank layouts, not private emails.
const card = "Your ICICI Bank Credit Card XX1234 has been used for a transaction of INR 340.00 on Oct 15, 2026 at 07:26:54. Info: UPI-123456789012-ZOMATO. The Available Credit Limit on your card is INR 3,63,534.82.";
test('Axis footer text cannot become payee identity or a learned merchant pattern',()=>{
 const text='Amount Credited: INR 650.00 Account Number: XX1234 Date & Time: 22-10-2026, 12:15:00 IST Transaction Info: UPI/P2A/123456789012/EXAMPLE PERSON/HDFC/UPI Feel free to connect with us for any clarification. Call us at: 18000000000 Always open to help';
 const a=parseAlert('alerts@axis.bank.in','INR 650.00 was credited to your A/c.',text)!;
 assert.equal(a.merchant,'EXAMPLE PERSON/HDFC/UPI');assert.equal(a.amount,65000);assert.equal(a.reference,'123456789012');assert.equal(a.direction,'credit');assert.equal(a.occurredAt,'2026-10-22T12:15:00');
});
test("ICICI reads the purchase, not the much larger available limit", () => {
  const a = parseAlert("credit_cards@icici.bank.in", "Transaction alert for your ICICI Bank Credit Card", card)!;
  assert.equal(a.amount, 34000); assert.equal(a.tail, "1234"); assert.equal(a.date, "2026-10-15");
  assert.equal(a.merchant, "ZOMATO"); assert.equal(a.reference, "123456789012"); assert.equal(a.categoryId, "dining");
  assert.equal(a.occurredAt, "2026-10-15T07:26:54"); assert.equal(a.timeSource, "bank");
});
test("HDFC UPI, credit card and debit card identities stay distinct", () => {
  for (const [instrument, text] of [
    ["bank", "Rs.219.00 is debited from your account ending 7900 towards VPA example@bank (Zomato) on 16-10-26. UPI transaction reference no.: 123456789012"],
    ["credit_card", "Rs. 4520.00 has been debited from your HDFC Bank Credit Card ending 7662 towards MYNTRA DESIGNS PRIVATE on 11 Oct, 2026 at 16:33:07 ."],
    ["debit_card", "Rs.159.00 is debited from your HDFC Bank Debit Card ending 5227 at GOOGLEPLAY on 17 Oct, 2026 at 10:06:41."],
  ]) assert.equal(parseAlert("HDFC <alerts@hdfcbank.bank.in>", "Transaction alert", text!)?.instrument, instrument);
});
test("HSBC and Axis extract transaction amounts rather than card balances", () => {
  const hsbc = parseAlert("hsbc@mail.hsbc.co.in", "Credit Card Transaction Alert", "Your HSBC Credit Card xx1234 was used for a transaction of INR 319.93 at UBER INDIA SYSTEMS on 19/09/26. Available limit: INR 537754.83 Amount due: INR 67245.17")!;
  assert.equal(hsbc.amount, 31993); assert.equal(hsbc.categoryId, "transport.cab");
  const axis = parseAlert("alerts@axis.bank.in", "INR 50 spent on credit card no. XX6031", "Transaction Amount: INR 50 Merchant Name: Eternal Lim Axis Bank Credit Card No. XX6031 Date &amp; Time: 05-10-2026, 22:57:38 IST Available Limit*: INR 174000")!;
  assert.equal(axis.amount, 5000); assert.equal(axis.date, "2026-10-05"); assert.equal(axis.categoryId, undefined);
  assert.equal(axis.occurredAt, "2026-10-05T22:57:38");
});
test("unknown senders, OTPs, statements and declined purchases never parse", () => {
  for (const subject of ["OTP for transaction", "Card statement", "Transaction declined", "Transaction failed", "Payment scheduled"]) assert.equal(parseAlert("credit_cards@icici.bank.in", subject, card), null);
  assert.equal(parseAlert("credit_cards@icici.bank.in.evil.example", "Transaction alert", card), null);
  assert.equal(parseAlert("credit_cards@icici.bank.in", "Transaction alert", card.replace("340.00", "340.005")), null);
  assert.equal(alertDate("31/02/26"), undefined);
});
test("income and unknown purpose wait for review", () => {
  const a = parseAlert("customernotification@icici.bank.in", "Transaction alert for your ICICI Bank account", "Your ICICI Bank Account XX159 has been credited with INR 37 on 30-Sep-26. Info: XX159:Int.Pd:30-06-2026 to 29-09-2026. NEVER SHARE your details.")!;
  assert.equal(a.direction, "credit"); assert.equal(a.amount, 3700); assert.equal(a.date, "2026-09-30");
  assert.ok(automaticReason({ ...a, accountId: "bank" }, true, "2026-09-01"));
});
test("matching never mistakes debit card suffix for a bank account", () => {
  const a: Alert = { bank: "HDFC", instrument: "bank", tail: "7900", amount: 100, date: "2026-10-10", merchant: "Zomato", direction: "debit" };
  const accounts = [{ id: "bank", name: "HDFC", type: "BANK", hint: "7900", isActive: true }] as Account[];
  assert.equal(accountForAlert(a, accounts, {}), "bank");
  assert.equal(accountForAlert({ ...a, instrument: "debit_card" }, accounts, {}), undefined);
  assert.equal(accountForAlert({ ...a, instrument: "debit_card" }, accounts, { "HDFC:debit_card:7900": "bank" }), "bank");
  assert.equal(accountForAlert({ ...a, tail: "900" }, accounts, {}), undefined);
  assert.equal(accountForAlert(a, [...accounts, { ...accounts[0]!, id: "other" }], {}), undefined);
});
test("Google sender authentication must align with an allowed bank", () => {
  const part = { headers: [{ name: "From", value: "HSBC <hsbc@mail.hsbc.co.in>" }, { name: "Authentication-Results", value: "mx.google.com; dkim=pass; dmarc=pass (p=REJECT) header.from=hsbc.co.in" }] };
  assert.equal(authenticatedSender(part), true);
  part.headers[1]!.value = "mx.google.com; dmarc=pass header.from=evil.example";
  assert.equal(authenticatedSender(part), false);
  part.headers[1]!.value = "evil.example; dmarc=pass header.from=hsbc.co.in";
  assert.equal(authenticatedSender(part), false);
});
test("MIME alternatives are not duplicated and attachments are excluded", () => {
  const part = (mimeType: string, text: string) => ({ mimeType, body: { data: Buffer.from(text).toString("base64url") } });
  assert.equal(mailText({ mimeType: "multipart/alternative", parts: [part("text/html", "<p>same alert</p>"), part("text/plain", "same alert")] }), "same alert");
  assert.equal(mailText({ ...part("text/plain", "attachment"), filename: "private.txt" }), "");
});
