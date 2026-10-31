# Received money in statement imports

A statement credit proves that money arrived in the selected account. It does
not prove earned income, a refund or a transfer between your own accounts.

Statement review now leaves unclear credits unchecked with **Choose type**.
One tap opens Income, Refund and Own-account transfer. Explicit salary and
bank-interest narratives can retain the automatic Income proposal. Refund,
reversal and cashback words suggest Refund but still require confirmation.
Principal, maturity, redemption, closure, loan and own-account narratives remain
for review even if they mention interest or salary. Personal UPI credits are not
assumed to be salary. Outgoing rows cannot become income because their narration
mentions interest; incoming SIP or card narratives cannot become outgoing debits.

Refund selection creates an INCOME row with isRefund set and the merchant's
proposed spending category. Category editing preserves that credit direction.
It does not guess an original purchase ID. Refunds reduce recorded spending;
they do not add to earned income. Ordinary Income has no spending category.
The global category picker selects a parent category; automatic merchant
classification can propose a more specific subcategory.

Received own-account transfers require another tracked bank or cash account as
the source. The selected statement account becomes the destination. The app
does not infer ownership from a payee name. Card or investment source accounts
are excluded from this received-transfer picker because those flows need their
existing debt/holding-specific workflows. Existing recorded transfers, refunds
and investment redemptions can still be linked as canonical entries without
changing their type, category, endpoints or holding association.

Both local and cloud import paths validate the complete batch's bank direction
before the first writer is invoked. Reversed direction, incomplete/self transfers
and invalid refund directions stop the batch. Cloud validation and locks remain
unchanged, and recorded-split preflight still reloads before writing. The local
path now provides the same basic direction protection. Explicit purpose choices
are review state, not new persistent category rules or database fields.

Matching a saved entry keeps its existing financial nature; the proposed type
and category controls are disabled while that link is selected. Editing categories
on outgoing rows can still turn a suspected card payment into ordinary spending.
The original bank direction, amount, posting date and source identity remain fixed.

All detail sheets return to the same review on Escape. Privacy masking and the
prior recorded-split warning remain available. This release has no migration,
historical recategorisation or agent-applied financial writes.
