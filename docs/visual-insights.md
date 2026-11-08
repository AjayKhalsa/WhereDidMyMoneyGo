# Visual Home and Insights

The November visual refresh keeps the existing financial engines and write paths. It changes presentation only; no migration, ledger backfill, paid service or new AI calls are required.

- Home uses a softly shaded primary balance card and four compact summary tiles. Helpful summaries and income evidence remain visible/reachable. Bank/card colours retain their existing meaning.
- Insights opens on Overview: spending pulse, largest category changes, merchant bars, payment mix, a short list of observations and the spending calendar. Explore retains filters, tags and transaction-level questions. Tools retains affordability, score and recap; AI analysis is explicitly opened there. Cycle replay is no longer mounted on the page.
- The pulse reuses `spendingDrivers` and `spendingTrend`. Comparisons use the same number of elapsed cycle days, including unequal-length cycles. A Total/Daily switch and keyboard/touch day slider expose exact values and source transactions. Historical selection remounts the day selection. Refunds can make lines/bars negative. No forecast is presented as fact.
- Payment-ring shares use gross purchases; adjacent rows label their after-refund amounts as net. Zero-purchase/refund-only cases have an empty ring and signed net rows. Transfers, card repayments, ordinary income and investments are excluded by the existing consumption engine.
- Category change bars share a zero divider: lower spending left, higher spending right. Merchant bars retain signed textual amounts for refunds. Unknown merchants/accounts remain explicit.
- Money masking removes chart geometry as well as masking amounts in labels and transaction drilldowns. Reduced-motion users get no new entrance or width animation. Charts use SVG and native controls; no chart library or network dependency is added.

Verification: existing financial/scheduler regressions, production build and typecheck; local browser tests with synthetic IndexedDB fixtures cover 320/390/768/1440 widths, Total/Daily switching, keyboard day selection, source/category transaction sheets, view navigation, privacy and reduced motion. Financial source records are not modified by any new chart interaction.
