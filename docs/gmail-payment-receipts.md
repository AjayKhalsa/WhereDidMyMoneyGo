# Payment receipts and existing entries

This change extends the existing deterministic parser and shared ledger identity pipeline. No email content is sent to an external AI parser.

Supported additions:

- ICICI “Payment received on your ICICI Bank Credit Card” confirmations, including masked card identity, amount received and bank date.
- Axis account debit/credit summaries with Amount Debited/Credited, Account Number, Date & Time and Transaction Info; UPI/P2M and P2P bank references are extracted. A repeated date in the email header cannot hide the labelled transaction clock.
- CRED `protect@cred.club` successful card-payment confirmations. Discovery for this sender is scoped to the successful-payment subject. Bill reminders, processing/failed payments and statement amounts are not successful payments. The amount paid, rather than total bill due, is used. CRED order identity is namespaced separately from a bank RRN/UTR.
- HDFC merchant reversal/refund notifications, including initiation versus posting status and the separate initiation timestamp.

Explicit bank credits marked `SAL`/`SALARY` plus month/year can log automatically as salary, using the credited amount instead of planned salary. An authenticated supported sender, mapped active bank account, valid nonfuture date and import coverage are required. Generic NEFT credits, self-transfers, interest, loans and refunds do not become salary. `gmail_commit_identified_credit` uses the existing atomic shared-source commit, including collision checks; a manually entered salary with no shared reference still needs its email linked rather than being duplicated.

Posted card refunds use the same server-only path, reduce card liability and net consumption, and never count as earned income. A refund with an uncertain spending category is still included in the card balance and gets category-only review. The refund's clock is not used to infer a meal subcategory. An initiation notice that asks the user to wait for posting remains reviewable; its initiation clock is not stored as a verified posting clock. Manual recording requires explicit confirmation of posting with the displayed transaction date, checked by the review endpoint as well as the UI.

Card receipt credits default to Transfer / card repayment, with the receiving card selected and the paying account requiring confirmation. CRED bank debits also default to transfers with a destination to choose. Only the amount actually paid reduces card liability. Repayments never become a second consumption expense or earned income.

## Matching and review

`gmail_match_recorded` runs before category/financial-purpose gating. A unique shared bank reference, saved source identity or previously confirmed CRED order can acknowledge an existing canonical transaction. All financial fields, manually chosen categories, descriptions, notes and contexts remain untouched. Matching is serialized with existing imports and user ledger edits. Browser roles cannot invoke the matching RPC.

A card receipt lacking a shared reference may suggest an existing transfer, but an exact amount/date match alone does not silently merge events. The user can link the appropriate entry in Settings. Category-only review of an already logged debit remains a separate action and explicitly explains that the transaction is already in the balance.

`parser_version` permits one bounded retry of unresolved review emails after a parser upgrade. Intentionally ignored/dismissed, logged and duplicate receipts are excluded. A failed matching/commit attempt does not consume the parser version; it remains retryable. New sender discovery and retry work use the existing manual/cron pipeline, leases, pagination and work limits.

## Deployment and financial repair

Apply the receipt-matching migration in this PR before deploying the new pipeline. It adds a metadata column/index on `gmail_messages`, updates shared UPI reference extraction and installs service-role-only matching and identified-credit RPCs. Applying the migration itself inserts, deletes or updates no financial rows, and does not reset intentional dismissals. Reload PostgREST's schema cache (included in the migration). Existing account and transaction RLS remain in place.

After deployment, Sync now or the next Actions/Vercel job retries eligible review receipts and discovers recent CRED confirmations through the existing overlap window. It is not a full historical backfill. Future parser upgrades must increment `ALERT_PARSER_VERSION` deliberately. Previously completed historical previews using an older sender set are marked outdated by the existing health check.

Any requested repair of past financial events is separate: obtain a fresh scoped backup, present the verified receipt-to-ledger dry run with before/after balances and unresolved funding, and apply only after explicit user approval. A repayment's bank debit and provider/card receipt must reference one transfer, not create two financial events. Do not dismiss or merge ambiguous receipts to make review counts look healthy.

## Validation

Synthetic fixtures reproduce observed layouts without private email content. Tests exercise ICICI/CRED repayment semantics, Axis timing, sender authentication, payment-versus-bill amounts, partial-payment financial invariants, repeated receipts, same-day equal payments, manual field preservation, dismissals/tombstones, RPC permissions and interrupted review reprocessing. Salary and refund tests verify cash/liability/consumption invariants, rejection of generic incoming credits, pending-versus-posted evidence and no duplicate salary. A mocked HTTP integration executes the real sync function through a retry, credit match before categorization, automatic salary/posted refunds and an initiation held in review. Existing Gmail/shared-identity suites, TypeScript checks and production build are also run. Actual Gmail imports require post-deployment verification.
