import test from "node:test";
import assert from "node:assert/strict";
import { statementEvidence, STATEMENT_QUERY } from "@/lib/gmail/statement-evidence";
import type { MailPart } from "@/lib/gmail/alerts";
const make = (from = "statements@hdfcbank.net", auth = "mx.google.com; dmarc=pass header.from=hdfcbank.net"): MailPart => ({
  mimeType: "multipart/mixed", headers: [{ name: "From", value: from }, { name: "Subject", value: "Your credit card statement" }, { name: "Authentication-Results", value: auth }],
  parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Card ending 1234. Total amount due INR 1200.00. https://bank.example/private?token=secret").toString("base64url") } },
    { filename: "statement.pdf", mimeType: "application/pdf", body: { data: "private-binary" } }],
});
test("statements use a separate query and retain authenticated evidence without creating financial events", () => {
  assert.ok(STATEMENT_QUERY.includes("subject:statement")); assert.ok(!STATEMENT_QUERY.includes("-subject:statement"));
  const evidence = statementEvidence(make(), String(Date.parse("2026-11-13T12:00:00Z")));
  assert.equal(evidence?.bank, "HDFC"); assert.equal(evidence?.attachments[0]?.name, "statement.pdf");
  assert.ok(evidence?.body_text.includes("[link]")); assert.ok(!evidence?.body_text.includes("token=secret"));
  assert.ok(!evidence?.body_text.includes("private-binary")); assert.equal("amount" in evidence!, false);
});
test("spoofed domains, unaligned authentication and invalid timestamps cannot provide balance evidence", () => {
  const time = String(Date.now());
  assert.equal(statementEvidence(make("statements@hdfcbank.net.attacker.example"), time), undefined);
  assert.equal(statementEvidence(make(undefined, "mx.attacker.example; dmarc=pass header.from=hdfcbank.net"), time), undefined);
  assert.equal(statementEvidence(make(undefined, "mx.google.com; dmarc=fail header.from=hdfcbank.net"), time), undefined);
  assert.equal(statementEvidence(make(), "invalid"), undefined);
});
