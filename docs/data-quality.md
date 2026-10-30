# Complete financial loading and data-quality coverage

Financial completeness phase of the richer-data plan. This is an additive change to the existing repository, financial engines and interface; no new ledger model, migration, environment variable or production financial repair is required.

## Behavior

- `src/lib/data/complete-load.ts` requests bounded pages with exact counts and advances by returned rows. A server limit lower than the requested page size cannot silently truncate a collection.
- `src/lib/data/supabase-adapter.ts` uses that loader for all 13 financial/context collections, retaining user scoping and stable ordering. Context identities include parent ID, type and value. Row mapping and canonical transaction IDs are unchanged.
- Missing counts, changed counts between pages, repeated identities, failed requests and incomplete pages fail the load. A failed refresh invalidates old results instead of leaving them labeled ready. Money, Transactions and Insights display a retry state; Home already had one.
- Home and Insights show uncategorized spending, actual-time coverage, dated account checkpoint status and existing Gmail queue health. All-history coverage is explicitly separate from the selected month's charts. Uncertain clocks do not count as actual transaction times.
- The existing `/api/gmail` endpoint supplies separate financial-review and already-logged category-review counts. No status, receipt or transaction is changed by reading them. A review receipt count is not a count of distinct missing transactions.
- The panel uses the existing privacy control for amounts and links to Settings' Gmail section. The account list is collapsed initially. A failed status request does not show a healthy or fresh mailbox.

## Limits

Complete loading means all currently visible rows were fetched, not that every real-world transaction exists. It does not prove statement coverage or reconcile a current balance. Checkpoints retain their original as-of dates.

The page checks detect count changes and repeated identities, but separate HTTP requests are not a transactional database snapshot. Concurrent same-count edits or cross-table changes can still require another refresh. A future revision-token/read-snapshot enhancement can address this without rewriting accounting.

Existing Gmail health uses the nightly stale threshold. Its scan timestamp is labeled **Last mailbox scan**, not last successful end-to-end job. Durable attempt/success histories and a tighter threshold for the four-hour scheduler remain later work.

## Validation

- Full existing 53-file suite passed, followed by the new repository-boundary suite and corrected checkpoint fixture passing (54 test files total).
- Typecheck and production build passed.
- Pagination tests include more than 1,000 rows, a lower server cap, contexts, missing/changed counts, repeated IDs, failures, manual field preservation, and a credit on a later page that must affect the bank balance.
- Store tests verify failure invalidation and successful retry. Checkpoint tests distinguish later transactions from changes before the statement date.
- Chromium checked Home and Insights at 320, 390 and 1024 pixels; no horizontal overflow. Synthetic local data and mocked Gmail responses verified review counts, unknown-time coverage, privacy masking, checkpoint disclosure and request failures. Forced storage failures verified the three financial-screen error states. No production financial data was used in these browser tests.

Production verification is pending merge/deployment. No new production data or schema mutations were performed.

## Remaining implementation sessions

| Session | Existing components to extend | Completion requirement |
| --- | --- | --- |
| 2: Email extraction and AI fallback | `src/lib/gmail/alerts.ts`, `sync.ts`, `server.ts`, `src/lib/data/ai-classifier.ts`, `src/app/api/classify/route.ts` | Deterministic parser first; evidence-checked structured AI fallback for unsupported formats. Enforce the user's zero-spend limit with confirmed free-tier eligibility, bounded calls, no paid fallback and retryable quota states. Never treat an AI guess as proof of amount, direction, account or posting. |
| 3: Timestamp recovery | `gmail/alert-time.ts`, `api/gmail/timing/route.ts`, `domain/transaction-time.ts`, `engine/history-enrichment.ts` | Use bank/payment clocks first; document email/manual logging estimates. Unknown time stays unknown. Backfilled timing changes require a scoped dry run and preserve statement fingerprints appropriately. |
| 4: Review and dynamic categories | `components/settings/gmail-panel.tsx`, `gmail/classification.ts`, `engine/learning.ts`, category editing | Reuse saved corrections; propose new categories for one-time approval; retain rule evidence/exceptions; make already-recorded category checks distinct from missing money. |
| 5: Historical cleanup and recurring links | `gmail/backfill.ts`, `backfill-plan.ts`, shared import identity and `engine/recurring.ts` | Refresh against the current ledger; apply only an approved backed-up batch; resume safely and prove replay safety. Link actual payments, never create predicted payments. |
| 6: Evidence-backed insights | `engine/insights.ts`, analytics/spending reports and existing Insights components | Clear consumption vs transfers/refunds/repayments; comparable periods and coverage warnings; drill-down evidence. Conversational answers use verified calculations rather than model arithmetic. |

Keep these sessions independently reviewable. Production historical mutations retain the existing backup, exact dry run and explicit approval requirement. Do not claim universal email parsing, permanent OAuth tokens or complete historical coverage without evidence.
