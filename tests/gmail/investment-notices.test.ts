import test from "node:test";
import assert from "node:assert/strict";
import { authenticatedSender, automaticReason, financialSendersQuery, isInvestmentDebit, parseAlert } from "@/lib/gmail/alerts";
import { investmentNoticeReason, parseInvestmentNotice } from "@/lib/gmail/investment-notices";

const allocation = "Mutual fund units have been allocated to your portfolio. SCHEME NAME Example Equity Fund Direct Growth SIP AMOUNT ₹9,999.50 UNITS ALLOCATED 50.125 NAV 199.4913 ORDER ID GME261026EXAMPLE000001 VIEW ORDER";

test("allocation evidence retains net value and order identity without inventing bank cash or dates", () => {
  const notice = parseInvestmentNotice("Groww <noreply@groww.in>", "SIP: Units allocated", allocation)!;
  assert.equal(notice.kind, "investment-allocation");
  assert.equal(notice.netAmount, 999950);
  assert.equal(notice.orderId, "GME261026EXAMPLE000001");
  assert.equal(notice.scheduledAmount, undefined);
  assert.equal(notice.dueDate, undefined, "Order-number digits are not proof of debit date");
  assert.equal(notice.bank, undefined);
  assert.equal(notice.tail, undefined);
  assert.match(investmentNoticeReason(notice), /bank debit/);
  assert.equal(parseAlert("noreply@groww.in", "SIP: Units allocated", allocation), null);
});

test("SIP reminders retain expected amount/account but cannot establish a successful payment", () => {
  const body = "SCHEME NAME Example Fund SIP AMOUNT ₹10,000.00 DUE DATE 26 Oct’26 BANK ICICI BANK LIMITED BANK ACCOUNT NO. 999999991234 For smooth investment, please ensure your bank balance is ready for the payment.";
  const notice = parseInvestmentNotice("noreply@groww.in", "SIP: Instalment due in 2 days", body)!;
  assert.equal(notice.kind, "investment-schedule");
  assert.equal(notice.scheduledAmount, 1000000);
  assert.equal(notice.dueDate, "2026-10-26");
  assert.equal(notice.tail, "1234");
  assert.equal(notice.netAmount, undefined);
  assert.match(investmentNoticeReason(notice), /does not confirm a debit/);
  assert.equal(parseAlert("noreply@groww.in", "SIP: Instalment due in 2 days", body), null);
});

test("purchase confirmations are corroborating allocation evidence, not another bank debit", () => {
  const notice = parseInvestmentNotice("mfservice@kfintech.com", "Mutual Fund – Purchase Confirmation", "We have processed your purchase request for Rs. 9999.50 in Example Fund - Direct Plan Growth. Accordingly 50.125 units have been allotted as per applicable NAV of 26/10/2026 for Rs. 199.4913 per unit.")!;
  assert.equal(notice.netAmount, 999950);
  assert.equal(notice.provider, "KFintech");
  assert.equal(notice.scheduledAmount, undefined);
});

test("supported subjects are discovered and aligned authentication is required", () => {
  const query = financialSendersQuery();
  assert.match(query, /from:noreply@groww.in/);
  assert.match(query, /subject:"SIP: Units allocated"/);
  assert.match(query, /from:mfservice@kfintech.com subject:"Purchase Confirmation"/);
  const headers = [{ name: "From", value: "noreply@groww.in" }, { name: "Authentication-Results", value: "mx.google.com; dmarc=pass header.from=groww.in" }];
  assert.equal(authenticatedSender({ headers }), true);
  assert.equal(authenticatedSender({ headers: [headers[0]!, { name: "Authentication-Results", value: "mx.google.com; dmarc=pass header.from=spoof.example" }] }), false);
  assert.equal(parseInvestmentNotice("attacker@example.com", "SIP: Units allocated", allocation), null);
  assert.equal(parseInvestmentNotice("noreply@groww.in", "SIP failed", allocation), null);
  assert.equal(parseInvestmentNotice("noreply@groww.in", "SIP: Units allocated", allocation.replace("9,999.50", "9,999.501")), null);
  assert.equal(parseInvestmentNotice("noreply@groww.in", "SIP: Units allocated", allocation.replace("50.125", "0")), null);
});

test("Groww bank debits remain financial-purpose review instead of becoming expenses", () => {
  const debit = parseAlert("customernotification@icici.bank.in", "Debit alert", "Your bank account XX1234 has been debited with INR 10000.00 on 26-Oct-2026. Info: ACH/Groww Pay Services P/EXAMPLE. NEVER share your OTP.")!;
  assert.ok(debit);
  assert.equal(debit.amount, 1000000);
  assert.equal(debit.special, true);
  assert.equal(isInvestmentDebit(debit), true);
  assert.match(automaticReason({ ...debit, accountId: "bank", categoryId: "other" }, true, "2026-10-01")!, /Investment-related bank debit/);
  assert.equal(isInvestmentDebit({ ...debit, direction: "credit" }), false);
});
