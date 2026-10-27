# Finance automation handoff

## Expense reliability follow-up — 2026-10-28

PR 29 now also addresses expired Gmail paging cursors, Axis contact-footer parsing, P2A reference extraction and statement routing-bank names being mistaken for merchants. It includes a read-only private expense audit CLI. No historical financial records or manually assigned categories were changed. The new parser retry applies only after source deployment; no migration is required. See `expense-quality.md` for observed review/Other coverage and outstanding work. PR 29 remains unmerged; production behavior is unchanged by this source follow-up.

## Current verified status — 2026-10-27

This section supersedes historical baseline notes below. PRs 27 and 28 are merged. Migrations 0022 and 0023 are applied; the under-₹150 personal-UPI Auto rule and 16:00 Snacks boundary are on main. The exact, separately approved payment/refund repair batch has been applied atomically after a private backup and dry run. Two missing financial events were recorded, four receipts now reference three canonical transactions, and the existing card repayment was checked unchanged field-for-field. Salary was already linked and was left unchanged. No balancing adjustment was inserted. These checks verify the approved repair, not complete statement coverage after the existing reconciliation date.

Migration 0021 is now applied. Push subscriptions are encrypted and server-only: RLS is enabled, authenticated clients cannot read the table or execute registration directly, and the service role can register. Vercel team access was granted. Production-only VAPID keys and the app HTTPS subject were added without changing existing secrets. The current main commit was redeployed successfully with those settings; the production alias serves the push-enabled service worker, and unauthenticated notification requests redirect to login. No runtime errors were found in the new deployment during inspection. Device registration, authenticated status and actual delivery still require user permission and a test on the device. PR 29 remains separate and unmerged. The monthly statement reminder is already configured separately. Recent GitHub Gmail sync runs completed successfully; this does not imply all review cases are resolved.

The current branch adds explicit historical-preview refresh for parser/sender updates and a read-only temporal holdout evaluator. Neither changes existing categories or imports historical money. The latest completed preview still contains proposed imports and unresolved cases, so three-month import and reliable recurring links remain unfinished. Refresh the dry run against current ledger/statement evidence before proposing another financial mutation batch. See `learning-evaluation.md` and `gmail-backfill.md`.

## Receipt matching follow-up — 2026-10-27

The latest work adds ICICI card-repayment receipts, Axis account debit/credit summaries and authenticated CRED successful-payment receipts; shared-reference matching runs before financial-purpose review. Parser-version metadata permits bounded retry of unresolved review formats while preserving dismissals and canonical ledger fields. Partial repayments default to transfers, with the paying account requiring confirmation. See `gmail-payment-receipts.md` for safeguards and validation. PR 27 was merged; required migration 0022 was subsequently backed up, applied and schema/permissions verified with explicit approval. The service-only credit helper, matcher, parser metadata and RLS are verified. No existing ledger rows were changed by these database updates. Historical financial repairs still require separate approval. Existing statement reconciliation is preserved.

The merged PR also adds explicit salary-credit automation and HDFC merchant refund/reversal parsing. Only authenticated, mapped salary credits with explicit bank narration or confirmed posted card refunds can auto-log; generic credits and refund initiations remain reviewable. Previously entered salary rows are protected from duplication. No live salary/refund repair has been applied here.

Latest preference update in the separate follow-up PR: outgoing personal UPI strictly below ₹150 uses Transport / Auto, with saved corrections and known merchants taking precedence. An equivalent user Auto category is reused. Migration 0023 was explicitly approved, backed up and applied: Auto was added while all prior categories and financial records remained unchanged. The source rule and 16:00 Snacks correction still require merging/deploying this follow-up. They do not recategorize manually corrected historical entries automatically.

Current outstanding requirements: verify migration 0022 and PR 27 deployment, deploy the separate Auto/meal follow-up, and obtain approval for the specific financial repairs; investigate missing bank-funding history before claiming current balances reconcile; finish historical import (the three-month backfill currently previews only), reliable subscription linking and held-out categorization evaluation. Application phone/browser push is not live: its subscription table is absent in the inspected production schema, and VAPID/device delivery remain unverified. The separate monthly ChatGPT statement reminder is already configured. Four-daily GitHub scheduling has had a verified successful run after secret/OAuth setup. Earlier baseline sections below are historical, not claims that later work never occurred.

