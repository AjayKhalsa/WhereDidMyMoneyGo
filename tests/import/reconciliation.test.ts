import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyDatabase } from "@/lib/data/seed";
import { parseReconciliation, previewReconciliation, saveReconciliation, type ReconciliationBundle } from "@/lib/import/reconciliation";
import type { Transaction } from "@/lib/domain/types";
import type { Repository } from "@/lib/data/repository";

function fixture() {
  const db = createEmptyDatabase("Test");
  db.accounts = [
    { id: "bank", name: "Bank", type: "BANK", openingBalance: 100000, isActive: true, createdAt: "2026-07-01" },
    { id: "card", name: "Card", type: "CREDIT_CARD", openingBalance: 0, isActive: true, createdAt: "2026-07-01" },
  ];
  const base = { date: "2026-07-10T12:00:00", contexts: [], source: "imported", createdAt: "2026-09-26", updatedAt: "2026-09-26" } as const;
  const rows: Transaction[] = [
    { ...base, id: "purchase", type: "EXPENSE", accountId: "card", description: "Shop", amount: 50000, categoryId: "shopping.other", contexts: [] },
    { ...base, id: "repayment", type: "TRANSFER", accountId: "bank", toAccountId: "card", description: "Payment", amount: 20000, contexts: [] },
    { ...base, id: "refund", type: "INCOME", accountId: "card", description: "Refund", amount: 5000, categoryId: "shopping.other", isRefund: true, reversesTransactionId: "purchase", contexts: [] },
  ];
  const bundle: ReconciliationBundle = {
    format: "budget-reconciliation-v1", profileId: db.profile.id, label: "July statements",
    changes: { transactions: rows.map((after) => ({ before: null, after })) },
    checkpoints: [{ accountId: "bank", asOf: "2026-07-31", balance: 80000 }, { accountId: "card", asOf: "2026-07-31", balance: 25000 }],
  };
  return { db, bundle };
}

test("transfers and refunds tally; repeat batches preserve IDs and are skipped", () => {
  const { db, bundle } = fixture();
  const first = previewReconciliation(db, parseReconciliation(JSON.parse(JSON.stringify(bundle))));
  assert.equal(first.added, 3);
  const retry = previewReconciliation(first.next, bundle);
  assert.equal(retry.added, 0);
  assert.equal(retry.alreadySaved, 3);
  assert.equal(retry.next.transactions.length, 3);
});

test("wrong closing balances, wrong account and stale edits are blocked", () => {
  const { db, bundle } = fixture();
  assert.throws(() => previewReconciliation(db, { ...bundle, profileId: "someone-else" }), /different account/);
  bundle.checkpoints[0]!.balance++;
  assert.throws(() => previewReconciliation(db, bundle), /does not tally/);
  bundle.checkpoints[0]!.balance--;
  db.transactions = [{ ...bundle.changes.transactions![0]!.after, description: "User changed this" }];
  assert.throws(() => previewReconciliation(db, bundle), /changed since/);
});

test("equal purchases with different source IDs are both preserved", () => {
  const { db, bundle } = fixture();
  bundle.changes.transactions!.push({ before: null, after: { ...bundle.changes.transactions![0]!.after, id: "second-real-purchase" } });
  bundle.checkpoints[1]!.balance += 50000;
  assert.equal(previewReconciliation(db, bundle).next.transactions.filter((t) => t.type === "EXPENSE").length, 2);
});

test("malformed money, unknown fields, missing transfer destinations and unchecked accounts fail", () => {
  const { db, bundle } = fixture();
  assert.throws(() => parseReconciliation({ ...bundle, changes: { ...bundle.changes, profile: {} } }), /unsupported/);
  const badMoney = structuredClone(bundle);
  badMoney.changes.transactions![0]!.after.amount = 0.1;
  assert.throws(() => parseReconciliation(badMoney), /Invalid transaction/);
  const badTransfer = structuredClone(bundle);
  delete badTransfer.changes.transactions![1]!.after.toAccountId;
  assert.throws(() => previewReconciliation(db, badTransfer), /two different accounts/);
  assert.throws(() => previewReconciliation(db, { ...bundle, checkpoints: [bundle.checkpoints[0]!] }), /Every affected/);
});

test("an interrupted import resumes without duplicates and verifies persisted data", async () => {
  const { db, bundle } = fixture();
  let saved = structuredClone(db), failOnce = true, puts = 0;
  const repo = {
    load: async () => structuredClone(saved),
    put: async (collection: string, row: Transaction) => {
      assert.equal(collection, "transactions");
      if (row.id === "repayment" && failOnce) { failOnce = false; throw new Error("Network interrupted"); }
      saved.transactions = [...saved.transactions.filter((t) => t.id !== row.id), structuredClone(row)];
      puts++;
    },
  } as unknown as Repository;
  await assert.rejects(saveReconciliation(repo, bundle), /Network interrupted/);
  assert.equal(saved.transactions.length, 1);
  saved = await saveReconciliation(repo, bundle);
  assert.equal(saved.transactions.length, 3);
  assert.equal(puts, 3);
  await saveReconciliation(repo, bundle);
  assert.equal(puts, 3);
});

test("new transaction tags can finish after a partial parent/context write", () => {
  const { db, bundle } = fixture();
  bundle.changes.transactions![0]!.after.contexts = [{ type: "ATTRIBUTE", value: "gift" }];
  db.transactions = [{ ...bundle.changes.transactions![0]!.after, contexts: [] }];
  assert.equal(previewReconciliation(db, bundle).updated, 1);
});

test("database timestamp, null and false normalization does not cause false conflicts", () => {
  const { db, bundle } = fixture();
  const imported = previewReconciliation(db, bundle).next;
  imported.transactions = imported.transactions.map((row) => ({
    ...row, createdAt: "2026-09-26T00:00:00+00:00", updatedAt: "2026-09-26T00:00:00+00:00",
    isRefund: row.isRefund ?? false,
  }));
  assert.equal(previewReconciliation(imported, bundle).alreadySaved, 3);
});

