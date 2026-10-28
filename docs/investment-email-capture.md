# Investment confirmations and unrecorded bank credits

## Findings

Two different gaps can make money appear missing:

1. A correctly parsed personal bank credit stays in financial-purpose review until its purpose is known. It is not automatically earned income. The current implementation excludes this unresolved credit from the ledger; a clean Gmail scan therefore does not prove the cash balance includes it.
2. Discovery previously searched supported banks and successful CRED receipts, excluding investment providers. Groww allocation confirmations and registrar purchase confirmations were never queued. No bank debit email may be available for a mandate payment.

This change makes the second gap visible and explicitly warns about the first. It does **not** yet implement a separate unresolved-cash ledger state or infer the purpose of personal credits. That remains required for the broader automation plan.

## Source changes

- `src/lib/gmail/alerts.ts`: include narrowly scoped Groww SIP reminders/allocation subjects and KFintech purchase confirmations; require aligned Gmail sender authentication. Parser version 4 retries unresolved old review receipts while preserving logged entries and user dismissals. Bank debits naming Groww remain financial-purpose review, rather than automatically becoming consumption expenses.
- `src/lib/gmail/investment-notices.ts`: distinguish a scheduled SIP from actual allocation evidence. Preserve scheme, net allocated value, units, NAV and provider order when available. A reminder's date is only a due date. An order number and email arrival date are not treated as a bank posting timestamp.
- `src/lib/gmail/sync.ts`: retain allocation notices in review with their own identities. Authenticated scheduled reminders are non-payment records; they create no payment. The existing durable queue, seven-day overlap and four-hour job are reused.
- `src/lib/gmail/backfill.ts` and `health.ts`: newly scanned allocation confirmations require review instead of being silently skipped as unsupported. Pre-provider historical scans are marked outdated.
- Settings renders investment evidence separately from bank transactions. The API refuses to submit an allocation value through the expense, income or repayment workflow. Bank-debit investment notices can link an existing contribution; new investment entry remains the existing Invested workflow. Personal bank-credit rows clearly warn when the email has not yet created a ledger event.

No migration, secret change, paid service or AI request is required. These source changes must be merged/deployed before the scheduled job uses them.

## Financial safeguards

- An allocation of ₹9,999.50 does not prove a ₹10,000 bank debit. Keep gross cash and net allocation distinct; do not infer a fee from the difference.
- Three same-day equal-value SIPs with distinct order identities remain three separate events. Do not deduplicate by amount/date alone.
- A fund-house confirmation may corroborate an already recorded investment. It must not create another bank payment. Cross-provider automatic linking is not implemented here; unresolved evidence remains reviewable.
- A reminder, mandate authorization or forecast never proves a completed payment.
- Current bank-debit investment automation and unresolved-credit accounting need further implementation before claiming these cases require no manual decisions. Supported confirmation capture has improved; universal email coverage is not guaranteed.

## Verification

The full 52-file suite, typecheck and production build passed. New parsing and actual-sync tests cover three equal-value allocations, distinct order IDs, no invented gross bank amount/date, reminders creating no money, repeated scans, sender authentication, malformed data and Groww debits avoiding expense automation. A separate private local replay parsed seven actual relevant emails successfully. Private email bodies, account identities and the backed-up financial dry run remain outside Git.

No production financial mutation was made in this change. Exact recovery entries require a current private backup, account-holder evidence, a reviewed dry run and explicit approval under the existing financial-data policy.
