import { BANK_SENDERS } from './alerts';

export const NIGHTLY_SYNC_UTC = '30 21 * * *'; // 03:00 IST
export function gmailHealth(input: {
  lastSyncedAt?: string | null; error?: string | null; hasNextPage: boolean;
  pending: number; review: number;
  historical?: { query: string; status: string; discovery_complete: boolean } | null;
}, now = Date.now()) {
  const last = input.lastSyncedAt ? Date.parse(input.lastSyncedAt) : NaN;
  const stale = !Number.isFinite(last) || last > now || now - last > 36 * 3600000;
  const history = input.historical;
  const historicalOutdated = !!history && Object.keys(BANK_SENDERS).some(sender => !history.query.includes(`from:${sender}`));
  return {
    state: input.error ? 'error' : input.hasNextPage || input.pending > 0 ? 'incomplete' : stale ? 'stale' : 'checked',
    stale, pending: input.pending, review: input.review,
    historicalOutdated,
    historicalDiscoveryComplete: !!history && history.status === 'complete' && history.discovery_complete && !historicalOutdated,
    schedule: 'Daily at 03:00 IST',
  };
}

type Pass = { logged: number; reviewed: number; matched: number; more: boolean };
/** Bounded continuation; incomplete discovery never becomes a completed job. */
export async function drainMailbox(sync: (deadline: number) => Promise<Pass>, now = Date.now) {
  const deadline = now() + 45000;
  const result = { logged: 0, reviewed: 0, matched: 0, more: true, passes: 0 };
  while (result.more && result.passes < 6 && deadline - now() >= 15000) {
    const pass = await sync(deadline);
    result.logged += pass.logged; result.reviewed += pass.reviewed; result.matched += pass.matched;
    result.more = pass.more; result.passes++;
  }
  return { ...result, complete: !result.more };
}
