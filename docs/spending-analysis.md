# Spending analysis and motion refinement

Home's balance returns to an open layout: no enclosing gradient card or nested container. The deficit label is “Shortfall after commitments”, describing the calculation rather than implying a user-set budget. Existing useful explanations and the liquid-cash disclosure remain.

Insights adds an arithmetic explanation of the change in consumption spending using the same equal-day prefixes as spendingDrivers:

- Count effect = (current count − previous count) × mean of both average purchase sizes.
- Average-size effect = gross spending change − count effect.
- Refund effect = previous refunds − current refunds.

The effects reconcile exactly to net spending change in paise. Splitting the count/size interaction equally avoids picking one period's weights. Size includes purchase mix; it is not a claim of merchant price inflation. The headline chooses a contributor in the direction of net change, so an offsetting effect cannot be described as driving the opposite result. When no purchase average exists, show the gross purchase change without a fabricated frequency/size split. No prior history means no comparison. Recorded history is not proof of complete statement coverage.

A three-largest-purchases concentration callout uses gross purchases for both numerator and denominator, with transaction evidence. Income, investments, repayments and refunds cannot enter that selection. Calculation is read-only and retains source transactions.

Motion: cumulative lines draw once, payment rings reveal on entering the viewport, Total/Daily changes fade, selected chart points move smoothly and analytical bars transition on data changes. Figures remain immediately available. Reduced-motion preferences disable the new animations; privacy removes chart geometry. No external library, API, AI call or financial data write is introduced.
