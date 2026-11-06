# Personal payments and small-expense defaults

Owner preference, 6 November 2026: money friends send back is ordinary income. Do not create IOUs, splits, receivables or links to the original shared dinner/trip. The previous ₹150 default is superseded by strictly below ₹100 (10,000 paise).

## Future payments

- Otherwise unrecognized positive expenses below ₹100 default to Transport / Auto in Gmail, quick entry, pasted SMS and statement drafts. Known merchants, explicit corrections, approved conditions and conflicts retain precedence. Masked VPA text and P2M/P2P flags cannot prevent this fallback. A weak legacy Other guess or a one-word alias for a different payee cannot override it. Existing equivalent Auto categories are reused by Gmail; a missing/ambiguous category remains reviewable. Exactly ₹100 is outside the default. Refunds and financial-purpose exceptions do not use it.
- An authenticated posted personal bank credit from UPI/NEFT/IMPS can be recorded as INCOME on its identified active bank account. A possible self-name, merchant/processor, loan, principal, refund or investment payout remains excluded. Salary and posted card refunds retain their existing dedicated path. There is no AI email parsing or provider cost.
- Own-bank transfers require two authenticated opposite legs, distinct known bank accounts and the same bank reference, amount and a maximum three-day posting window. A name such as Ajay cannot identify a destination account by itself.
- CRED card payments require an authenticated CRED Club/Dreamplug bank debit and a unique authenticated successful provider receipt naming the card, with the same actual paid amount and payment date. Competing equal payments remain reviewable. No card is selected from the brand name or last-used card alone. The provider order namespace remains separate from bank references. CRED Telecom is a mobile bill, not a card repayment.
- Companion emails are fetched again, authenticated and compared with saved evidence before routing. A previously logged peer must still be an actual transfer with the expected endpoints. Tombstones/orphaned receipts, manual changes, partial peer sets and unresolved conflicts cannot create replacements. Existing owner-serialized import/link RPCs preserve manual financial fields and reject weak collisions. Successful new transfers mark an unresolved companion for a normal authenticated continuation, so both sources converge on one event.

No migration is needed. Parser version is deliberately unchanged: deployment does not broadly replay unresolved historical receipts or overwrite old categories. Historical repairs need the established exact-batch approval. Existing dismissals and deleted sources remain protected.

## Income evidence

Home's Income label opens the selected cycle's original income transactions, excluding refunds, own transfers and principal returned. When no salary is inside the cycle, the most recent salary before its start is shown separately with its real date. Its bank effect is already included. No payday or salary date is shifted and no salary is counted twice. All amounts respect money hiding.

## Validation

Tests cover masked names, strict paise boundaries, explicit corrections/conditions, weak surname collisions, shared-reference bank transfers, CRED cardinality/endpoint checks, authenticated companion re-fetches, existing-entry preservation, auth/date/account gates and salary-cycle evidence. Browser checks cover narrow layouts, income evidence and privacy using synthetic local data. Production arithmetic and approved historical repairs are verified separately against private before/after snapshots; recorded arithmetic is not new bank-statement reconciliation.
