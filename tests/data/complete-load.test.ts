import test from 'node:test';
import assert from 'node:assert/strict';
import { completeLoad } from '@/lib/data/complete-load';
import { accountBalance } from '@/lib/engine/analytics';
import { expense, income, makeAccount } from '../helpers/factories';
test('loads more than 1000 financial rows including when server caps pages below requested size', async () => {
    const source = Array.from({ length: 1251 }, (_, i) => ({ id: String(i), amount: 100 }));
    const result = await completeLoad(async (from, to) => ({ data: source.slice(from, Math.min(to + 1, from + 200)), count: source.length, error: null }), r => r.id);
    assert.equal(result.data.length, 1251);
    assert.equal(result.data.reduce((n, r) => n + r.amount, 0), 125100);
});
test('short, failed, duplicate and changing-count pages never produce partial balances', async () => {
    for (const mode of ['short', 'failed', 'duplicate', 'changed', 'no-count']) {
        let calls = 0;
        await assert.rejects(completeLoad(async () => {
            calls++;
            return calls === 1 ? { data: [{ id: 'one' }], count: 2, error: null } : { data: mode === 'short' ? [] : [{ id: mode === 'duplicate' ? 'one' : 'two' }], count: mode === 'changed' ? 3 : mode === 'no-count' ? null : 2, error: mode === 'failed' ? { message: 'private upstream detail' } : null };
        }, r => r.id));
    }
});
test('empty collections and composite context identities are preserved', async () => {
    assert.equal((await completeLoad(async () => ({ data: [], count: 0, error: null }), () => '')).data.length, 0);
    const rows = [{ id: 'same', type: 'PURPOSE', value: 'work' }, { id: 'same', type: 'PEOPLE', value: 'friends' }];
    const result = await completeLoad(async (from) => ({ data: rows.slice(from, from + 1), count: 2, error: null }), r => JSON.stringify([r.id, r.type, r.value]));
    assert.deepEqual(result.data, rows);
});

test('credit beyond the first 1000 rows remains in balances and manual fields survive', async () => {
    const account = makeAccount({ openingBalance: 200000 });
    const expenses = Array.from({ length: 1250 }, () => expense({
        amount: 100, accountId: account.id, categoryId: 'transport.auto',
        description: 'Manually corrected payee', notes: 'Keep this note',
        contexts: [{ type: 'PURPOSE', value: 'work' }],
    }));
    const source = [...expenses, income({ amount: 500000, accountId: account.id })];
    const result = await completeLoad(async (from, to) => ({
        data: source.slice(from, to + 1), count: source.length, error: null,
    }), row => row.id);
    assert.equal(accountBalance(account, result.data), 575000);
    assert.deepEqual(result.data, source);
});
