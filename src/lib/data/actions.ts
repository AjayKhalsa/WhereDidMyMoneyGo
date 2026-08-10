import { derivedContexts, normaliseContexts } from "@/lib/domain/contexts";
import { toLocalISO } from "@/lib/domain/dates";
import type {
  Account,
  ClassificationRule,
  CreditCardDetail,
  Goal,
  IncomeSource,
  Investment,
  Paise,
  Person,
  RecurringTransaction,
  Split,
  Transaction,
  TransactionContext,
  TransactionType,
  UserProfile,
} from "@/lib/domain/types";
import { learnFromEntry } from "@/lib/engine/learning";
import { createId } from "@/lib/utils";
import {
  applyBatch,
  getSnapshot,
  putRow,
  putRows,
  removeRow,
  saveProfile,
} from "./store";

/**
 * Every write the app can perform.
 *
 * Components call these; they never touch the store directly. Keeping
 * mutations here is what guarantees the invariants hold no matter which
 * screen triggered the change — most importantly that paying a credit card
 * creates a TRANSFER and never an expense.
 */

export interface TransactionDraft {
  type: TransactionType;
  amount: Paise;
  description: string;
  date: Date;
  categoryId?: string;
  contexts: TransactionContext[];
  accountId?: string;
  toAccountId?: string;
  merchant?: string;
  investmentId?: string;
  goalId?: string;
  isRefund?: boolean;
  reversesTransactionId?: string;
  notes?: string;
  source?: Transaction["source"];
}

/**
 * Normalises a draft into a stored transaction.
 *
 * Weekend and late-night contexts are recomputed from the timestamp rather
 * than trusted from the caller, so changing a transaction's date keeps them
 * honest instead of leaving a Tuesday dinner tagged "weekend".
 */
