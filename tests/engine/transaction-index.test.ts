import assert from 'node:assert/strict';
import test from 'node:test';
import { transactionIndex } from '@/lib/engine/transaction-index';
import { expense, income, makeAccount, rs } from '../helpers/factories';

test('row lookup preserves original cash, personal share and every received contribution', () => {
  const account = makeAccount();
  const purchase = expense({ accountId: account.id, amount: rs(1000) });
  const received = income({ accountId: account.id, amount: rs(400) });
  const other = income({ accountId: account.id, amount: rs(300) });
  const links = [received, other].map(t => ({ id: `link-${t.id}`, kind: 'CONTRIBUTION' as const, incomeId: t.id, expenseId: purchase.id, amount: t.amount, createdAt: t.createdAt }));
  const index = transactionIndex([purchase, received, other], [{ ...purchase, amount: rs(300) }], [account], links);
  assert.equal(index.originalById.get(purchase.id), purchase);
  assert.equal(index.personalById.get(purchase.id)?.amount, rs(300));
  assert.equal(index.accountsById.get(account.id), account);
  assert.deepEqual(index.linksByTransactionId.get(purchase.id), links);
  assert.deepEqual(index.linksByTransactionId.get(received.id), [links[0]]);
  assert.equal(index.personalById.get(other.id), undefined);
  assert.equal(index.linksByTransactionId.get('unlinked'), undefined);
  assert.deepEqual(transactionIndex([], [], []).linksByTransactionId.size, 0);
});
