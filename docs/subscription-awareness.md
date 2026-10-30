# Subscription payments and schedule awareness

Money → Bills & subscriptions now starts with a subscription overview. It shows
recorded spending after refunds, saved monthly/annualised schedule costs, upcoming
charges, charge changes and repeated-payment evidence for optional reminders.

## Actual payments and estimates

Actual spending uses expense rows and posted refunds in the selected pay cycle.
Refunds inherit linked purchase metadata while retaining their posting date and
actual account. Salary, ordinary income, investments and repayments are excluded.
Services are separated by recorded account; missing accounts stay explicit.

The next-30-day list uses the existing shared recurring-payment resolver. Unique
known payments are counted once and placed under Already recorded rather than
displayed as unpaid charges. Amount/date proximity alone cannot clear a schedule.
Possible payments, nearby refunded charges, overlapping schedules and stale
amounts are placed in Needs review separately from Expected. Refund review opens
the original charge and its linked refund evidence; it does not count the same
charge as another unpaid payment. These are estimates, not statements of debt.

All active subscription rules remain in scheduled totals until the user edits
them. Connected overlap groups are shown once, with links to review each reminder.
The app does not infer duplicate billing, pause reminders, cancel a provider plan
or remove a commitment automatically. The existing schedule editor remains the
only save/pause/delete path.

Weekly rules use the established 52/12 monthly equivalent; yearly rules retain
their saved annual amount. Annualised totals are frequency estimates, and monthly
rounding can differ by a few paise. Yearly dates remain labelled anniversary
estimates because the model infers their month from creation metadata.

## Charge and reminder suggestions

A charge-change signal needs a known account, three monthly charges with
24–36-day gaps, two stable prior amounts, and a change of at least ₹20 and 10%.
Linked refunds suppress the signal. The evidence view shows all three actual
charges. A saved monthly amount inconsistent with this evidence moves its future
projection into Needs review; the historical charge is never presented as proof
of paying the next occurrence. Historical-cycle views do not use later charges
to generate their charge-change signals.

Repeated-payment suggestions require the existing cadence/tolerance checks,
subscription categorisation and a known payment account. Paused reminders remain
respected, refunded payments do not train recurring suggestions, and parent and
sub-brands stay separate. Merchant names and matching description fields share a
service identity so an existing reminder is not suggested again. Unknown payees
retain their digits. Strict labelled UPI routing layouts use the actual payee;
a recipient's bank name cannot stand in for a subscription merchant.

Creating a reminder opens the existing prefilled editor for confirmation. It
does not add a transaction or a commitment until saved. Editing a reminder affects
this app's schedule; provider cancellation is a separate action with the provider.

## Dates, privacy and verification

Horizon dates use the Indian calendar date. Candidate cadence uses calendar-day
gaps; suggested due days preserve date-only wall dates. Anniversary-month helpers
now interpret timestamp metadata in India and preserve date-only creation months,
consistently across occurrence enumeration, next dates and overlap checks.

Figures respect hidden balances. Details resolve from current data and close if
their selected service/schedule disappears. Mobile browser checks at
320/390/768/1024px cover recorded payments, overlap review, charge history,
prefilled reminders without saving, privacy and unchanged synthetic ledger/rules.
Engine regressions cover refunds, account separation, stale amounts, paused
plans, parent/sub-brands, routing banks, weekly/yearly rules, custom subscription
children and Indian day/month boundaries, including a non-Indian host timezone.

This phase adds read-only analysis and reuses existing user-confirmed editors.
It requires no schema update, paid service, provider connection or new budget.
