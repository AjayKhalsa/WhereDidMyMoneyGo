# Recorded split payouts in statement review

Statement import now warns when one bank row may already be represented by an
explicitly documented group of ledger entries. For example, a ₹50,648 bank credit
can correspond to a ₹50,000 principal transfer and ₹648 interest income.

This deliberately narrow compatibility check reads the existing **Companion ledger
entries:** note format used by approved split repairs. Every listed component must
exist, list the same companions, retain a unique ID and positive integer amount,
share a transaction date and affect the selected account in the same direction.
The components must sum exactly to the bank row, within the existing three-day
posting tolerance. Conflicting known references, adjustments, refunds, self
transfers, malformed lists and incomplete groups are excluded. Arbitrary pairs
with a convenient sum are never proposed. Multiple valid groups remain ambiguous.

Possible groups start unchecked. Review opens the original entries without editing
them. If they represent the payout, leave the statement row unchecked. A distinct
event needs the explicit separate-payment confirmation; a valid existing gross
entry can still be selected through the existing single-entry matching control.
Changing a guessed category does not remove the warning or confirm a new event.

Before either cloud or local import writes, the action reloads the complete
repository and checks the included rows again. A newly recorded split therefore
blocks an older open review unless a separate event or single-entry link was
explicitly selected. A failed reload fails closed. Existing server RPC matching,
locking and single-entry validation remain in force. This client preflight is not
a new atomic server constraint against concurrent companion edits.

This phase provides duplicate warnings, not group source linking. It does not
create a statement receipt for the split, rewrite the principal as income, mark
the statement reconciled or claim a complete match. Persisted many-entry source
links need a separate schema/writer increment and its required backed-up review.
No production ledger or schema changes are applied by this release.

Statement review also uses the bank's debit/credit direction for its amount sign
(including transfers), and respects hidden balance preferences in review figures.
