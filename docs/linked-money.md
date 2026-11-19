# Linked money

Open an expense or incoming payment from any transaction list, then choose **Link received money** / **Link money**. The sheet supports purchase contributions (gifts, shared meals and reimbursements) and money held and forwarded for someone else. Select several matching bank entries and edit the portion of each payment. Date proximity is a suggestion, never an automatic match. Salary, refunds, adjustments and future entries are excluded from contribution candidates. Links require confirmation.

Each link allocates an incoming payment to an expense, or holds a selected portion unallocated. Several incoming payments can fund one purchase, and one incoming payment can fund several purchases. Incoming and outgoing allocation totals cannot exceed the original amounts. No expected repayment, friend balance, or unpaid share is created. Without actual linked money received, the whole expense remains personal spending.

Examples:
- ₹10,000 dinner with four actual linked ₹2,000 receipts: ₹2,000 personal spending.
- ₹2,918 wallet with ₹2,100 linked funding: ₹818 personal spending.
- ₹4,500 rent held for someone else: neither personal income nor spendable cash. Matching the actual onward payment clears the held amount and excludes that payment from personal spending.

The bank ledger is never rewritten. Personal reporting is a separate projection using received payments and their allocations. Bank balances, card charges and statements retain the original amounts. Budgets, spending reports, charts, income summaries, financial score inputs and AI facts use personal amounts. Later-received contributions restate the original purchase's budget cycle; cash-position reporting includes an explicit linking timing adjustment across cycles. Actual bank receipt dates remain intact.

Unused linked funds are held aside, excluded from safe-to-spend and owned net worth. Linking an onward payment consumes an existing reservation atomically, rather than reserving the same rupee twice. A later merchant refund can reduce the applicable funding; the remaining linked funding returns to held money until reapplied or unlinked. Refunds retain their real bank amounts. No negative double-counting is introduced.

Existing links can be edited or removed, with a preview before saving. The last saved link change can be undone while the sheet remains open. Closing a sheet discards unsaved edits. The Money page includes a Linked money summary and access to each linked incoming payment. Transaction rows retain their full bank amount and show their personal spending separately. Editing a transaction always uses its original bank entry. Deleting a transaction removes its links; the normal transaction-delete undo restores them.

## Persistence and integrity

`money_links` is an owner-scoped table with RLS and owner-checked source/destination validation. Its invoker-only `commit_money_links` RPC compares the owner's current allocations with the expected version and replaces them in a single transaction. Profile-row locks serialize allocations for an owner. Capacity checks also apply to direct Data API writes. Conflicting amount/type edits on linked bank entries are rejected until the links are adjusted. Anonymous access is unavailable. The migration must be applied before deploying the client.

IndexedDB v3 adds a matching moneyLinks store; saves compare and replace in one read-write transaction. Old datasets without links remain valid. Exports include links with the original transactions. Cloud and local persistence failures never commit partial allocations. Concurrent-session conflicts require reloading and reviewing the latest links.

No real historical transactions were linked during implementation. Suggested matches require the account owner's confirmation.
