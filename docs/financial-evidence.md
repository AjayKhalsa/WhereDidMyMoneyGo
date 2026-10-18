# Dated financial evidence

Apply `supabase/migrations/0014_dated_balance_evidence.sql` before deploying this release. It adds nullable opening dates and reconciliation evidence to accounts; existing opening amounts and transactions are untouched. Existing account RLS policies remain in force.

Evidence stores the signed closing balance (card debt positive, card credit negative), statement as-of date, source identity, recorded timestamp and accounting-field fingerprint. Historical accounting changes mark evidence stale through database triggers; the client also validates the amount and fingerprint. Labels, notes and category corrections do not change accounting validity. Future activity does not invalidate an earlier checkpoint. Evidence applies through the end of its calendar date, while an opening balance applies immediately before its opening date's activity.

Money displays verified dates, stale history and unverified accounts. Existing timestamp-only checks are historical metadata, not statement certification. Imports earlier than a known opening date are visibly flagged because their coverage may overlap the opening balance; such activity is never silently removed from balances.

Net worth includes positive card credits while liquid cash excludes them. Portfolio estimates subtract only explicitly investment-linked outbound transfer redemptions after a valuation stamp. A later stamp already incorporates earlier withdrawals. Unknown holdings and unlinked transfers require separate evidence rather than guessed valuations. Lifetime gain includes known distributions so a withdrawal alone does not become an investment loss.

Focused tests cover card-credit assets, investment redemption conservation, stale fingerprints, unchanged manual labels, trigger behavior and existing Gmail security/idempotency. Private user statements, ledger backups, balance reports and the detailed local session handoff are excluded from this public repository.
