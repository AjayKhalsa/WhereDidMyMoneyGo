# Category bars by payment source

Home's category totals retain the existing net-outflow basis and cycle. Each bar splits that same activity by the actual recorded payment account: credit cards (purple), bank accounts (green), cash (amber) and unknown sources (grey). Bank accounts are not assumed to be savings accounts when their subtype is not recorded.

Tap a category for exact source amounts and its transactions. Tap a source in that sheet to filter the list. Repeated equal-value transactions remain separate. “View all” retains the existing broader money-flow view.

Refunds and ordinary category credits reduce the source account that received them, using the existing linked-purchase category attribution. A negative source segment extends left of a common divider rather than being clamped away or reassigned to a different account. Positive segments extend right; their signed sum equals the displayed category total. Card repayments, own-account transfers, investments and adjustment entries are excluded just as they are in the existing category breakdown. Missing or unsupported account identities remain unknown; archived account types remain usable for historical attribution.

Source names, amounts and transaction evidence are available without relying on colour alone. Amounts and chart accessibility labels respect the existing privacy control. No database, ledger, category, sync or financial balance changes.

Focused regressions check repeated payments, repayment exclusion, category/source sum conservation, cross-cycle refund attribution, credits larger than purchases, cash/unknown/archived accounts and salary exclusion. Chromium checks at 320/390/768/1024 cover colours, source drill-down/filtering, negative credits, privacy and overflow. Build and TypeScript validation complete the release checks.
