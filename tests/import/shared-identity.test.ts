import assert from "node:assert/strict";
import test from "node:test";
import { bankReference, normalizeBankReference, possibleExistingTransactions, sourceDigest } from "@/lib/import/identity";
import { buildImportDrafts } from "@/lib/import/build-drafts";
import { expense, income, transfer, at } from "../helpers/factories";

test("only explicit bank-reference contexts identify an event", () => {
  assert.equal(bankReference("phone 9991234567 VPA 9876543210@upi account 123456789012"), undefined);
  assert.equal(bankReference("Gmail bank alert; reference 0000123456789012"), "123456789012");
  assert.equal(bankReference("UPI/123456789012/PERSON"), "123456789012");
  assert.equal(bankReference("UPI/P2A/123456789012/PERSON"), "123456789012");
  assert.equal(normalizeBankReference("  icicr9202610012345 "), "ICICR9202610012345");
  assert.equal(normalizeBankReference("None"), undefined);
  assert.equal(normalizeBankReference("00000000000000"), undefined);
  assert.equal(normalizeBankReference("000000001234"), undefined);
});

test("weak matching respects direction, transfer endpoints and proven distinct references", () => {
  const outgoing = expense({ accountId: "bank", amount: 20000, date: at("2026-10-12"), notes: "reference: 123456789012" });
  const incoming = income({ accountId: "bank", amount: 20000, date: outgoing.date });
  const move = transfer({ accountId: "other", toAccountId: "bank", amount: 20000, date: outgoing.date });
  assert.deepEqual(possibleExistingTransactions([outgoing, incoming, move], "bank", 20000, "2026-10-12", "debit").map(t => t.id), [outgoing.id]);
  assert.deepEqual(possibleExistingTransactions([outgoing, incoming, move], "bank", 20000, "2026-10-12", "credit").map(t => t.id), [incoming.id, move.id]);
  assert.deepEqual(possibleExistingTransactions([outgoing], "bank", 20000, "2026-10-12", "debit", "999999999999"), []);
  assert.deepEqual(possibleExistingTransactions([outgoing], "bank", 20000, "2026-10-16", "debit"), []);
});

test("equal-value groups remain multiple candidates; matching never invents a pairing", () => {
  const rows = [expense({ accountId: "bank", amount: 20000, date: at("2026-10-12") }), expense({ accountId: "bank", amount: 20000, date: at("2026-10-12") })];
  assert.equal(possibleExistingTransactions(rows, "bank", 20000, "2026-10-12", "debit").length, 2);
});

test("a credit is not flagged as an existing debit and a distinct reference stays separate", () => {
  const existing = expense({ accountId: "bank", amount: 20000, date: at("2026-10-12"), description: "Person", notes: "reference: 123456789012" });
  const drafts = buildImportDrafts([{ date: "2026-10-12", withdrawal: 0, deposit: 20000, narration: "Person" },
    { date: "2026-10-12", withdrawal: 20000, deposit: 0, narration: "Person", reference: "999999999999" }], "bank", [existing], []);
  assert.deepEqual(drafts.map(d => d.isLikelyDuplicate), [false, false]);
  assert.deepEqual(drafts.map(d => d.possibleMatchIds), [[], []]);
});

test("source digest is stable and sensitive to file/row/account identities", async () => {
  assert.equal(await sourceDigest("same source"), await sourceDigest("same source"));
  assert.notEqual(await sourceDigest("user|account-a|file:row1"), await sourceDigest("user|account-b|file:row1"));
  assert.notEqual(await sourceDigest("user|account-a|file:row1"), await sourceDigest("user|account-a|file:row2"));
});
