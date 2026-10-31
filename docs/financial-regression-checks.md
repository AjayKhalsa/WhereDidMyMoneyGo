# Automatic financial regression checks

The **Financial regression checks** GitHub Actions workflow runs for pull
requests targeting main, pushes to main and manual dispatches. It checks:

- The complete TypeScript suite, including tagging and merchant rules,
  refunds, repeated payments, SIPs, investment redemptions, safe-to-spend,
  recurring payments, Gmail parsing and isolated database invariants.
- Python tests for the Gmail scheduler caller, retry limits, authentication
  error handling and the existing four-hour schedule.
- Spending calendar, spending comparison and subscription regressions from
  America/Los_Angeles to catch Indian calendar boundaries.
- A production build followed by TypeScript checking after Next generates routes.

Dependencies install from the lockfile on Node 22.20.0. Each change gets one
bounded job; newer runs cancel obsolete runs for the same PR or branch.
Third-party actions are pinned to commit SHAs. Checkout does not persist
credentials, job permissions are contents-read only, and no application or
production secrets are supplied. Tests use synthetic fixtures, mocked external
calls and isolated PGlite databases. The workflow never invokes the live sync
caller against production, applies a migration or changes the live ledger.

A failure stops the remaining steps and shows which check failed in Actions.
The success summary appears only when every check succeeds. Existing Gmail
sync and Vercel fallback schedules are unchanged.

These checks provide repeatable regression evidence, not proof that all bank
emails were received or every ledger entry agrees with a statement. Browser
interaction checks and real-data dry runs remain separate when relevant.

The check is named **Financial tests and build**. Adding a workflow does not
enable a branch-protection rule or a Vercel Deployment Check. Maintainers should
wait for this check before merging; automatic enforcement requires configuring
that check as required in repository rules. Direct pushes to main can still
deploy through the existing Vercel integration while their tests run.
