import type {Account, Transaction} from '@/lib/domain/types';
import {isCategoryActivity, spendingAttribution} from './spending';

export type PaymentSource = 'card' | 'bank' | 'cash' | 'unknown';
export interface PaymentSourceSlice {
  source: PaymentSource;
  outgoing: number;
  returned: number;
  net: number;
  transactions: Transaction[];
}
export function paymentSource(account: Account | undefined): PaymentSource {
  return account?.type === 'CREDIT_CARD' ? 'card' : account?.type === 'BANK' ? 'bank' : account?.type === 'CASH' ? 'cash' : 'unknown';
}
/** Same activity/attribution as category net outflows. Never infer a payment
 * account from a merchant, or count a card repayment as another purchase. */
export function categoryPaymentSources(rows: Transaction[], all: Transaction[], accounts: Account[], groupFor: (id: string) => string) {
  const byAccount = new Map(accounts.map(a => [a.id, a]));
  const metadata = spendingAttribution(all);
  const result = new Map<string, PaymentSourceSlice[]>();
  for (const original of rows) {
    const t = metadata(original);
    if (!isCategoryActivity(t)) continue;
    const group = groupFor(t.categoryId ?? 'other');
    const source = paymentSource(byAccount.get(t.accountId ?? ''));
    const sources = result.get(group) ?? [];
    const slice = sources.find(s => s.source === source) ?? {source, outgoing: 0, returned: 0, net: 0, transactions: []};
    if (!sources.includes(slice)) sources.push(slice);
    if (t.type === 'EXPENSE') slice.outgoing += t.amount;
    else slice.returned += t.amount;
    slice.net = slice.outgoing - slice.returned;
    slice.transactions.push(original);
    result.set(group, sources);
  }
  return result;
}
