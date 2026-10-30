import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseRepository } from "@/lib/data/supabase-adapter";
import { accountBalance } from "@/lib/engine/analytics";

function repository(failSecondPage = false) {
  const transactions = Array.from({ length: 1251 }, (_, i) => ({
    id: `txn_${String(i).padStart(4, "0")}`, user_id: "test-user",
    type: i === 1250 ? "INCOME" : "EXPENSE", amount: i === 1250 ? 500000 : 100,
    account_id: "bank", date: "2026-10-10T00:00:00", category_id: "other",
    description: "Manual description", notes: "Manual note", source: "manual",
  }));
  const rows: Record<string, Record<string, unknown>[]> = {
    transactions,
    accounts: [{ id: "bank", type: "BANK", opening_balance: 200000, is_active: true }],
    transaction_contexts: transactions.map(t => ({ transaction_id: t.id, type: "PURPOSE", value: "work" })),
    rule_contexts: [{ rule_id: "rule", type: "PURPOSE", value: "work" }],
    rules: [{ id: "rule", pattern: "my payee", category_id: "transport.auto" }],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } }, error: null }) },
    from(table: string) {
      const keys: string[] = [];
      const query = {
        select(_fields: string, options?: { count: string }) {
          if (table !== "profiles") assert.equal(options?.count, "exact");
          return query;
        },
        eq(column: string, value: string) {
          assert.equal(column, table === "profiles" ? "id" : "user_id");
          assert.equal(value, "test-user");
          return query;
        },
        order(key: string, options: { ascending: boolean }) {
          assert.equal(options.ascending, true); keys.push(key); return query;
        },
        maybeSingle: async () => ({ data: { id: "test-user" }, error: null }),
        range: async (from: number, to: number) => {
          assert.deepEqual(keys, table === "transaction_contexts" ? ["transaction_id", "type", "value"]
            : table === "rule_contexts" ? ["rule_id", "type", "value"] : ["id"]);
          const data = rows[table] ?? [];
          return {
            data: data.slice(from, Math.min(to + 1, from + 200)), count: data.length,
            error: failSecondPage && table === "transactions" && from > 0 ? { message: "Network error" } : null,
          };
        },
      };
      return query;
    },
  };
  // Inject a read-only client at the repository boundary; no network credentials.
  const repo = Object.create(SupabaseRepository.prototype) as SupabaseRepository;
  Object.defineProperty(repo, "client", { value: client });
  return repo;
}

test("repository loads all ledger/context pages with stable ordering and user scope", async () => {
  const db = await repository().load();
  assert.ok(db);
  assert.equal(db.transactions.length, 1251);
  assert.equal(accountBalance(db.accounts[0]!, db.transactions), 575000);
  assert.ok(db.transactions.every(t => t.notes === "Manual note" && t.description === "Manual description"));
  assert.ok(db.transactions.every(t => t.contexts[0]?.value === "work"));
  assert.equal(db.rules[0]?.contexts[0]?.value, "work");
});

test("repository rejects a failed later page instead of returning partial financial data", async () => {
  await assert.rejects(repository(true).load(), /could not be loaded completely/);
});

 test("authentication failure does not look like an empty unseeded ledger", async () => {
  const repo = Object.create(SupabaseRepository.prototype) as SupabaseRepository;
  Object.defineProperty(repo, "client", { value: {
    auth: { getUser: async () => ({ data: { user: null }, error: { message: "Expired session" } }) },
  } });
  await assert.rejects(repo.load(), /session could not be verified/);
});
