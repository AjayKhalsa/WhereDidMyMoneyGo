import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceAt, balanceVerification, ledgerFingerprint } from '@/lib/engine/reconciliation';
import { monthTotals, summariseCreditCard } from '@/lib/engine/analytics';
import { budgetPerformance } from '@/lib/engine/budgets';
import { createEmptyDatabase } from '@/lib/data/seed';
import { at, expense, income, makeAccount, makeCard, makeCardDetail, rs, transfer } from '../helpers/factories';

test('historical card reconciliation clears the old residue without hiding current spending or changing bank cash', () => {
  const bank = makeAccount({ openingBalance: rs(5000) });
  const card = makeCard();
  const detail = makeCardDetail({ accountId: card.id, statementDay: 25, dueDay: 9 });
  const rows = [
    expense({ accountId: card.id, date: at('2026-10-20'), amount: rs(1000) }),
    transfer({ accountId: bank.id, toAccountId: card.id, date: at('2026-10-26'), amount: rs(900) }),
    expense({ accountId: card.id, date: at('2026-11-03'), amount: rs(500), categoryId: 'dining' }),
  ];
  const correction = income({ accountId: card.id, date: at('2026-10-24'), categoryId: 'adjustment', amount: rs(100), isRefund: true });
  const corrected = [...rows, correction];
  const now = new Date(2026, 10, 19, 12);
  const before = createEmptyDatabase();before.accounts = [bank, card];before.creditCards = [detail];before.transactions = rows;
  const after = { ...before, transactions: corrected };
  assert.equal(balanceAt(card, rows, '2026-11-19'), rs(600));
  assert.equal(balanceAt(card, corrected, '2026-11-19'), rs(500));
  assert.equal(balanceAt(bank, corrected, '2026-11-19'), balanceAt(bank, rows, '2026-11-19'));
  assert.deepEqual(monthTotals(rows, '2026-10-01'), monthTotals(corrected, '2026-10-01'));
  assert.deepEqual(budgetPerformance(before, '2026-10-01', now), budgetPerformance(after, '2026-10-01', now));
  const summary = summariseCreditCard(card, detail, corrected, now);
  assert.equal(summary.currentCycle.spent, rs(500));
  assert.equal(summary.lastStatement?.paidInFull, true);
  const checkpoint = { ...card, reconciliation: { balance: rs(500), asOf: '2026-11-19', recordedAt: now.toISOString(), source: 'Account holder confirmation', status: 'verified' as const, fingerprint: ledgerFingerprint(card, corrected, '2026-11-19') } };
  assert.equal(balanceVerification(checkpoint, corrected).status, 'verified');
  const lateCharge = expense({ accountId: card.id, date: at('2026-10-22'), amount: rs(50) });
  assert.equal(balanceVerification(checkpoint, [...corrected, lateCharge]).status, 'stale');
  assert.equal(summariseCreditCard(card, detail, [...corrected, expense({ accountId: card.id, date: at('2026-11-20'), amount: rs(75) })], new Date(2026, 10, 21)).outstanding, rs(575));
});
