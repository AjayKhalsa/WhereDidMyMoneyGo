import test from "node:test";
import assert from "node:assert/strict";
import { parseIssuerStatement, statementAccount } from "@/lib/gmail/statement-parser";

test("ICICI reads the actual cycle, full bill and due date without confusing minimum dues", () => {
  const s = parseIssuerStatement({ bank: "ICICI", subject: "ICICI Bank Credit Card Statement for the period October 9 2026 to November 8 2026",
    body_text: "Credit Card Statement Payment due by November 26, 2026 ICICI Bank Credit Card XX1234 Minimum Amount Due: ₹1,810.00 Total Amount Due: ₹36,005.22" });
  assert.equal(s.amount, 3600522); assert.equal(s.issuedOn, "2026-11-09"); assert.equal(s.dueOn, "2026-11-26");
  assert.equal(s.tail, "1234"); assert.equal(s.periodEnd, "2026-11-08");
});
test("CRED bill evidence identifies the underlying bank, card and explicit generation date", () => {
  const s = parseIssuerStatement({ bank: "CRED", subject: "New smart statement for your HDFC Bank card XXXX-5678",
    body_text: "Your credit card bill has been generated HDFC Bank •••• 5678 bill summary total amount due ₹1,959.00 minimum due ₹200.00 due date December 03, 2026 bill generated on Nov 12, 2026" });
  assert.equal(s.bank, "HDFC"); assert.equal(s.tail, "5678"); assert.equal(s.amount, 195900);
  assert.equal(s.issuedOn, "2026-11-12"); assert.equal(s.dueOn, "2026-12-03");
});
test("encrypted issuer attachments can establish a date but never an invented bill", () => {
  const s = parseIssuerStatement({ bank: "HSBC", subject: "Your HSBC Credit Card statement (HSBC TRAVELONE CREDIT CARD)", body_text: "Your monthly statement is attached and password protected.", attachments: [{ name: "Most Important Terms & Conditions.pdf" }, { name: "20261025.pdf" }] });
  assert.equal(s.issuedOn, "2026-10-25"); assert.equal(s.amount, undefined); assert.equal(s.dueOn, undefined);
  const h = parseIssuerStatement({ bank: "HDFC", subject: "Your Diners Privilege Credit Card Statement", body_text: "Attached", attachments: [{ name: "0036XXXX64_13-11-2026_143.pdf" }] });
  assert.equal(h.issuedOn, "2026-11-13"); assert.equal(h.amount, undefined);
});
test("ambiguous totals, account statements and unmatched card tails cannot overwrite a card bill", () => {
  assert.equal(parseIssuerStatement({ bank: "ICICI", subject: "Credit card statement", body_text: "Minimum Amount Due: ₹200.00 Credit Limit INR 100000" }).amount, undefined);
  assert.equal(parseIssuerStatement({ bank: "ICICI", subject: "Credit card statement", body_text: "Total Amount Due: ₹200.00 Total Amount Due: ₹300.00" }).amount, undefined);
  assert.equal(parseIssuerStatement({ bank: "HDFC", subject: "Email Account Statement", body_text: "Total INR 200.00" }).kind, "bank_statement");
  const accounts = [{ id: "card", name: "HDFC Diners", type: "CREDIT_CARD" as const, isActive: true, hint: "5678" }];
  assert.equal(statementAccount({ kind: "card_statement", bank: "HDFC", tail: "1111" }, accounts, {}), undefined);
  assert.equal(statementAccount({ kind: "card_statement", bank: "HDFC", tail: "1111" }, accounts, { "HDFC:credit_card:1111": "card" }), "card");
  assert.equal(statementAccount({ kind: "card_statement", bank: "HDFC" }, [...accounts, { ...accounts[0]!, id: "another" }], {}), undefined);
});
