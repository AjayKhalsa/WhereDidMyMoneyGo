# Budget and cash-flow visuals

Overview's existing Spending pulse defaults to Budget pace, with Compare and Daily views retained. The budget line reaches the selected cycle's spending allowance at cycle end. Recorded consumption stops at the current Indian calendar day; future actuals stay absent. Bills are included, so an early large bill can run above the even pace. An unsaved default budget is labelled suggested. The day slider opens original payment evidence.

Explore contains the cash-flow Sankey and six salary cycles of income versus spending. Both load only in Explore and use the FinanceContext personal projection: linked gifts/reimbursements reduce your share, pass-through money is excluded, and saved bank entries remain unchanged. No charting dependency, API, write, or database migration is added.

## Flow accounting

Spending is purchases minus posted refunds; ordinary credits remain income. Refunds keep their posting cycle and inherit the linked purchase's category. Gold and other investment contributions are destinations, while explicitly linked returned principal is a separate source. Card repayments and ordinary transfers are excluded.

Positive net spending categories form destinations. Negative categories become positive net-refund sources. If destinations exceed recorded sources, a labelled Gap to income balances the diagram. If sources exceed destinations, Left to allocate balances it. Every source and destination sum equals the same total in exact paise. Ribbons share one amount scale; minimum label-row height changes spacing only.

Left to allocate is the cycle's income plus returned principal minus personal net spending and investment contributions. It is not a bank balance or safe-to-spend: past cash, existing debt, held money timing, future bills and planned contributions need their separate receipts on Home. A gap is not proof of borrowing. No unreceived income or planned investment is plotted as an actual flow.

## History and interaction

The history view shows five preceding cycles and the selected cycle. Partial cycles are labelled; absent records use dashed placeholders. Refund-heavy spending can extend below zero using the same unit scale as all positive bars. Early salary follows existing reporting attribution and is counted once. Tap a month for dates and income/spending/investment evidence.

All figures use the privacy formatter; plots are removed when balances are hidden. Native buttons and range inputs support keyboard interaction. Day/cycle/node selections reset with month navigation. Line animation follows the existing reduced-motion styles. Synthetic browser checks cover phone and desktop layouts and ledger immutability.
