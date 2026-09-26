import type { Database, Transaction } from "@/lib/domain/types";
import type { CollectionMap, Repository } from "@/lib/data/repository";
import { accountBalance, creditCardOutstanding, creditCardCreditBalance } from "@/lib/engine/analytics";

const COLLECTIONS = ["accounts", "creditCards", "investments", "transactions"] as const;
type Collection = typeof COLLECTIONS[number];
type Edit<K extends Collection> = { before: CollectionMap[K] | null; after: CollectionMap[K] };
export interface ReconciliationBundle {
  format: "budget-reconciliation-v1";
  profileId: string;
  label: string;
  changes: { [K in Collection]?: Edit<K>[] };
  checkpoints: { accountId: string; asOf: string; balance: number }[];
}

function fail(message: string): never { throw new Error(message); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected an object in the reconciliation file.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail("The reconciliation file contains unsupported fields.");
}
function string(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function money(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) && !Number.isNaN(Date.parse(value));
}
const FIELDS: Record<Collection, string[]> = {
  accounts: ["id", "name", "type", "openingBalance", "isActive", "hint", "isDefault", "createdAt", "lastReconciledAt"],
  creditCards: ["id", "accountId", "statementDay", "dueDay", "creditLimit"],
  investments: ["id", "name", "kind", "monthlyContribution", "isActive", "createdAt", "currentValue", "valuedAt"],
  transactions: ["id", "type", "amount", "description", "date", "merchant", "accountId", "toAccountId", "categoryId", "contexts", "investmentId", "goalId", "isRefund", "reversesTransactionId", "notes", "recurringId", "source", "createdAt", "updatedAt"],
};

function validateRow(collection: Collection, input: unknown) {
  const row = record(input);
  keys(row, FIELDS[collection]);
  if (!string(row.id)) fail("Every imported row needs a stable ID.");
  if (collection === "accounts") {
    if (!string(row.name) || !["BANK", "CASH", "CREDIT_CARD", "INVESTMENT"].includes(String(row.type)) ||
        !money(row.openingBalance) || typeof row.isActive !== "boolean" || !date(row.createdAt)) fail("Invalid account.");
    if (row.type === "CREDIT_CARD" && row.openingBalance !== 0) fail("Card opening debt must be recorded as a transaction.");
  } else if (collection === "creditCards") {
    if (!string(row.accountId) || !money(row.creditLimit) || row.creditLimit < 0 ||
        ![row.statementDay, row.dueDay].every((day) => money(day) && day >= 1 && day <= 31)) fail("Invalid card details.");
  } else if (collection === "investments") {
    if (!string(row.name) || !["PPF", "MUTUAL_FUND", "FD", "STOCKS", "NPS", "GOLD", "OTHER"].includes(String(row.kind)) ||
        !money(row.monthlyContribution) || row.monthlyContribution < 0 || typeof row.isActive !== "boolean" || !date(row.createdAt)) fail("Invalid investment.");
    if (row.currentValue !== undefined && (!money(row.currentValue) || row.currentValue < 0)) fail("Invalid investment value.");
  } else {
    if (!["EXPENSE", "INCOME", "TRANSFER", "INVESTMENT"].includes(String(row.type)) ||
        !money(row.amount) || row.amount <= 0 || !string(row.description) || !date(row.date) ||
        !date(row.createdAt) || !date(row.updatedAt) || !["manual", "parsed", "recurring", "seed", "imported"].includes(String(row.source))) fail("Invalid transaction.");
    if (!Array.isArray(row.contexts)) fail("Transaction tags must be a list.");
    for (const value of row.contexts) {
      const context = record(value);
      keys(context, ["type", "value"]);
      if (!["PEOPLE", "PURPOSE", "OCCASION", "ATTRIBUTE"].includes(String(context.type)) || !string(context.value)) fail("Invalid transaction tag.");
    }
    if (row.isRefund !== undefined && typeof row.isRefund !== "boolean") fail("Invalid refund flag.");
    if (row.isRefund && row.type !== "INCOME") fail("Only a credit can be a refund.");
    if (row.reversesTransactionId && !row.isRefund) fail("A linked refund must be marked as a refund.");
    if (row.toAccountId && !["TRANSFER", "INVESTMENT"].includes(String(row.type))) fail("Only transfers and investments can have a destination.");
  }
  for (const field of ["accountId", "toAccountId", "categoryId", "investmentId", "goalId", "recurringId", "reversesTransactionId"]) {
    if (row[field] !== undefined && row[field] !== null && !string(row[field])) fail(`Invalid ${field}.`);
  }
  for (const field of ["name", "description", "merchant", "notes", "hint"]) {
    if (row[field] !== undefined && row[field] !== null && typeof row[field] !== "string") fail(`Invalid ${field}.`);
  }
  for (const field of ["lastReconciledAt", "valuedAt"]) {
    if (row[field] !== undefined && row[field] !== null && !date(row[field])) fail(`Invalid ${field}.`);
  }
  if (row.isDefault !== undefined && row.isDefault !== null && typeof row.isDefault !== "boolean") fail("Invalid default account flag.");
}

