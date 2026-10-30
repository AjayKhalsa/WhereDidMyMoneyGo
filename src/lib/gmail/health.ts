import { BANK_SENDERS, INVESTMENT_SENDERS } from './alerts';

export const NIGHTLY_SYNC_UTC = '30 21 * * *'; // 03:00 IST
export function gmailHealth(input: {
  lastSyncedAt?: string | null; error?: string | null; hasNextPage: boolean;
  pending: number; review: number; hasReceiptWork?:boolean;
  historical?: { query: string; status: string; discovery_complete: boolean } | null;
}, now = Date.now()) {
  const last = input.lastSyncedAt ? Date.parse(input.lastSyncedAt) : NaN;
  const stale = !Number.isFinite(last) || last > now || now - last > 12 * 3600000;
  const history = input.historical;
  const historicalOutdated = !!history && [...Object.keys(BANK_SENDERS), ...INVESTMENT_SENDERS].some(sender => !history.query.includes(`from:${sender}`));
  return {
    state: input.error ? 'error' : input.hasNextPage || input.hasReceiptWork || input.pending > 0 ? 'incomplete' : stale ? 'stale' : 'checked',
    stale, pending: input.pending, review: input.review,
    needsReconnect:!!input.error?.startsWith('Reconnect Gmail'),needsSetup:!!input.error?.startsWith('Gmail server setup'),
    historicalOutdated,
    historicalDiscoveryComplete: !!history && history.status === 'complete' && history.discovery_complete && !historicalOutdated,
    schedule: 'Every 4 hours via GitHub Actions, with a nightly 03:00 IST fallback (timing can vary)',
  };
}

type Pass = { logged: number; reviewed: number; matched: number; more: boolean; receiptsChecked?:number; receiptsLinked?:number };
/** Bounded continuation; incomplete discovery never becomes a completed job. */
export async function drainMailbox(sync: (deadline: number) => Promise<Pass>, now = Date.now) {
  const deadline = now() + 45000;
  const result:Pass&{passes:number} = { logged: 0, reviewed: 0, matched: 0, more: true, passes: 0 };
  while (result.more && result.passes < 6 && deadline - now() >= 15000) {
    const pass = await sync(deadline);
    result.logged += pass.logged; result.reviewed += pass.reviewed; result.matched += pass.matched;
    if(pass.receiptsChecked!==undefined)result.receiptsChecked=(result.receiptsChecked??0)+pass.receiptsChecked;
    if(pass.receiptsLinked!==undefined)result.receiptsLinked=(result.receiptsLinked??0)+pass.receiptsLinked;
    result.more = pass.more; result.passes++;
  }
  return { ...result, complete: !result.more };
}
