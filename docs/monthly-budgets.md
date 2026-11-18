# Monthly budgets

Open **Budgets** from the main navigation. Plans use the same salary cycle as Insights. The default salary is ₹1,40,000, allocated to ₹50,000 regular expenses, ₹10,000 planned expenses, ₹30,000 gold repayment, ₹40,000 other investments and ₹10,000 emergency saving.

Adjust amounts and category mappings, then save. Changes take effect in the selected cycle and continue until another saved version starts. Earlier saved versions remain intact. Before the first saved plan, historical views show an explicitly labelled comparison with proposed defaults.

Leaf category mappings override parent mappings. Dining with a People → Dating context goes to Dates; other dining goes to personal food. Each expense counts once. Unmapped expenses remain visible with a zero allowance. Refunds subtract from the original transaction's bucket when linked, otherwise from their recorded category. Balance adjustments, ordinary income, transfers and investments never count as spending. Negative category totals can occur when refunds relate to older purchases.

Investment transactions linked to a GOLD vehicle count toward gold repayment; other investment transactions count toward the other-investment target. No existing transactions are automatically reclassified. Emergency progress counts transfers explicitly linked to a goal with “Emergency” in its name. The planned-expense allowance measures consumption, not inferred bank deposits, and does not roll over. Investment and emergency contributions are shown separately and never scored as spending.

Saved budget adherence accounts for 15% of the financial score; existing factor weights are scaled to 85%. The adherence measure subtracts total individual bucket overshoots as a percentage of the overall spending allowance from 100, bounded to 0–100. Under-spending elsewhere cannot hide a category overrun. Before five days have elapsed, or with no recorded expenses, this factor is omitted. Forecasts are linear estimates from recorded cycle spending and may be distorted by missing imports or one-off purchases.

Persistence uses `profiles.budget_plans`, covered by the existing owner-only profile RLS policies, and the existing profile store for IndexedDB. The additive migration must be applied before users save budgets. The selected account's November 2026 defaults were saved during implementation. No personal financial data is committed to the repository.