export function parseReconciliation(input: unknown): ReconciliationBundle {
  const value = record(input);
  keys(value, ["format", "profileId", "label", "changes", "checkpoints"]);
  if (value.format !== "budget-reconciliation-v1" || !string(value.profileId) || !string(value.label)) fail("This is not a prepared reconciliation file.");
  const changes = record(value.changes);
  keys(changes, [...COLLECTIONS]);
  for (const collection of COLLECTIONS) {
    if (changes[collection] === undefined) continue;
    const edits = changes[collection];
    if (!Array.isArray(edits) || edits.length > 10000) fail("Invalid reconciliation size.");
    const ids = new Set<string>();
    for (const input of edits) {
      const edit = record(input);
      keys(edit, ["before", "after"]);
      validateRow(collection, edit.after);
      const id = record(edit.after).id as string;
      if (ids.has(id)) fail("Duplicate row IDs in reconciliation.");
      ids.add(id);
      if (edit.before !== null) {
        validateRow(collection, edit.before);
        if (record(edit.before).id !== id) fail("An edit cannot change a row's ID.");
      }
    }
  }
  if (!Array.isArray(value.checkpoints) || value.checkpoints.length === 0) fail("A reconciliation needs at least one balance check.");
  for (const input of value.checkpoints) {
    const check = record(input);
    keys(check, ["accountId", "asOf", "balance"]);
    if (!string(check.accountId) || !date(check.asOf) || String(check.asOf).length !== 10 || !money(check.balance)) fail("Invalid balance check.");
  }
  return value as unknown as ReconciliationBundle;
}

/** Ignore JSON key ordering and adapter-produced nulls on optional fields. */
function canonical(value: unknown, field?: string): string {
  if (["createdAt", "updatedAt", "lastReconciledAt", "valuedAt", "date"].includes(field ?? "") && typeof value === "string" && date(value)) {
    return JSON.stringify(new Date(value).toISOString());
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).sort().join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([k, v]) => k !== "userId" && v !== null && v !== undefined && !(v === false && ["isRefund", "isDefault"].includes(k))).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v, k)}`).join(",")}}`;
  return JSON.stringify(value);
}
function equal(a: unknown, b: unknown) { return canonical(a) === canonical(b); }

