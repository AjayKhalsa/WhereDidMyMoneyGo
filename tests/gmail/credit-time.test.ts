import assert from "node:assert/strict";
import test from "node:test";
import { parseAlert, automaticReason } from "@/lib/gmail/alerts";
import { alertTime } from "@/lib/gmail/alert-time";

const subject = "View: Account update for your HDFC Bank A/c";
const incoming = "Dear Customer, Greetings from HDFC Bank! We're writing to inform you that Rs.2500.00 has been successfully credited to your HDFC Bank account ending in 1234. Transaction Details: a. Date: 15-10-26 b. Sender: EXAMPLE PERSON (VPA: example@okaxis) c. UPI Reference No.: 123456789012 Need Help?";
test("HDFC incoming UPI account update extracts credit and reference, not earned income", () => {
  const a = parseAlert("alerts@hdfcbank.bank.in", subject, incoming)!;
  assert.equal(a.amount,250000);assert.equal(a.tail,"1234");assert.equal(a.date,"2026-10-15");
  assert.equal(a.direction,"credit");assert.equal(a.paymentRail,"UPI");assert.equal(a.reference,"123456789012");
  assert.equal(a.vpa,"example@okaxis");assert.equal(a.creditKind,"unknown");assert.equal(a.timeSource,"unknown");
  assert.match(automaticReason({...a,accountId:"bank"},true,"2026-09-01")!,/income.*refund.*transfer/);
});
test("same HDFC subject never implies money movement", () => {
  for(const body of ["Your payment for Google Play - Content Purchase Services is scheduled.","You have successfully read secure usage guidelines.", incoming.replace("successfully credited","pending credit"),incoming.replace("2500.00","2500.001")])assert.equal(parseAlert("alerts@hdfcbank.bank.in",subject,body),null);
  assert.equal(parseAlert("attacker@example.com",subject,incoming),null);
});
test("HDFC deposit reads amount received, preserves narration and does not mistake masked references", () => {
  const body="You have received a credit in your HDFC Bank account. Details of the transaction: Amount received: INR 12,345.67 Account: XX1234 Date: 25-SEP-2026 Reference Details: NEFT Cr-BANK0000123-SAL SEP 26 EXAMPLE EMPLOYER-INXXXXXXXXXX1234 Available Balance: INR 9,99,999.99";
  const a=parseAlert("alerts@hdfcbank.net","New Deposit Alert",body)!;
  assert.equal(a.amount,1234567);assert.equal(a.date,"2026-09-25");assert.equal(a.direction,"credit");assert.equal(a.creditKind,"income");assert.equal(a.paymentRail,"NEFT");assert.equal(a.reference,undefined);
});
test("bank clock outranks Gmail delivery and normalizes UTC into IST", () => {
  const body="Rs.340.00 is debited from your HDFC Bank Credit Card ending 1234 towards ZOMATO on 15 Oct, 2026 at 22:03:04.";
  const a=parseAlert("alerts@hdfcbank.bank.in","Transaction alert",body,Date.parse("2026-10-16T02:00:00Z"))!;
  assert.equal(a.occurredAt,"2026-10-15T22:03:04");assert.equal(a.timeSource,"bank");assert.equal(a.timeConfidence,"exact");
  const utc=parseAlert("alerts@hdfcbank.bank.in","Transaction alert",body.replace("22:03:04.","22:03:04 UTC."))!;
  assert.equal(utc.occurredAt,"2026-10-16T03:33:04");assert.equal(utc.date,"2026-10-16");
});
test("bank dates survive delayed Gmail fallback, midnight is not invented", () => {
  const a=parseAlert("alerts@hdfcbank.bank.in",subject,incoming,Date.parse("2026-10-16T01:05:00Z"))!;
  assert.equal(a.date,"2026-10-15");assert.equal(a.occurredAt,"2026-10-16T06:35:00");assert.equal(a.timeSource,"gmail");assert.equal(a.timeConfidence,"fallback");
  assert.deepEqual(alertTime("on 15-10-26","15-10-26","2026-10-15"),{timeSource:"unknown",timeConfidence:"unknown"});
});
test("payment clocks are second choice, 12-hour clocks and invalid clocks are handled", () => {
  assert.equal(alertTime("on 15-10-26 Payment Time: 12:01 AM IST","15-10-26","2026-10-15").occurredAt,"2026-10-15T00:01:00");
  assert.equal(alertTime("on 15-10-26 at 12:01 PM IST","15-10-26","2026-10-15").occurredAt,"2026-10-15T12:01:00");
  assert.equal(alertTime("on 15-10-26 at 24:01:00","15-10-26","2026-10-15").timeSource,"unknown");
});
