# Smart money notifications

The Home bell opens the live inbox. Settings → Notifications has collapsed alert preferences, quiet hours and phone/device controls. Alerts always use today's salary cycle, even when another month is selected elsewhere. Financial rows, balances, budgets and investment targets are never changed by notification checks.

## Signals

- Bills: saved expense schedules due in the next three days or up to three days overdue. Explicit payment links and unique recognised payments clear reminders. Processor labels, changed amounts, overlapping schedules and refunded linked charges prompt review instead of another payment.
- Cards: unpaid **statement remainder**, due within three days or up to seven days overdue. Unbilled outstanding is excluded. Issuer evidence is distinguished from a ledger estimate. Recorded repayments reduce the remainder.
- Budgets: category limits used up, total budget used up, or a category at 80% and ahead of elapsed-cycle pace by more than five percentage points. Uses actual posted personal spending, including linked reimbursements, gift funding, pass-through exclusions and refunds.
- Weekly recap: last completed Monday–Sunday; personal spending and recorded investment contributions. No recap is invented for an empty week.
- Sync: failed, unfinished or more than 12-hour-old Gmail checks. Only sanitized status and check times enter notification responses.

Read and dismissed choices persist per user across devices. Resolved conditions leave the active inbox automatically. Due-date stages and budget 80%/100% stages have separate keys: dismissing an early warning does not silence the later deadline. The inbox is a current signal list, not a permanent activity archive. Amounts follow the app's privacy switch.

## Delivery

The existing four-hour GitHub Actions workflow checks alerts in an `always()` step independent of Gmail success. It reuses CRON_SECRET and derives `/api/cron/notifications` from the validated canonical Gmail origin. Vercel also checks daily at 09:15 IST; the original Gmail fallback is unchanged. Both callers reject redirects. Delayed schedules mean alerts are periodic, not exact-time guarantees.

All money signals are grouped into at most one push per user per IST day; sync has its own once-per-day cap. Quiet hours default to 21:00–09:00 IST. Generic lock-screen copy is the default; names/amounts require an explicit preference. The app still shows alerts with phone push off or permission denied. Service-worker destinations use an explicit same-app allowlist.

A server-only delivery record has a five-minute lease and unique token. Concurrent jobs cannot claim the same channel/day. Failed delivery can retry after an hour, at most twice a day. The same provider tag coalesces retries. Any accepted device delivery completes the group; acceptance is not a read receipt or proof of phone display. Devices that miss a partially accepted group can still review it in the inbox. Expired endpoints are removed; other failures remain visible and reconnectable in Settings. Tests are rate limited to once per device per minute.

Retain the existing VAPID keys and GMAIL_TOKEN_KEY. Subscriptions remain encrypted in the existing server-only table, with an eight-device cap. Phone permission requires a user gesture. On supported iPhone/iPad devices, enable from the installed Home Screen app. Use **Send test** there to confirm physical delivery.

## Data and deployment

Apply `20261127064307_smart_notifications.sql` before deploying this code, after the existing migrations. It adds preferences, bounded read/dismiss/push state, dispatch leases and device metadata. Authenticated users have owner-only SELECT on preferences/state; mutations pass through authenticated same-origin API routes. Dispatch and sync-status RPCs are SECURITY INVOKER, executable only by service_role. Full counted owner-scoped financial loads must finish before scheduled rules run; partial history is rejected.

State is capped at 2,000 rows per user and pruned after 90 inactive days on mutation. Dispatch history is pruned after 90 days on a new claim. The recipients RPC processes up to five users with registered devices per run, rotating by oldest check time; revisit this bound before a multiuser launch. It reads no bank API: reminders depend on saved payment/schedule data and cannot detect a scheduler that never runs.

Verification includes pure financial cases in UTC and America/Los_Angeles; isolated Postgres owner/privilege, lease, retry and daily-cap checks; API authentication, origin and owner-scoping checks; capped-history loads; mocked push delivery and expiry; Python scheduler safety tests; and synthetic browser flows for inbox, preferences, payment resolution, privacy, device recovery and narrow layouts. No real notifications or financial writes are needed for these checks.