export function previewReconciliation(db: Database, bundle: ReconciliationBundle) {
  if (db.profile.id !== bundle.profileId) fail("This file was prepared for a different account.");
  const next = { ...db };
  let added = 0, updated = 0, alreadySaved = 0;
  for (const collection of COLLECTIONS) {
    const rows = new Map<string, CollectionMap[Collection]>(db[collection].map((row) => [row.id, row]));
    for (const edit of bundle.changes[collection] ?? []) {
      const current = rows.get(edit.after.id) ?? null;
      if (equal(current, edit.after)) { alreadySaved++; continue; }
      // Contexts use a child table. Retry a partially saved new parent row,
      // but never silently override edits made to an existing transaction.
      const partialNewTransaction = collection === "transactions" && edit.before === null && current &&
        equal({ ...current, contexts: [] }, { ...edit.after, contexts: [] }) &&
        (current as Transaction).contexts.every((c) => (edit.after as Transaction).contexts.some((a) => equal(c, a)));
      if (!equal(current, edit.before) && !partialNewTransaction) fail(`“${collection === "transactions" ? (edit.after as Transaction).description : edit.after.id}” changed since this file was prepared. Export fresh data before continuing.`);
      if (current) updated++; else added++;
      rows.set(edit.after.id, edit.after);
    }
    (next as unknown as Record<string, unknown>)[collection] = [...rows.values()];
  }
  const accounts = new Map(next.accounts.map((a) => [a.id, a]));
  const categories = new Set(next.categories.map((c) => c.id));
  const transactions = new Map(next.transactions.map((t) => [t.id, t]));
  for (const { after: t } of bundle.changes.transactions ?? []) {
    if (!t.accountId || !accounts.has(t.accountId)) fail("Transaction account is missing.");
    if (t.type === "TRANSFER" && (!t.toAccountId || t.toAccountId === t.accountId)) fail("Transfers need two different accounts.");
    if (t.toAccountId && !accounts.has(t.toAccountId)) fail("Destination account is missing.");
    if (t.type === "EXPENSE" && !t.categoryId) fail("Expenses need a category.");
    if (t.categoryId && !categories.has(t.categoryId)) fail("Transaction category is missing.");
    if (t.investmentId && !next.investments.some((i) => i.id === t.investmentId)) fail("Investment is missing.");
    if (t.goalId && !next.goals.some((g) => g.id === t.goalId)) fail("Goal is missing.");
    if (t.recurringId && !next.recurring.some((r) => r.id === t.recurringId)) fail("Recurring rule is missing.");
    if (t.reversesTransactionId) {
      const original = transactions.get(t.reversesTransactionId);
      if (!original || original.type !== "EXPENSE") fail("Refund points to a missing expense.");
    }
  }
  for (const { after: card } of bundle.changes.creditCards ?? []) {
    if (accounts.get(card.accountId)?.type !== "CREDIT_CARD") fail("Card details need a credit-card account.");
  }
  const checks = bundle.checkpoints.map((check) => {
    const account = accounts.get(check.accountId);
    if (!account) fail("Balance check account is missing.");
    const through = next.transactions.filter((t) => t.date.slice(0, 10) <= check.asOf);
    const calculated = account.type === "CREDIT_CARD"
      ? creditCardOutstanding(through, account.id) - creditCardCreditBalance(through, account.id)
      : accountBalance(account, through);
    if (calculated !== check.balance) fail(`${account.name} does not tally on ${check.asOf}: difference ₹${((calculated - check.balance) / 100).toFixed(2)}.`);
    return { ...check, name: account.name, calculated };
  });
  const touched = new Set((bundle.changes.accounts ?? []).map((edit) => edit.after.id));
  for (const { before, after } of bundle.changes.transactions ?? []) {
    for (const t of [before, after]) {
      if (t?.accountId) touched.add(t.accountId);
      if (t?.toAccountId) touched.add(t.toAccountId);
    }
  }
  for (const id of touched) {
    if (accounts.get(id)?.type !== "INVESTMENT" && !checks.some((check) => check.accountId === id)) fail("Every affected bank, cash and card account needs a closing balance check.");
  }
  return { next, added, updated, alreadySaved, checks };
}

/** ID-preserving writes make retries safe; never call replaceAll or delete. */
export async function saveReconciliation(repo: Repository, bundle: ReconciliationBundle, progress: (done: number, total: number) => void = () => {}) {
  const fresh = await repo.load();
  if (!fresh) fail("Your data could not be loaded.");
  previewReconciliation(fresh, bundle);
  const total = COLLECTIONS.reduce((sum, c) => sum + (bundle.changes[c]?.length ?? 0), 0);
  let done = 0;
  // Refund links must follow their referenced expenses.
  for (const collection of COLLECTIONS) {
    const edits = [...(bundle.changes[collection] ?? [])].sort((a, b) => Number(Boolean((a.after as Transaction).reversesTransactionId)) - Number(Boolean((b.after as Transaction).reversesTransactionId)));
    for (const edit of edits) {
      const existing = fresh[collection].find((row) => row.id === edit.after.id);
      if (!equal(existing, edit.after)) await repo.put(collection, edit.after);
      progress(++done, total);
    }
  }
  const saved = await repo.load();
  if (!saved) fail("The saved data could not be verified. Reload before retrying.");
  const verified = previewReconciliation(saved, bundle);
  if (verified.added || verified.updated) fail("Some rows were not saved completely. Reload and retry this same file.");
  return saved;
}
