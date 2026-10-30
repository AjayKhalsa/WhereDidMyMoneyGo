# Food receipt linking — prepared phase

Status: implemented and locally tested; production migration and deployment require approval. This phase extends the existing 30-day Swiggy/Zomato receipt preview. It does not create financial transactions or change categories, merchants, notes, amounts, dates, accounts or contexts.

## Behaviour

- Completed, authenticated receipts retain the existing bounded parser: provider/order identity, paid amount, supported restaurant name and explicitly delimited outlet address. Delivery addresses, order/delivery clocks and raw message bodies are not stored.
- A unique explicit provider and labelled order reference can link automatically during a receipt scan. Other eligible platform payment matches require selection and confirmation. Amount/day alone never becomes an automatic link. The server re-fetches the email with the user's existing Gmail access, verifies its sender, parses it again and checks the selected user-owned expense.
- The database operation holds the existing financial-writer lock, compares the complete current ledger row to the server snapshot, and adds metadata/source provenance atomically. Replaying a request does not create another financial event or receipt identity.
- Multiple emails can support one order/payment. Distinct orders cannot be assigned to one payment merely because values match. Different canonical targets, removed identities, source conflicts and intentional dismissals are rejected. Source tombstones are preserved.
- Already-attached and intentionally dismissed receipts are hidden from the preview; removed links are shown without a restoration action. A saved receipt's details appear in the transaction editor, with outlet address collapsed and sensitive fields masked by the privacy control. Edited payment amount/date/type discrepancies are flagged.

## Database change

`20261030101829_food_receipt_details.sql` adds one empty metadata table, its user-scoped read policy/index and one server-only `SECURITY INVOKER` link function. Browser roles have no write or function-execute permission. The function never inserts or updates ledger rows. Existing `transaction_sources` stores per-email provenance. The migration reloads the PostgREST schema cache.

No new environment variables or Gmail scopes. Credentials remain in the existing encrypted server-side connection. Apply the migration and verify its permissions before merging/deploying the application change. No production schema or historical receipt attachment has been applied in this phase yet.

## Validation

Full existing suite: 66 test files passed. Database regressions cover repeated links, canonical/manual-field preservation, same-amount distinct orders, multiple supporting emails, source conflicts, deleted/dismissed identities, stale snapshots, rejected private-address fields, server grants and cross-user RLS. A private-copy rehearsal preserves all 640 current transactions and 608 existing source rows, with zero receipt rows after migration and no balance impact.

Chromium 320/390/768/1024 checks with mocked authenticated responses cover explicit selection/confirmation, hidden linked/dismissed entries, preserved removal, privacy, request payloads and layout. The temporary UI harness is removed before the production build. Actual signed-in production linking has not been exercised.

## Boundaries and next phase

This first release requires confirmation for ambiguous historical matches. It is not scheduled automatic receipt enrichment and does not claim that all restaurant templates, historical expenses or locations are covered. Existing candidates require matching amount, provider name and received-day proximity; a manually renamed merchant without provider evidence may need a later matching improvement. Unattended receipt discovery/enrichment in the shared Gmail pipeline remains a later phase; current automatic linking runs during the bounded receipt scan. Private content is not sent to external AI services.

Baseline security advisors report existing server-only tables without browser policies and three earlier authenticated `SECURITY DEFINER` financial RPCs; this migration adds no definer function and keeps new evidence read-only under RLS. Existing leaked-password protection is disabled; see [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). These existing settings were not changed as part of receipt enrichment.
