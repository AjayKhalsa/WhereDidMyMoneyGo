import test from 'node:test';
import assert from 'node:assert/strict';
import { dataQuality } from '@/lib/engine/data-quality';
import { expense, makeAccount } from '../helpers/factories';
import type { Database } from '@/lib/domain/types';
import { createEmptyDatabase } from '@/lib/data/seed';
import { ledgerFingerprint } from '@/lib/engine/reconciliation';
test('coverage separates uncategorized money and verified clocks from estimates and non-expenses', () => {
    const db = { accounts: [makeAccount()], categories: [{ id: 'dining' }], transactions: [
            expense({ amount: 100, categoryId: 'other', date: '2026-10-10T00:00:00' }),
            expense({ amount: 200, categoryId: 'deleted', date: '2026-10-10T12:00:00', timing: { source: 'logged', precision: 'estimated', timezone: 'Asia/Kolkata' } }),
            expense({ categoryId: 'dining', date: '2026-10-10T13:00:00', timing: { source: 'bank', precision: 'exact', timezone: 'Asia/Kolkata' } }),
            expense({ categoryId: 'adjustment', date: '2026-10-10T00:00:00' }),
            expense({ categoryId: 'other', date: '2027-01-01T00:00:00' }),
        ] } as Database;
    const q = dataQuality(db, '2026-10-28');
    assert.equal(q.expenses, 3);
    assert.equal(q.uncategorized, 2);
    assert.equal(q.uncategorizedAmount, 300);
    assert.equal(q.verifiedTimes, 1);
    assert.equal(q.unknownOrEstimatedTimes, 2);
    assert.equal(q.accounts[0]?.status, 'unverified');
});

test('dated account coverage becomes stale after a historical financial edit', () => {
    const db = createEmptyDatabase();
    const account = makeAccount({ openingBalance: 10000 });
    db.accounts = [account];
    db.transactions = [expense({ accountId: account.id, amount: 2000, date: '2026-10-10T00:00:00' })];
    account.reconciliation = {
        asOf: '2026-10-10', balance: 8000, source: 'Bank statement',
        recordedAt: '2026-10-11T00:00:00', status: 'verified',
        fingerprint: ledgerFingerprint(account, db.transactions, '2026-10-10'),
    };
    const initial = dataQuality(db, '2026-10-28');
    assert.equal(initial.accounts[0]?.status, 'verified');
    assert.equal(initial.accounts[0]?.asOf, '2026-10-10');
    // Later transactions do not invalidate the earlier dated checkpoint.
    db.transactions.push(expense({ accountId: account.id, amount: 3000, date: '2026-10-12T00:00:00' }));
    assert.equal(dataQuality(db, '2026-10-28').accounts[0]?.status, 'verified');
    db.transactions[0]!.amount = 2500;
    assert.equal(dataQuality(db, '2026-10-28').accounts[0]?.status, 'stale');
});
