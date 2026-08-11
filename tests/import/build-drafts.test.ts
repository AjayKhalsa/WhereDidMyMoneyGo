import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { buildImportDrafts } from "@/lib/import/build-drafts";
import type { StatementRow } from "@/lib/import/statement-row";

import { at, expense, makeAccount, makeRule, rs } from "../helpers/factories";

/**
 * Drafts are the last point a human sees an imported row before it becomes
 * real money. Two properties matter most: an already-imported row is flagged
 * rather than silently duplicated, and a transfer never arrives pre-filled
 * with a destination the statement could not possibly know.
 */

const account = makeAccount({ name: "HDFC" });

const row = (overrides: Partial<StatementRow> = {}): StatementRow => ({
  date: "2026-08-01",
  narration: "UPI-SWIGGY-SWIGGY@HDFC-123456789012",
  withdrawal: rs(450),
  deposit: 0,
  ...overrides,
});

describe("buildImportDrafts", () => {
  test("a withdrawal becomes an expense, a deposit becomes income", () => {
    const drafts = buildImportDrafts(
      [row(), row({ narration: "SALARY", withdrawal: 0, deposit: rs(250_000) })],
      account.id,
      [],
      [],
    );
    assert.equal(drafts[0]?.type, "EXPENSE");
    assert.equal(drafts[0]?.amount, rs(450));
    assert.equal(drafts[1]?.type, "INCOME");
    assert.equal(drafts[1]?.amount, rs(250_000));
  });

  test("only expenses carry a category", () => {
    const drafts = buildImportDrafts(
      [row(), row({ narration: "SALARY", withdrawal: 0, deposit: rs(250_000) })],
      account.id,
      [],
      [],
    );
    assert.ok(drafts[0]?.categoryId);
    assert.equal(drafts[1]?.categoryId, undefined);
  });

  test("the raw narration is kept for the review screen", () => {
    const drafts = buildImportDrafts([row()], account.id, [], []);
    assert.equal(drafts[0]?.rawNarration, row().narration);
    assert.notEqual(drafts[0]?.description, row().narration, "but the description is cleaned");
  });

  test("a card payment is typed as a transfer with no destination", () => {
    // A statement only ever shows money leaving this account, never where it
    // landed. Pre-filling a destination would debit the bank and credit
    // nothing, leaving the card's outstanding permanently overstated — so
    // the reviewer must supply it.
    const drafts = buildImportDrafts(
      [row({ narration: "CRED CLUB CREDIT CARD PAYMENT", withdrawal: rs(19_301) })],
      account.id,
      [],
      [],
    );
    assert.equal(drafts[0]?.type, "TRANSFER");
    assert.equal(drafts[0]?.toAccountId, undefined);
  });

  test("a card fee stays an expense rather than becoming a payment", () => {
    const drafts = buildImportDrafts(
      [row({ narration: "ANNUAL FEE-CREDIT CARD", withdrawal: rs(1500) })],
      account.id,
      [],
      [],
    );
    assert.equal(drafts[0]?.type, "EXPENSE");
  });

  test("a learned rule is applied and reported", () => {
    const rule = makeRule({ pattern: "swiggy", categoryId: "bills", confidence: 0.95 });
    const drafts = buildImportDrafts([row()], account.id, [], [rule]);
    assert.equal(drafts[0]?.categoryId, "bills");
    assert.equal(drafts[0]?.matchedRuleId, rule.id);
  });
});

describe("duplicate detection", () => {
  test("a row already imported is flagged", () => {
    const drafts = buildImportDrafts([row()], account.id, [], []);
    const existing = expense({
      accountId: account.id,
      amount: rs(450),
      description: drafts[0]!.description,
      date: at("2026-08-01"),
    });
    const second = buildImportDrafts([row()], account.id, [existing], []);
    assert.equal(second[0]?.isLikelyDuplicate, true);
  });

  test("a matching row on a different account is not a duplicate", () => {
    const other = makeAccount({ name: "ICICI" });
    const drafts = buildImportDrafts([row()], account.id, [], []);
    const existing = expense({
      accountId: other.id,
      amount: rs(450),
      description: drafts[0]!.description,
      date: at("2026-08-01"),
    });
    assert.equal(
      buildImportDrafts([row()], account.id, [existing], [])[0]?.isLikelyDuplicate,
      false,
    );
  });

  test("duplicates are counted, not blanket-matched", () => {
    // Two genuinely separate ₹150 payments to the same place on the same day
    // must not both be flagged just because one already exists.
    const drafts = buildImportDrafts([row(), row()], account.id, [], []);
    const existing = expense({
      accountId: account.id,
      amount: rs(450),
      description: drafts[0]!.description,
      date: at("2026-08-01"),
    });
    const both = buildImportDrafts([row(), row()], account.id, [existing], []);
    assert.deepEqual(both.map((d) => d.isLikelyDuplicate), [true, false]);
  });

  test("a different amount on the same day is not a duplicate", () => {
    const drafts = buildImportDrafts([row()], account.id, [], []);
    const existing = expense({
      accountId: account.id,
      amount: rs(500),
      description: drafts[0]!.description,
      date: at("2026-08-01"),
    });
    assert.equal(
      buildImportDrafts([row()], account.id, [existing], [])[0]?.isLikelyDuplicate,
      false,
    );
  });

  test("nothing is flagged against an empty ledger", () => {
    const drafts = buildImportDrafts([row(), row({ date: "2026-08-02" })], account.id, [], []);
    assert.ok(drafts.every((d) => !d.isLikelyDuplicate));
  });
});
