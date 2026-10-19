import test from 'node:test';
import assert from 'node:assert/strict';
import { gmailHealth, drainMailbox, NIGHTLY_SYNC_UTC } from '../../src/lib/gmail/health';
import { BANK_SENDERS } from '../../src/lib/gmail/alerts';
import fs from 'node:fs';
const now = Date.parse('2026-10-19T06:00:00Z');
const current = { lastSyncedAt: new Date(now).toISOString(), hasNextPage: false, pending: 0, review: 0 };
test('health distinguishes discovery, processing, stale checks and review; never implies complete ledger', () => {
  assert.equal(gmailHealth(current, now).state, 'checked');
  assert.equal(gmailHealth({ ...current, pending: 1 }, now).state, 'incomplete');
  assert.equal(gmailHealth({ ...current, hasNextPage: true }, now).state, 'incomplete');
  assert.equal(gmailHealth({ ...current, lastSyncedAt: null }, now).state, 'stale');
  assert.equal(gmailHealth({ ...current, lastSyncedAt: 'invalid' }, now).stale, true);
  assert.equal(gmailHealth({ ...current, lastSyncedAt: new Date(now - 37 * 3600000).toISOString() }, now).stale, true);
  assert.equal(gmailHealth({ ...current, error: 'Reconnect Gmail' }, now).state, 'error');
  assert.equal(gmailHealth({ ...current, review: 7 }, now).review, 7);
});
test('completed historical scan with omitted new sender is explicitly outdated', () => {
  const history = { query: Object.keys(BANK_SENDERS).map(s => `from:${s}`).join(' '), status: 'complete', discovery_complete: true };
  assert.equal(gmailHealth({ ...current, historical: history }, now).historicalDiscoveryComplete, true);
  const old = gmailHealth({ ...current, historical: { ...history, query: history.query.replace('from:hsbc@hsbc.bank.in', '') } }, now);
  assert.equal(old.historicalOutdated, true); assert.equal(old.historicalDiscoveryComplete, false);
  assert.equal(gmailHealth({ ...current, historical: { ...history, status: 'scanning' } }, now).historicalDiscoveryComplete, false);
});
test('scheduled continuation totals passes and exposes exhausted work budget as incomplete', async () => {
  let calls = 0;
  const finished = await drainMailbox(async () => ({ logged: 1, reviewed: 2, matched: 3, more: ++calls < 3 }), () => now);
  assert.deepEqual(finished, { logged: 3, reviewed: 6, matched: 9, more: false, passes: 3, complete: true });
  const capped = await drainMailbox(async () => ({ logged: 0, reviewed: 0, matched: 0, more: true }), () => now);
  assert.equal(capped.passes, 6); assert.equal(capped.complete, false);
  let clock = now;
  const bounded = await drainMailbox(async () => { clock += 32000; return { logged: 0, reviewed: 0, matched: 0, more: true }; }, () => clock);
  assert.equal(bounded.passes, 1); assert.equal(bounded.complete, false);
  await assert.rejects(drainMailbox(async () => { throw Error('token expired'); }, () => now), /token expired/);
});
test('deployed cron schedule is 03:00 IST', () => {
  assert.equal(JSON.parse(fs.readFileSync('vercel.json', 'utf8')).crons[0].schedule, NIGHTLY_SYNC_UTC);
  assert.equal(NIGHTLY_SYNC_UTC, '30 21 * * *');
});
