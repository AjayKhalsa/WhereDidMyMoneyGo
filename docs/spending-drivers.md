# Spending drivers and merchant insights

Insights now opens with “Your spending, explained”: the categories driving a
change, the merchants receiving the most spending, and a card/bank/cash/unknown
account split. Every row opens its exact ledger entries through the existing
transaction editor. Help stays behind one information icon; no budget or shared
space setup is required.

## Calculation rules

- Consumption means purchases minus recorded posted refunds. Ordinary credits,
  salary, investments, transfers/card repayments and adjustment categories are
  excluded. Refunds inherit the linked purchase's category and merchant, but
  remain on their actual posting date and actual refund account.
- Comparisons align the first N days of the selected and previous pay cycles.
  N is the smaller of elapsed selected-cycle days and previous-cycle length.
  For unequal full cycle lengths, both prefixes have equal length. Their exact
  ranges are visible. Category changes sum to the displayed comparison delta.
- Merchant and payment-source cards cover the full selected cycle to date,
  including days beyond a shorter comparison window. They are labelled “This
  cycle”; their drilldowns show that full date range.
- Merchant payment counts and averages use purchases, not refund notices.
  Average is gross purchase amount divided by purchase count. The headline
  merchant amount is net after refunds. Refund-only groups can be negative.
- Recognised merchant variants share a display identity, with parent/sub-brands
  separated. Unknown saved payees retain their digits and names. A merchant is
  never inferred from an unstructured description; absent metadata stays visible
  as Merchant not recorded.
- All account types, including archived accounts, contribute to the source split.
  Missing or unsupported account types remain Account unknown. Positive net
  amounts determine bar lengths; net refunds remain signed amounts.
- Future dates and future verified transaction times are excluded. Cycle-day
  arithmetic uses the Indian calendar date. No email time is invented.
- A percentage needs a positive previous net amount and nonnegative current net
  amount. Missing history or a zero/negative baseline never produces an infinite
  percentage or an unsupported savings claim.

## Interaction and verification

Category changes offer current/previous period tabs; merchant and payment-source
drilldowns use the selected cycle. Selection resolves from the live derived report
so edits recalculate figures and included rows. Switching cycles closes the old
detail. Monetary text and source bars respect the existing hidden-balances mode.

Engine regressions cover refunds, repayments/salary/SIPs, unknown metadata,
archived cards, previous-only categories, comparison reconciliation, unequal and
clamped cycle lengths, Indian day boundaries and future transactions. Browser
checks at 320/390/768/1024px exercise the real Insights page using synthetic local
data: aligned comparisons, merchant averages, refund-inclusive card drilldown,
previous-cycle selection, unknown merchants, privacy and no overflow/page errors.

These are views of recorded ledger data; complete bank coverage still requires
statement reconciliation. This phase adds no data writes, paid services, schema
changes or new capture requirements.
