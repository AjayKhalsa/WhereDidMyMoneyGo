# On-demand explanations

Keep default screens focused on financial figures, statuses, transactions, useful observations and actions. Routine descriptions and calculation guidance belong behind a tappable information icon rather than persistent paragraphs.

- Home has no data-quality card. The full report is available through information controls in Insights and Settings.
- Home's safe-to-spend information icon opens the existing calculation sheet. The balance, status and cycle remain visible.
- Shared page/section descriptions, Money stat explanations, upcoming-payment guidance and spending-chart/comparison notes use `InfoButton`.
- `InfoButton` uses a native auto popover with an accessible name, keyboard activation, Escape, close button and outside-click dismissal. Help content mounts when opened; data-quality requests therefore do not run merely because a hidden report exists.
- Keep actual financial results, meaningful dates, expected/recorded statuses, errors, unresolved discrepancies and review actions visible. Do not replace useful insights with information icons.

No financial logic, ledger data, categories, database schema or environment variables change. Validation covers production build/type checks and Chromium phone/tablet widths, help interactions, Home removal and report availability in Insights/Settings. Native popovers require a modern browser (Chrome 114+, Safari 17+, Firefox 125+); the app's current phone/browser targets support them. Safari itself was not exercised in the development checks.
