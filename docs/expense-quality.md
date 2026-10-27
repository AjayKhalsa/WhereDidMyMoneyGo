# Expense reliability audit

The current follow-up preserves ledger rows and manual labels while improving how new receipts and statement drafts are interpreted. No migration is required.

- Gmail HTTP 400 with a saved paging cursor restarts the same fixed query once, preserving its bounds and durable receipt queue. Auth, quota, network and server errors retain the cursor and do not advance the scan. Existing idempotent source matching protects replayed receipts.
- Axis transaction-info extraction stops before its contact footer. UPI P2A references are recognized as references without treating P2A as proof of a personal transport payment.
- In the complete `UPI/recipient/VPA/UPI/routing-bank/reference` statement layout, categorization and merchant normalization use the recipient. Airtel/Jio in the routing-bank field cannot imply a telecom purchase. Actual telecom recipients and explicit manual mappings still work. Raw statement narration remains available as evidence.
- Parser version 3 permits a bounded retry of unresolved older receipts after deployment. Logged entries and dismissals are preserved.

`scripts/audit-expenses.ts` runs offline against a private JSON export of transactions, categories, rules and receipt metadata. Use the repository Node transform/loader flags, pass the private file path, and optionally `--details`. Detailed reports contain private financial evidence and must stay outside Git. The audit writes no ledger rows, categories, source links or rules. It excludes the general small-UPI heuristic when ownership/recipient metadata is unavailable.

The inspected snapshot contained 532 expenses, including 113 already-recorded entries under Other. Thirty-nine email reviews remained: 37 had possible ledger matches and two were unsupported/nonfinancial formats. None of those matches was treated as proven from amount/date alone. After excluding recipient-bank vocabulary, the offline saved-rule/vocabulary audit had no supported automatic category changes for the Other entries. This is an evidence gap, not proof the events are missing: their amounts are already included in balances.

Remaining work: review account/date/reference evidence for ambiguous receipts, finish a fresh historical dry run against reconciled statement coverage, and obtain approval for any concrete historical mutation batch. Subscription linking and actual push-device delivery remain separate unfinished requirements. Passing parser tests or finishing Gmail discovery does not establish complete statement reconciliation.
