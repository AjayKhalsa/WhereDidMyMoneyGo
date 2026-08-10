import type { Database, TransactionContext, UserProfile } from "@/lib/domain/types";
import { getSupabaseBrowserClient } from "./supabase-client";
import {
  RepositoryError,
  type CollectionMap,
  type CollectionName,
  type Repository,
} from "./repository";

/**
 * Postgres/Supabase implementation of `Repository`.
 *
 * Runs entirely client-side — this is the browser-side counterpart to the
 * server-side auth gate in `middleware.ts`. RLS on every table (see
 * `supabase/migrations/0001_init.sql`) is what actually keeps one user's
 * financial rows out of another's reach; this class just shapes queries.
 *
 * `Transaction.contexts` and `ClassificationRule.contexts` are the only
 * array-valued fields in the domain model, so they're the only two that need
 * a child table (`transaction_contexts`, `rule_contexts`) joined back on.
 * Everything else is a mechanical camelCase <-> snake_case column mapping.
 */

const TABLE_NAMES: Record<CollectionName, string> = {
  accounts: "accounts",
  creditCards: "credit_cards",
  categories: "categories",
  transactions: "transactions",
  recurring: "recurring",
  goals: "goals",
  investments: "investments",
  incomeSources: "income_sources",
  rules: "rules",
  people: "people",
  splits: "splits",
};

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const snake = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    out[snake] = value;
  }
  return out;
}

function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out;
}

/** Strips `contexts` before writing the parent row — it lives in its own table. */
function toRow(item: Record<string, unknown>): Record<string, unknown> {
  const { contexts: _contexts, ...rest } = item;
  return toSnakeCase(rest);
}

function fromRow<T>(row: Record<string, unknown>): T {
  return toCamelCase(row) as T;
}

function groupContexts(
  rows: { transaction_id?: string; rule_id?: string; type: string; value: string }[],
  key: "transaction_id" | "rule_id",
): Map<string, TransactionContext[]> {
  const map = new Map<string, TransactionContext[]>();
  for (const row of rows) {
    const id = row[key];
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push({ type: row.type as TransactionContext["type"], value: row.value });
    map.set(id, list);
  }
  return map;
}

function wrap<T>(operation: string, work: () => Promise<T>): Promise<T> {
  return work().catch((cause) => {
    throw new RepositoryError(`Supabase request failed during ${operation}`, cause);
  });
}

function assertNoError(operation: string, error: { message: string } | null): void {
  if (error) throw new RepositoryError(`Supabase request failed during ${operation}: ${error.message}`);
}

export class SupabaseRepository implements Repository {
  private client = getSupabaseBrowserClient();

