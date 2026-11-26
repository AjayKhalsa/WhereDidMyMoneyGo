# Investment targets for one cycle

Money → Investments → Adjust this month changes an investment's planned target for the selected salary cycle. The slider and exact amount field edit the same value. Zero pauses that cycle's plan; Use usual plan removes its override.

`Investment.monthlyContribution` remains the usual plan. `cycleTargets` maps exact cycle start dates (such as `2026-11-24`) to paise. An absent key uses the usual plan; overrides never carry forward. The field travels with the investment through IndexedDB, Supabase, and JSON exports. Investment ownership policies cover it in Supabase.

The shared `investmentTarget` resolver drives investment rows, Money's summary, and safe-to-spend reserves. Each investment reserves `max(0, target − posted contributions for that investment)`. Changing a target does not create a transaction, alter recorded contributions, change portfolio value, or debit a bank account.

Budgets retains the saved overall investment allocation as its usual planning figure. With a cycle override, its summary shows the total of the individual cycle targets and labels the usual allocation separately. Editing spending allowances cannot persist a cycle target as a future budget. This keeps a temporary reduction explicit.

Apply `20261126183108_investment_cycle_targets.sql` before deploying the client. It adds an optional JSONB column and validates real dates and non-negative integer paise within JavaScript's safe range. Existing investment plans default to an empty override object; no financial rows or usual plans are backfilled by the migration.
