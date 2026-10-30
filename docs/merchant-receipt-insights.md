# Merchant, receipt and insight improvements

This release adds automatic classification coverage and richer views of existing ledger data. No new database migration, paid lookup, AI call, environment variable or historical financial repair is included.

## Evidence from the audit

The current Gmail queue had zero pending/unrecognised financial alerts and one allocation notice requiring corroboration, not a second investment debit. This is a queue check, not proof of complete bank coverage.

A private read-only replay of 18 recent authenticated Swiggy/Zomato receipts parsed all 18 with the updated code. Restaurant names were recovered in 18 and bounded outlet addresses in 15. All 18 had possible existing platform payments; none had a unique labelled exact order reference. Therefore these are review suggestions, not automatic identity proofs. No historical attachments were applied during the audit.

## Changes

- Recognise additional Mumbai restaurants, coffee merchants, pharmacy/chemist descriptors, personal-care services and subscription services. Generic `Premium` no longer overrides a recognised subscription with Insurance. Saved corrections, missing-category checks, conflicting evidence, credit purpose and special financial events retain their guards. Category changes affect future classification; existing labels are untouched.
- Preserve receipt MIME structure independently of bank-alert parsing. The Swiggy order-journey restaurant section must end at the first explicit journey clock before customer information. Ambiguous layouts keep outlet fields unknown. Neither delivery clocks nor customer addresses become transaction facts. Explicit order-number/currency/payment-mode variants are supported for receipts; these never create bank debits.
- Preselect eligible single-payment receipt suggestions for convenience. A batch action remains disabled until the user explicitly verifies the proposed matches with visible amounts. Distinct order/payment collisions, duplicate order emails, resolved/dismissed/removed items and ambiguous selections are excluded. Each confirmed link goes through the existing fresh-email fetch, authentication, snapshot/ownership checks and atomic metadata RPC. Partial failures preserve successful links and leave remaining items for retry. The batch is not an all-or-nothing financial operation.
- Recurring suggestions require every observed interval to fit the cadence, rather than just its median. They exclude future entries, adjustments and nonpositive amounts, separate accounts and normalise merchant spelling. A rule on a different account no longer suppresses an otherwise eligible candidate. This remains a suggestion: no recurring rule or future payment is created automatically.
- Add food-channel and card/bank/cash/unknown payment-source insights using recorded net consumption, with linked-refund attribution and exact drill-down rows. Salary, investments, card repayments and adjustments are excluded. Unknown dining channels and unknown accounts remain explicit. Subscription charge changes require two stable monthly charges followed by a material change on the same account; refunded charges, irregular cadence and insufficient evidence suppress the claim. A changed charge is not asserted to be a provider price increase.
- Investment insights use gross contributions and show returned principal separately. The financial score's contribution/savings factors no longer treat asset liquidation as earned savings. Cash, portfolio and ledger amounts do not change.

## Verification

All 70 TypeScript test files and 11 Python caller tests passed, including financial preservation, refund attribution, FD/SIP contribution separation, recurring false positives, merchant precedence, receipt boundaries and batch-collision cases. Chromium checks at 320/390/768/1024 verified explicit confirmation, hidden resolved items, preserved removals, partial failure, privacy and layout without page errors. Browser API responses were mocked; authenticated production attachments were not exercised. The temporary harness is removed before the production build.

Release status is recorded after preview and production verification. Universal email-template support, permanent OAuth connectivity and exact visited-location coverage are not claimed.
