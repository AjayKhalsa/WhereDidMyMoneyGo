import type { Account, MoneyLink, Transaction } from "@/lib/domain/types";

/** Build once per ledger revision, rather than scanning history for every row. */
export function transactionIndex(
  transactions: Transaction[],
  personalTransactions: Transaction[],
  accounts: Account[],
  links: MoneyLink[] = [],
) {
  const linksByTransactionId = new Map<string, MoneyLink[]>();
  for (const link of links) {
    for (const id of new Set([link.incomeId, link.expenseId])) {
      if (!id) continue;
      const existing = linksByTransactionId.get(id);
      if (existing) existing.push(link);
      else linksByTransactionId.set(id, [link]);
    }
  }
  return {
    originalById: new Map(transactions.map(t => [t.id, t])),
    personalById: new Map(personalTransactions.map(t => [t.id, t])),
    accountsById: new Map(accounts.map(a => [a.id, a])),
    linksByTransactionId,
  };
}
