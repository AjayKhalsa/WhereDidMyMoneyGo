# Daily spending calendar

Insights → Spending by day shows the selected pay cycle as a Monday-first calendar,
including cycles crossing calendar months. The summary and each day's detail use
recorded purchases minus posted refunds. The highest day is ranked by net spending,
with the earliest date breaking a tie. Negative days represent net refunds, while
days with activity and zero net spending retain their activity dot.

Tapping a past/current date opens its original ledger rows, purchase/refund totals
and the credit card, bank account, cash or unknown-account split. Archived account
types remain available. Repeated equal payments retain their distinct IDs. Salary,
ordinary income, investments, transfers/card repayments and balance adjustments
are excluded. A linked refund inherits the purchase's spending eligibility while
retaining its actual account and posting date; an earlier-cycle purchase is not
pulled into the current cycle.

Dates use the Indian current day and the existing verified-clock cutoff. Unknown
transaction times still support day-level totals. Future dates and verified future
times do not enter the totals. Calendar layout uses wall dates and preserves leap,
clamped pay-cycle and host-timezone/DST boundaries.

An empty day says **No spending recorded**. It does not assert a no-spend day or
complete bank coverage. Calendar intensity compares positive net spending within
the cycle; net refunds use a separate colour and accessible text. Hidden balances
remove amounts from text and accessible labels and replace value-based colours
with uniform cells. Counts, dates and presence of entries remain visible, matching
the app's balance privacy convention.

The view is derived locally from the complete financial store. It has no financial
write path, new permissions, migration, paid lookup, budget setup or notification.