Last inspected: 2026-10-21. Baseline: `main` at `cc6f1e81653bfc5c13ff532ad185c7e0cef986eb` (PR #20 merged). GitHub's Vercel commit status is successful, linking deployment `4VnC3UGFss3NreCk5ev1TzsFKgjb`. This confirms the deployment status, not authenticated production behavior, the active production alias, or database migration execution.

## Evidence and limits

The requested `docs/finance-automation-state.md` did not exist before this session. Neither original private audit/diagnostic was available in the workspace. Read the available implementation records: `financial-evidence.md`, `shared-transaction-identity.md`, `gmail-parsing.md`, `gmail-learning.md`, `gmail-backfill.md`, and `transaction-time-enrichment.md`. These are implementation documentation, not substitute bank evidence. Previously reported statement checkpoints and card suffix aliases remain user-provided findings requiring verification against statements and the current ledger.

Migrations 0001–0020 exist in source. No live Supabase credentials, statement files, ledger export, recoverable production backup or migration-history access are available in this environment. Applied migration state and actual account balances are **unverified**. No financial data was changed in this session. Do not infer financial reconciliation from a successful build, deployment or test.

## Phase status and minimal next work

| Phase | Implemented in current source | Outstanding and relevant files |
| --- | --- | --- |
| 0: Establish baseline | Repository and deployment status inspected; implementation docs reviewed | Obtain original two audits if available, applied migration history and authenticated production evidence. |
| 1: Reconciliation/accounting | Positive card credits in net worth, investment-linked redemptions, dated opening balances/checkpoints, stale detection, balance-checked atomic reconciliation | **User reports completed in another chat.** Preserve those checkpoints; prior reconciliation artifacts are not available here for independent verification. Validate only new statement coverage or specific discrepancies, with a backup and approved dry run before any further financial mutations. `engine/analytics.ts`, `engine/reconciliation.ts`, `import/reconciliation.ts`, `import/statement-row.ts`, migrations 0014/0016. |
| 2: Gmail parsing/timestamps | HDFC account-update credits parsed from body; timestamp provenance; debit/credit separation and financial-purpose review | Validate against real reconciled statement/email pairs; recover missing credits only through approved dry run. Dismissed receipts remain protected. `gmail/alerts.ts`, `alert-time.ts`, `sync.ts`, migration 0017. |
| 3: Learning/tagging | Gmail uses persisted rules and reviewed historical evidence; merchant aliases; category-only review; qualifying debits logged as Other; small personal-UPI heuristic; conditional tagging | Verify actual historical training coverage and held-out category/subcategory accuracy, false positives and conflicts. Resolve boundary/fallback differences below. `gmail/learning-data.ts`, `classification.ts`, `engine/learning.ts`, `time-rules.ts`, migrations 0018/0020. |
| 4: Shared identity | Shared source receipts, strong-reference matching, conservative weak matches, canonical IDs, locks, atomic batches | Verify migrations live and rehearse with actual overlapping statements/manual/Gmail sources. Posting tolerance is currently three days; configurable 1–3-day tolerance and group-level count/total reconciliation are not a completed workflow. `import/identity.ts`, migrations 0015/0016, `tests/import/shared-identity*`. |
| 5: Three-month backfill | Resumable, bounded, idempotent historical **preview**, detailed staged counts and failure handling | No historical apply endpoint; imported count remains zero. Statement-verified approved import/link operations and a real completion report are outstanding. `gmail/backfill.ts`, `backfill-plan.ts`, `api/gmail/backfill/route.ts`, migration 0019. |
| 6: Subscriptions | Existing recurring engine and preview suggestions based on actual payments | Confirm and apply reliable links; verify actual paid obligations and amount changes. Suggestions do not synthesize payments. `engine/recurring.ts`, `gmail/backfill-plan.ts`. |
| 7: Nightly sync | Existing secured cron at `30 21 * * *` (03:00 IST), bounded drain, shared sync pipeline, leases, token encryption and stale/backlog UI health | Verify actual nightly runs and durable Google consent/refresh tokens. Ordinary sync has no explicit invalid-page-token recovery branch; persisted attempt/success/job-result history and per-message failure/retry monitoring remain incomplete. `api/cron/gmail/route.ts`, `api/gmail/sync/route.ts`, `gmail/sync.ts`, `health.ts`, `server.ts`, `components/settings/gmail-panel.tsx`. |
| 8: Targeted UI | Learned rules collapsed by default with count/edit/delete; dated verification and Gmail review UI | This session adds missing mobile Settings navigation in `components/layout/app-shell.tsx`. No redesign or financial behavior change. |
| 9: Future insights | Earlier PRs already added spending exploration | No further insights work until reconciliation is verified. |

Paths above are relative to `src/lib`, `src/app`, or the explicit component/migration directories as appropriate.

## Requirements differences to resolve in the later tagging phase

PR #20 followed the earlier request for snacks from **17:00**, and uses only verified bank/payment or user-confirmed clocks for meal rules. The latest master plan specifies **16:00** and permits documented, lower-confidence received-email-time suggestions. Treat the latest plan as the target for subsequent work, but do not change classification or historical tags during this reconciliation/status session. Unknown midnight placeholders must still never become confident meal evidence.

`docs/gmail-setup.md` contains older descriptions (08:00 schedule, known-category-only logging, no cross-source protection). Current code and the newer focused documents supersede those details. Update the setup guide in the automation phase after production configuration is verified.

## Phase 1 next-session handoff

1. Reuse the completed reconciliation report from the other chat if available; obtain new statement coverage and a current ledger export for the next validation. Confirm period coverage, opening/closing amounts and account/card identity, including card suffix aliases. Keep private financial artifacts out of Git.
2. Establish a recoverable backup and confirm production deployment and migrations 0001–0020. Prepare the dry run using existing parsers and reconciliation/identity mechanisms; do not add speculative balance adjustments.
3. Report proposed inserts, financial corrections, proven duplicates, unresolved groups and before/after closing balances for every affected account. Preserve IDs and manual descriptions/categories/contexts. Explicitly identify intentional dismissals needing separate approval.
4. Obtain explicit approval for that concrete batch, apply atomically, reload and verify all stated balances plus replay safety. Only then advance to later automation phases.

Yesterday's reported error has no attached screenshot, error text or reproduction steps in this conversation. Its cause is unknown; obtain the exact error, screen/action and approximate time before diagnosing it.

## This session's validation and publication

The mobile navigation fix passed typecheck, production build and Chromium checks at 320, 390 and 768 pixels (Settings route, active state, no horizontal overflow), plus a single desktop Settings link. Focused accounting-balance, financial-evidence, reconciliation and shared-identity database suites passed. No migration is required for this navigation change. The fix is prepared on `fix/mobile-settings-and-finance-handoff`; production deployment of this fix is not yet verified.

Private evidence and the detailed `finance-automation-state.md` handoff remain excluded from Git. This tracked summary contains implementation status only.

## Follow-up: user confirmation and save/notification work

The user confirms bank-statement reconciliation was completed in another chat. This supersedes the earlier assumption that they still need to perform initial reconciliation. The underlying artifacts are unavailable here, so preserve existing checkpoints and request only new coverage or a prior report when needed. No repeat financial mutation is authorized by this observation.

A screenshot showed a truncated Supabase `put:transactions` failure; the full production error remains unavailable. See `save-errors-and-notifications.md` for the narrowly scoped missing-column compatibility fix, persistent errors, preserved unverified clocks on category edits, push deployment requirements and the monthly statement reminder. Notification migration 0021 and VAPID credentials are prepared but not applied/configured in production here.

## Net insights audit and sync frequency request

The user reported Family transfers showing gross outgoing while omitting credits. See `calculation-audit.md` for the synthetic ₹140k − ₹80k = ₹60k regression, broader calculation corrections, and distinctions between category cash flow and consumption. No live financial rows or the previously completed reconciliation were changed. A separate four-daily cron change is prepared for a supported Vercel plan; Hobby's deployment restriction must not block shipping calculation fixes.