  private async requireUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) {
      throw new RepositoryError("Not signed in", error);
    }
    return data.user.id;
  }

  async load(): Promise<Database | null> {
    return wrap("load", async () => {
      const { data: userData, error: userError } = await this.client.auth.getUser();
      if (userError || !userData.user) return null;
      const userId = userData.user.id;

      const [
        profileRes,
        accountsRes,
        creditCardsRes,
        categoriesRes,
        transactionsRes,
        transactionContextsRes,
        recurringRes,
        goalsRes,
        investmentsRes,
        incomeSourcesRes,
        rulesRes,
        ruleContextsRes,
        peopleRes,
        splitsRes,
      ] = await Promise.all([
        this.client.from("profiles").select("*").eq("id", userId).maybeSingle(),
        this.client.from("accounts").select("*").eq("user_id", userId),
        this.client.from("credit_cards").select("*").eq("user_id", userId),
        this.client.from("categories").select("*").eq("user_id", userId),
        this.client.from("transactions").select("*").eq("user_id", userId),
        this.client.from("transaction_contexts").select("*").eq("user_id", userId),
        this.client.from("recurring").select("*").eq("user_id", userId),
        this.client.from("goals").select("*").eq("user_id", userId),
        this.client.from("investments").select("*").eq("user_id", userId),
        this.client.from("income_sources").select("*").eq("user_id", userId),
        this.client.from("rules").select("*").eq("user_id", userId),
        this.client.from("rule_contexts").select("*").eq("user_id", userId),
        this.client.from("people").select("*").eq("user_id", userId),
        this.client.from("splits").select("*").eq("user_id", userId),
      ]);

      for (const [name, res] of Object.entries({
        profile: profileRes,
        accounts: accountsRes,
        creditCards: creditCardsRes,
        categories: categoriesRes,
        transactions: transactionsRes,
        transactionContexts: transactionContextsRes,
        recurring: recurringRes,
        goals: goalsRes,
        investments: investmentsRes,
        incomeSources: incomeSourcesRes,
        rules: rulesRes,
        ruleContexts: ruleContextsRes,
        people: peopleRes,
        splits: splitsRes,
      })) {
        assertNoError(`load:${name}`, res.error);
      }

      // No profile row yet means this authenticated user has never been
      // seeded — same "never seeded" contract LocalRepository uses, so
      // initStore() seeds an empty database and writes it back.
      if (!profileRes.data) return null;

      const contextsByTxId = groupContexts(
        (transactionContextsRes.data ?? []) as { transaction_id: string; type: string; value: string }[],
        "transaction_id",
      );
      const contextsByRuleId = groupContexts(
        (ruleContextsRes.data ?? []) as { rule_id: string; type: string; value: string }[],
        "rule_id",
      );

      const transactions = (transactionsRes.data ?? []).map((row) => {
        const t = fromRow<Database["transactions"][number]>(row);
        t.contexts = contextsByTxId.get(t.id) ?? [];
        return t;
      });
      const rules = (rulesRes.data ?? []).map((row) => {
        const r = fromRow<Database["rules"][number]>(row);
        r.contexts = contextsByRuleId.get(r.id) ?? [];
        return r;
      });

      return {
        profile: fromRow<UserProfile>(profileRes.data),
        accounts: (accountsRes.data ?? []).map((r) => fromRow(r)),
        creditCards: (creditCardsRes.data ?? []).map((r) => fromRow(r)),
        categories: (categoriesRes.data ?? []).map((r) => fromRow(r)),
        transactions,
        recurring: (recurringRes.data ?? []).map((r) => fromRow(r)),
        goals: (goalsRes.data ?? []).map((r) => fromRow(r)),
        investments: (investmentsRes.data ?? []).map((r) => fromRow(r)),
        incomeSources: (incomeSourcesRes.data ?? []).map((r) => fromRow(r)),
        rules,
        people: (peopleRes.data ?? []).map((r) => fromRow(r)),
        splits: (splitsRes.data ?? []).map((r) => fromRow(r)),
      } as Database;
    });
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    return wrap("saveProfile", async () => {
      const userId = await this.requireUserId();
      const { id: _id, ...rest } = profile;
      const { error } = await this.client
        .from("profiles")
        .upsert({ id: userId, ...toSnakeCase(rest) });
      assertNoError("saveProfile", error);
    });
  }

  /** Replaces the context join rows for one transaction/rule. */
  private async writeContexts(
    table: "transaction_contexts" | "rule_contexts",
    fkColumn: "transaction_id" | "rule_id",
    fkValue: string,
    userId: string,
    contexts: TransactionContext[],
  ): Promise<void> {
    const del = await this.client.from(table).delete().eq(fkColumn, fkValue).eq("user_id", userId);
    assertNoError(`writeContexts:${table}:delete`, del.error);
    if (contexts.length === 0) return;
    const rows = contexts.map((c) => ({
      [fkColumn]: fkValue,
      user_id: userId,
      type: c.type,
      value: c.value,
    }));
    const ins = await this.client.from(table).insert(rows);
    assertNoError(`writeContexts:${table}:insert`, ins.error);
  }

  private async putOne<K extends CollectionName>(
    collection: K,
    row: CollectionMap[K],
    userId: string,
  ): Promise<void> {
    const table = TABLE_NAMES[collection];
    const { error } = await this.client
      .from(table)
      .upsert({ ...toRow(row as unknown as Record<string, unknown>), user_id: userId });
    assertNoError(`put:${collection}`, error);

    if (collection === "transactions") {
      const t = row as unknown as Database["transactions"][number];
      await this.writeContexts("transaction_contexts", "transaction_id", t.id, userId, t.contexts);
    } else if (collection === "rules") {
      const r = row as unknown as Database["rules"][number];
      await this.writeContexts("rule_contexts", "rule_id", r.id, userId, r.contexts);
    }
  }

  async put<K extends CollectionName>(collection: K, row: CollectionMap[K]): Promise<void> {
    return wrap(`put:${collection}`, async () => {
      const userId = await this.requireUserId();
      await this.putOne(collection, row, userId);
    });
  }

  async putMany<K extends CollectionName>(collection: K, rows: CollectionMap[K][]): Promise<void> {
    if (rows.length === 0) return;
    return wrap(`putMany:${collection}`, async () => {
      const userId = await this.requireUserId();
      for (const row of rows) await this.putOne(collection, row, userId);
    });
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    return wrap(`remove:${collection}`, async () => {
      const userId = await this.requireUserId();
      const { error } = await this.client
        .from(TABLE_NAMES[collection])
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      assertNoError(`remove:${collection}`, error);
    });
  }

  async removeMany(collection: CollectionName, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    return wrap(`removeMany:${collection}`, async () => {
      const userId = await this.requireUserId();
      const { error } = await this.client
        .from(TABLE_NAMES[collection])
        .delete()
        .in("id", ids)
        .eq("user_id", userId);
      assertNoError(`removeMany:${collection}`, error);
    });
  }

  async replaceAll(db: Database): Promise<void> {
    return wrap("replaceAll", async () => {
      const userId = await this.requireUserId();
      await this.clearForUser(userId);

      await this.saveProfile(db.profile);
      // Parents before children, so FKs never point at a row that isn't there
      // yet. `goals` moved here (ahead of transactions) because transactions
      // can now carry a goal_id FK (0009_add_goal_contribution_link.sql).
      for (const collection of [
        "accounts",
        "categories",
        "investments",
        "recurring",
        "goals",
      ] as const) {
        for (const row of db[collection]) await this.putOne(collection, row as never, userId);
      }
      // reverses_transaction_id (0008_add_refund_fields.sql) is a
      // self-referencing FK on transactions — a refund row can point at an
      // expense row that hasn't been upserted yet in id order. Two passes:
      // first every transaction with that field omitted, then a second pass
      // that fills it in once every row it could point to already exists.
      for (const row of db.transactions) {
        await this.putOne(
          "transactions",
          { ...row, reversesTransactionId: undefined },
          userId,
        );
      }
      for (const row of db.transactions) {
        if (row.reversesTransactionId) {
          await this.putOne("transactions", row, userId);
        }
      }
      for (const row of db.rules) await this.putOne("rules", row, userId);
      for (const collection of [
        "creditCards",
        "incomeSources",
        "people",
      ] as const) {
        for (const row of db[collection]) await this.putOne(collection, row as never, userId);
      }
      // Splits reference both transactions and people, so they go last.
      for (const row of db.splits) await this.putOne("splits", row, userId);
    });
  }

  private async clearForUser(userId: string): Promise<void> {
    // Children before parents — explicit rather than relying solely on
    // cascade, since some FKs (account_id, category_id on transactions) are
    // `on delete set null`, not cascade.
    const order: (CollectionName | "transaction_contexts" | "rule_contexts")[] = [
      "splits",
      "transaction_contexts",
      "rule_contexts",
      "transactions",
      "rules",
      "recurring",
      "creditCards",
      "people",
      "accounts",
      "categories",
      "investments",
      "incomeSources",
      "goals",
    ];
    for (const entry of order) {
      const table =
        entry === "transaction_contexts" || entry === "rule_contexts"
          ? entry
          : TABLE_NAMES[entry];
      const { error } = await this.client.from(table).delete().eq("user_id", userId);
      assertNoError(`clear:${table}`, error);
    }
    const { error } = await this.client.from("profiles").delete().eq("id", userId);
    assertNoError("clear:profiles", error);
  }

  async clear(): Promise<void> {
    return wrap("clear", async () => {
      const userId = await this.requireUserId();
      await this.clearForUser(userId);
    });
  }
}
