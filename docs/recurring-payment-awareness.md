# Recurring payment awareness

Money, the upcoming-payment calendar and safe-to-spend now share one read-only recurring-occurrence resolver. A recorded payment can cover its scheduled bill without requiring another expense entry or a persisted `recurringId` edit.

## Recognition

- Explicit saved recurring links remain authoritative for the nearest physical scheduled occurrence, including early payments and changed charge amounts. A late payment for a previous occurrence cannot clear a later bill merely because the older date falls outside the displayed calendar. One payment clears one occurrence.
- Automatic recognition is limited to expense bills with a saved account and a specific merchant identity. It requires a compatible Bills category, an exact amount, a payment within three calendar days of the due date, and a unique counterpart in both directions. Future entries, refunds/reversed charges, adjustments, investments, generic descriptions, unknown accounts and ambiguous claims do not complete an obligation.
- A nearby charge with the same merchant/account but a changed amount stays a review candidate; it does not update the schedule or silently release the commitment. Unresolved candidates offer **Review** instead of **Mark paid** to reduce accidental duplicate expense creation.
- Overlapping schedules for the same service, account and amount are flagged and preserved. Month-end, year-end and mixed-cadence overlaps also block automatic recognition across forecast windows. No schedule is deleted, paused, merged or automatically excluded from commitments.
- Weekly rules report the number of recorded occurrences and remain partly unpaid until all occurrences in the selected cycle are covered. Recognised and possible payments open directly onto their existing ledger rows.

This is forecast fulfilment recognition, not financial-event deduplication or proof of a new bank transaction. It never inserts or edits ledger rows, recurring schedules, source receipts, account balances or categories. Users can review a possible duplicate and pause an extra schedule using the existing editor.

## Read-only audit

The current private snapshot contains 643 transactions and six recurring schedules. Two YouTube schedules overlap. Replaying the previous and current pay cycles recognises one existing unlinked payment in the previous cycle and leaves current-cycle overlaps unresolved. All input rows stay unchanged. No historical financial repair or migration is included.

## Verification

Regression cases cover exact recognition, changed-price review, ambiguous equal payments, duplicate schedules inside/outside a displayed cycle, month-end and mixed-cadence overlaps, wrong accounts/categories/types, future rows, refunds, weekly occurrence counts and late prior-period payments. Existing recurring, calendar and calculation suites remain in place. Chromium checks at 320/390/768/1024 verify recognised payments, duplicate warnings, ledger drill-downs, suppressed duplicate-entry prompts, privacy and unchanged local ledger records. These browser checks use synthetic IndexedDB data; the live replay is read-only.

No database migration, new Gmail permission, secret, paid dependency or AI call. Deployment is verified separately from local tests.