function materialise(
  draft: TransactionDraft,
  existing?: Transaction,
): Transaction {
  const iso = toLocalISO(draft.date);
  const now = new Date().toISOString();
  const source = draft.source ?? existing?.source ?? "manual";
  const authored = draft.contexts.filter(
    (c) => c.value !== "weekend" && c.value !== "late-night",
  );
  // Bank statements give a date, never a real time — an imported row's
  // timestamp defaults to local midnight, which would otherwise derive a
  // spurious "late night" on every single import. Weekend is at least
  // derived from a real calendar date, but without a real time backing it
  // up either, imports skip both rather than guess.
  const derived = source === "imported" ? [] : derivedContexts(iso);
  const contexts = normaliseContexts([...authored, ...derived]);

  // Only expenses carry a category; a card payment has no "category". INCOME
  // already keeps whatever categoryId was set (unused by plain income, but
  // it's what lets a refund net against the same bucket the original spend
  // landed in).
  const categoryId = draft.type === "TRANSFER" ? undefined : draft.categoryId;

  return {
    id: existing?.id ?? createId("txn"),
    type: draft.type,
    amount: Math.max(0, Math.round(draft.amount)),
    description: draft.description.trim(),
    date: iso,
    merchant: draft.merchant?.trim() || undefined,
    accountId: draft.accountId,
    toAccountId: draft.type === "TRANSFER" ? draft.toAccountId : undefined,
    categoryId,
    contexts,
    investmentId: draft.type === "INVESTMENT" ? draft.investmentId : undefined,
    goalId: draft.type === "TRANSFER" ? draft.goalId : undefined,
    isRefund: draft.type === "INCOME" ? draft.isRefund || undefined : undefined,
    reversesTransactionId:
      draft.type === "INCOME" ? draft.reversesTransactionId : undefined,
    notes: draft.notes?.trim() || undefined,
    recurringId: existing?.recurringId,
    source,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export interface SaveOptions {
  /** The parser rule that produced this entry, if any. */
  matchedRuleId?: string;
  /** True when the user changed what the parser proposed. */
  wasCorrected?: boolean;
  /** Set false to skip writing a classification rule (e.g. bulk edits). */
  learn?: boolean;
}

export async function addTransaction(
  draft: TransactionDraft,
  options: SaveOptions = {},
): Promise<Transaction> {
  const transaction = materialise(draft);
  const rules: ClassificationRule[] = [];

  // Only expenses teach the classifier anything useful.
  if (options.learn !== false && transaction.type === "EXPENSE" && transaction.categoryId) {
    const existing = getSnapshot().data?.rules ?? [];
    rules.push(
      ...learnFromEntry(
        {
          description: transaction.description,
          categoryId: transaction.categoryId,
          contexts: transaction.contexts,
          merchant: transaction.merchant,
          accountId: transaction.accountId,
          matchedRuleId: options.matchedRuleId,
          wasCorrected: options.wasCorrected ?? false,
        },
        existing,
      ),
    );
  }

  await applyBatch({
    puts: { transactions: [transaction], ...(rules.length ? { rules } : {}) },
  });
  return transaction;
}

export interface ImportRowInput {
  draft: TransactionDraft;
  /** True when the user edited what the parser guessed for this row. */
  wasCorrected: boolean;
  matchedRuleId?: string;
}

/**
 * Bulk-commits reviewed statement-import rows in one write.
 *
 * Learning is deliberately narrower than `addTransaction`'s: a batch import
 * can be dozens of rows the user never individually confirmed, so only rows
 * they actually corrected in the review screen teach the classifier —
 * otherwise a single statement would seed a pile of rules from raw bank
 * narration noise the user never looked at twice.
 */
export async function importTransactions(
  rows: ImportRowInput[],
): Promise<Transaction[]> {
  const baseRules = getSnapshot().data?.rules ?? [];
  let learnedRules: ClassificationRule[] = [];
  const transactions: Transaction[] = [];

  for (const row of rows) {
    const transaction = materialise({
      ...row.draft,
      source: row.draft.source ?? "imported",
    });
    transactions.push(transaction);

    if (row.wasCorrected && transaction.type === "EXPENSE" && transaction.categoryId) {
      learnedRules = [
        ...learnedRules,
        ...learnFromEntry(
          {
            description: transaction.description,
            categoryId: transaction.categoryId,
            contexts: transaction.contexts,
            merchant: transaction.merchant,
            accountId: transaction.accountId,
            matchedRuleId: row.matchedRuleId,
            wasCorrected: true,
          },
          [...baseRules, ...learnedRules],
        ),
      ];
    }
  }

  await applyBatch({
    puts: {
      transactions,
      ...(learnedRules.length ? { rules: learnedRules } : {}),
    },
  });
  return transactions;
}

export async function updateTransaction(
  id: string,
  draft: TransactionDraft,
  options: SaveOptions = {},
): Promise<Transaction> {
  const existing = getSnapshot().data?.transactions.find((t) => t.id === id);
  if (!existing) throw new Error("That transaction no longer exists");

  const transaction = materialise(draft, existing);
  const rules: ClassificationRule[] = [];

  // A category change on an existing row is the strongest correction signal
  // we ever get — the user went back specifically to fix it.
  const categoryChanged = existing.categoryId !== transaction.categoryId;
  if (
    options.learn !== false &&
    transaction.type === "EXPENSE" &&
    transaction.categoryId &&
    categoryChanged
  ) {
    rules.push(
      ...learnFromEntry(
        {
          description: transaction.description,
          categoryId: transaction.categoryId,
          contexts: transaction.contexts,
          merchant: transaction.merchant,
          accountId: transaction.accountId,
          wasCorrected: true,
        },
        getSnapshot().data?.rules ?? [],
      ),
    );
  }

  await applyBatch({
    puts: { transactions: [transaction], ...(rules.length ? { rules } : {}) },
  });
  return transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = getSnapshot().data;
  // Detach any refund pointing at this row rather than leaving a dangling
  // reference — the refund itself is still real money and stays.
  const orphaned = (db?.transactions ?? [])
    .filter((t) => t.reversesTransactionId === id)
    .map((t) => ({
      ...t,
      reversesTransactionId: undefined,
      updatedAt: new Date().toISOString(),
    }));
  await applyBatch({
    puts: orphaned.length ? { transactions: orphaned } : {},
    deletes: { transactions: [id] },
  });
}

/**
 * Records a credit-card payment (spec §17).
 *
 * This is the single most important correctness rule in the product: the
 * payment is a TRANSFER from a bank account to the card. The ₹24,680 leaving
 * your bank is not new spending — it is settling dining, shopping and cab
 * expenses that were each recorded when they happened. Creating an expense
 * here would double-count every one of them.
 */
export async function payCreditCard(params: {
  cardAccountId: string;
  fromAccountId: string;
  amount: Paise;
  date?: Date;
}): Promise<Transaction> {
  return addTransaction(
    {
      type: "TRANSFER",
      amount: params.amount,
      description: "Credit card payment",
      date: params.date ?? new Date(),
      accountId: params.fromAccountId,
      toAccountId: params.cardAccountId,
      contexts: [],
    },
    { learn: false },
  );
}

/** Records an investment contribution. Never counted as spending. */
export async function addInvestmentContribution(params: {
  investmentId: string;
  amount: Paise;
  fromAccountId?: string;
  date?: Date;
  description?: string;
}): Promise<Transaction> {
  const investment = getSnapshot().data?.investments.find(
    (i) => i.id === params.investmentId,
  );
  return addTransaction(
    {
      type: "INVESTMENT",
      amount: params.amount,
      description: params.description ?? investment?.name ?? "Investment",
      date: params.date ?? new Date(),
      accountId: params.fromAccountId,
      investmentId: params.investmentId,
      contexts: [],
    },
    { learn: false },
  );
}

export async function addIncome(params: {
  amount: Paise;
  description: string;
  accountId?: string;
  date?: Date;
  categoryId?: string;
  isRefund?: boolean;
  reversesTransactionId?: string;
}): Promise<Transaction> {
  return addTransaction(
    {
      type: "INCOME",
      amount: params.amount,
      description: params.description,
      date: params.date ?? new Date(),
      accountId: params.accountId,
      categoryId: params.categoryId,
      isRefund: params.isRefund,
      reversesTransactionId: params.reversesTransactionId,
      contexts: [],
    },
    { learn: false },
  );
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export async function saveAccount(account: Account): Promise<void> {
  if (account.isDefault) {
    const db = getSnapshot().data;
    const others = (db?.accounts ?? []).filter(
      (a) => a.id !== account.id && a.isDefault,
    );
    if (others.length > 0) {
      await applyBatch({
        puts: {
          accounts: [account, ...others.map((a) => ({ ...a, isDefault: false }))],
        },
      });
      return;
    }
  }
  await putRow("accounts", account);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getSnapshot().data;
  if (!db) return;
  // Detach transactions rather than deleting them — losing spending history
  // because a card was closed would be indefensible.
  const orphaned = db.transactions
    .filter((t) => t.accountId === id || t.toAccountId === id)
    .map((t) => ({
      ...t,
      accountId: t.accountId === id ? undefined : t.accountId,
      toAccountId: t.toAccountId === id ? undefined : t.toAccountId,
      updatedAt: new Date().toISOString(),
    }));
  const cardIds = db.creditCards.filter((c) => c.accountId === id).map((c) => c.id);

  await applyBatch({
    puts: orphaned.length ? { transactions: orphaned } : {},
    deletes: { accounts: [id], ...(cardIds.length ? { creditCards: cardIds } : {}) },
  });
}

/**
 * Records a manual reconciliation. `difference` is actual-minus-expected
 * balance (signed), computed by the caller from `accountBalance` — positive
 * means the account has more than tracked (recorded as INCOME), negative
 * means less (EXPENSE). Modelled as a real dated Transaction rather than a
 * silent `openingBalance` edit, matching how every other correction in this
 * app works (see `contributeToGoal`) — a raw field edit would leave no
 * record of when or why the number moved. Categorised under "adjustment", a
 * dedicated leaf distinct from UNCATEGORISED_ID, so it never reads as "the
 * parser had no idea" and never surfaces in the Needs-review filter.
 * Always stamps `lastReconciledAt`, since after this write the two numbers
 * agree.
 */
export async function recordBalanceAdjustment(params: {
  accountId: string;
  difference: Paise;
  date?: Date;
}): Promise<Transaction> {
  const account = getSnapshot().data?.accounts.find(
    (a) => a.id === params.accountId,
  );
  const transaction = materialise({
    type: params.difference > 0 ? "INCOME" : "EXPENSE",
    amount: Math.abs(params.difference),
    description: "Balance adjustment",
    date: params.date ?? new Date(),
    accountId: params.accountId,
    categoryId: "adjustment",
    contexts: [],
  });
  await applyBatch({
    puts: {
      transactions: [transaction],
      ...(account
        ? {
            accounts: [
              { ...account, lastReconciledAt: new Date().toISOString() },
            ],
          }
        : {}),
    },
  });
  return transaction;
}

/**
 * Records debt on a card that predates its transaction history — the card
 * equivalent of `recordBalanceAdjustment`. A card has no `openingBalance`
 * field (its outstanding is entirely derived from charge/payment
 * transactions), so there is no other way to represent "I already owe ₹X on
 * this card" without either importing every underlying charge or faking one.
 * Modelled the same way as the bank case: a real dated Transaction, not a
 * silent field. Positive `difference` means more is owed than the ledger
 * currently shows (an EXPENSE, same as any other charge); negative means the
 * ledger overcounts (an `isRefund` INCOME, the only way `cardActivity`
 * reduces a card's charged total).
 */
export async function recordCardStartingBalance(params: {
  cardAccountId: string;
  difference: Paise;
  date?: Date;
}): Promise<Transaction> {
  const account = getSnapshot().data?.accounts.find(
    (a) => a.id === params.cardAccountId,
  );
  const transaction = materialise({
    type: params.difference > 0 ? "EXPENSE" : "INCOME",
    amount: Math.abs(params.difference),
    description: "Starting balance",
    date: params.date ?? new Date(),
    accountId: params.cardAccountId,
    categoryId: "adjustment",
    contexts: [],
    isRefund: params.difference < 0 ? true : undefined,
  });
  await applyBatch({
    puts: {
      transactions: [transaction],
      ...(account
        ? {
            accounts: [
              { ...account, lastReconciledAt: new Date().toISOString() },
            ],
          }
        : {}),
    },
  });
  return transaction;
}

export async function saveCreditCardDetail(
  detail: CreditCardDetail,
): Promise<void> {
  await putRow("creditCards", detail);
}

export async function saveGoal(goal: Goal): Promise<void> {
  await putRow("goals", goal);
}

export async function deleteGoal(id: string): Promise<void> {
  const db = getSnapshot().data;
  // Detach contribution transactions rather than deleting them — the money
  // really left the account, so that history stays real even if the goal
  // it was earmarked for goes away.
  const orphaned = (db?.transactions ?? [])
    .filter((t) => t.goalId === id)
    .map((t) => ({ ...t, goalId: undefined, updatedAt: new Date().toISOString() }));
  await applyBatch({
    puts: orphaned.length ? { transactions: orphaned } : {},
    deletes: { goals: [id] },
  });
}

export async function saveInvestment(investment: Investment): Promise<void> {
  await putRow("investments", investment);
}

export async function deleteInvestment(id: string): Promise<void> {
  await removeRow("investments", id);
}

export async function saveIncomeSource(source: IncomeSource): Promise<void> {
  await putRow("incomeSources", source);
}

export async function deleteIncomeSource(id: string): Promise<void> {
  await removeRow("incomeSources", id);
}

export async function saveRecurring(rule: RecurringTransaction): Promise<void> {
  await putRow("recurring", rule);
}

export async function deleteRecurring(id: string): Promise<void> {
  await removeRow("recurring", id);
}

export async function saveRule(rule: ClassificationRule): Promise<void> {
  await putRow("rules", rule);
}

export async function deleteRule(id: string): Promise<void> {
  await removeRow("rules", id);
}

// ---------------------------------------------------------------------------
// Split-expense (IOU) tracking
// ---------------------------------------------------------------------------

export async function savePerson(person: Person): Promise<void> {
  await putRow("people", person);
}

export async function deletePerson(id: string): Promise<void> {
  await removeRow("people", id);
}

export interface SplitInput {
  personId: string;
  direction: Split["direction"];
  amount: Paise;
}

/**
 * Records the side-ledger for a shared expense.
 *
 * Call this right after `addTransaction` resolves, once the transaction has
 * already been saved with the user's real share as its `amount` — this never
 * touches the transaction itself. One `Split` row per person, all
 * `OUTSTANDING`, so settling later is a status flip rather than a new write
 * path.
 */
export async function recordSplits(
  transactionId: string,
  splits: SplitInput[],
): Promise<void> {
  if (splits.length === 0) return;
  const now = new Date().toISOString();
  const rows: Split[] = splits.map((s) => ({
    id: createId("split"),
    transactionId,
    personId: s.personId,
    direction: s.direction,
    amount: s.amount,
    status: "OUTSTANDING",
    createdAt: now,
    updatedAt: now,
  }));
  await putRows("splits", rows);
}

/**
 * Marks an IOU as squared away. Never creates a transaction — no money is
 * "earned" or "spent" when a split settles, it just stops being owed.
 */
export async function settleSplit(id: string): Promise<void> {
  const split = getSnapshot().data?.splits.find((s) => s.id === id);
  if (!split) return;
  await putRow("splits", {
    ...split,
    status: "SETTLED",
    settledDate: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateProfile(
  changes: Partial<UserProfile>,
): Promise<void> {
  const current = getSnapshot().data?.profile;
  if (!current) return;
  await saveProfile({ ...current, ...changes });
}

/** Materialises a recurring rule as an actual charge for the current period. */
export async function markRecurringPaid(
  rule: RecurringTransaction,
  date = new Date(),
): Promise<Transaction> {
  const transaction: Transaction = {
    id: createId("txn"),
    type: rule.type,
    amount: rule.amount,
    description: rule.description,
    date: toLocalISO(date),
    merchant: rule.merchant,
    accountId: rule.accountId,
    categoryId: rule.type === "EXPENSE" ? rule.categoryId : undefined,
    contexts: derivedContexts(toLocalISO(date)),
    recurringId: rule.id,
    source: "recurring",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await putRow("transactions", transaction);
  return transaction;
}

/**
 * Moves real money into a goal's pot: a TRANSFER out of `fromAccountId`
 * (never spending — same "moved, not spent" treatment as a credit-card
 * payment), which also bumps the goal's `currentAmount`. Recorded as a
 * TRANSFER rather than an INVESTMENT so a goal sitting in a bank account
 * never pollutes `totals.invested`/the real investments list.
 */
export async function contributeToGoal(params: {
  goalId: string;
  amount: Paise;
  fromAccountId: string;
  date?: Date;
  description?: string;
}): Promise<Transaction> {
  const goal = getSnapshot().data?.goals.find((g) => g.id === params.goalId);
  const transaction = materialise({
    type: "TRANSFER",
    amount: params.amount,
    description: params.description ?? `${goal?.name ?? "Goal"} contribution`,
    date: params.date ?? new Date(),
    accountId: params.fromAccountId,
    goalId: params.goalId,
    contexts: [],
  });
  await applyBatch({
    puts: {
      transactions: [transaction],
      ...(goal
        ? {
            goals: [
              {
                ...goal,
                currentAmount: Math.max(0, goal.currentAmount + params.amount),
              },
            ],
          }
        : {}),
    },
  });
  return transaction;
}
