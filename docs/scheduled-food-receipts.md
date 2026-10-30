# Scheduled receipt enrichment

Status: deployed and verified on 30 October 2026 in PR #48. Remote checkpoint migration version `20261030113435`; production commit `1f3029b13f71360b17d84d4b25fcec8c987f5b71`.

The existing four-hour GitHub Actions job and nightly fallback call the shared mailbox pipeline. Financial discovery and processing run first. Once that queue is caught up, remaining time checks authenticated completed Swiggy/Zomato receipts. No new job, environment variable, Gmail scope, AI service or paid dependency is added.

## Matching and preservation

- Automatic linking requires a unique eligible provider payment with a labelled exact order reference, or the already-confirmed canonical payment for that order. Amount/date alone cannot establish identity.
- The existing server-only receipt RPC independently validates identity, owner, financial snapshot, source conflicts, intentional dismissals and deleted targets. No ledger events, categories, notes or balances are rewritten.
- Ambiguous and unsupported receipts remain available through the existing manual receipt check. They do not become new financial-review alerts. Receipt timestamps are not treated as payment times. Customer delivery addresses and message bodies are not retained.

## Bounded continuation

Migration `20261030112146_scheduled_food_receipts.sql` adds one `receipt_scan` JSON object to the existing server-only Gmail connection. It contains fixed query bounds, cursor, pending message IDs and last completed scan boundary. Existing browser grants remain revoked.

An initial scan covers the previous 30 days, restricted by the connected start date. Subsequent scans overlap seven days to retry receipts whose payment alerts arrived later. Each page contains at most eight messages. Its IDs are persisted before consumption, and each ID is acknowledged only after processing. A crash after linking safely replays through the idempotent RPC. An expired Gmail page cursor replays the same fixed interval. Auth, quota, network and server errors preserve progress; deleted emails are consumed without creating anything. Checkpoints require the current unexpired mailbox lease.

An unfinished receipt queue propagates `more=true` to existing bounded continuation and the Actions caller. Checked/linked receipt counts are separate from imported financial events. The caller logs counts only. A completed receipt search does not prove every transaction was captured or every bank balance reconciled.

## Verification and release

- All 67 TypeScript test files, 11 Python caller tests, production build and typecheck passed.
- Worker regressions exercise multi-page discovery, fixed-bound retry, interruption after linking, acknowledgement failure, ambiguous exact references, weak matches, expired cursors, deadline continuation, deleted email and lost lease.
- Database tests verify an empty object default, object-only constraint and denied browser read/write. Existing receipt-linking regressions cover financial preservation, tombstones, dismissal, conflicts and RLS.
- A private-copy migration rehearsal preserved all 642 transactions, 611 source records, receipt metadata, accounts, categories and existing connection fields. The new checkpoint is empty. No production schema changes or historical receipt attachments were applied for this phase.

Activation verification: the refreshed private backup and independent post-migration snapshot preserved all 642 transactions, 611 source records, accounts, categories and contexts. The new checkpoint started empty and stayed server-only. [Production workflow run](https://github.com/AjayKhalsa/WhereDidMyMoneyGo/actions/runs/41049140435) completed successfully: 18 receipts checked, zero automatic links, zero financial imports. The checkpoint completed with no connection error; a further snapshot confirmed unchanged financial data. Authenticated confirmed receipt attachments have not been exercised in production.
