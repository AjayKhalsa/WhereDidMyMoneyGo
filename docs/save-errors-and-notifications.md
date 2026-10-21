# Save compatibility and push alerts

## Transaction saves

The reported screenshot shows a `put:transactions` error whose underlying message is truncated. The exact production error has not been recovered. A known compatible cause is deploying timestamp code before applying migration 0020: Supabase rejects the newly sent `timing`/`enrichment` columns even for a category-only edit.

For confirmed missing-column errors (`PGRST204` or `42703`) mentioning those two columns, the adapter may retry only after removing empty metadata (unknown/date timing or null enrichment). It never discards known clocks, automated rule evidence, financial fields, manual descriptions or contexts. It does not retry network, permission, constraint or unrelated schema errors. Meaningful metadata requires migration 0020 and produces an actionable message. Apply that migration through the normal database deployment process; if already applied, reload PostgREST's schema cache with `NOTIFY pgrst, 'reload schema';` and retry. Do not rerun an already-applied migration blindly.

Errors wrap instead of truncating and remain in the open transaction editor until another save attempt. Category-only edits preserve the original stored wall-clock even when that clock is unverified, avoiding incidental stale reconciliation checkpoints. The clock remains unknown for categorization. The actual-time control and Now button use separate grid columns on narrow screens.

## Push deployment

This feature adds notifications only; it does not modify financial transactions or reconciliation records.

1. Apply `0021_push_notifications.sql` after 0020. It adds an RLS-enabled server-only table and a service-role-only registration RPC. The existing `GMAIL_TOKEN_KEY` encrypts subscriptions with a separate `push:<user>` authenticated context. Keep the encryption key stable.
2. Generate a VAPID key pair in a trusted local terminal using `npx web-push generate-vapid-keys`. Store `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (an operator contact `mailto:` URI or HTTPS URI) in Vercel's server environment. Keep the private key out of chat, Git and browser code. Only the public key is returned to the authenticated browser. Preserve the existing Gmail/Supabase/cron configuration.
3. Deploy the code. Reload the app to activate its updated service worker, then open Settings → Phone & browser notifications → Enable on this device. Permission must be granted from a user gesture; it cannot be granted remotely. On supported iPhones/iPads, install to the Home Screen and open that app first (iOS/iPadOS 16.4+).
4. Send a test notification. Provider acceptance is not proof of device display; confirm it arrives on the device. Verify a controlled failed/incomplete scheduled sync in a nonproduction environment before relying on delivery.

The existing nightly cron sends a generic alert when it fails or ends with pending work, at most once per device per IST day. No amounts, bank identities or transaction details appear on the lock screen. Claims precede delivery to avoid concurrent duplicates; a crashed/failed delivery can therefore be missed until a later day. Delivery failure is recorded in Settings. Expired subscriptions (404/410) are removed. At most eight devices can be registered per user. Endpoints are restricted to known HTTPS push providers to avoid server-side requests to arbitrary hosts. New provider domains require an explicit allowlist update.

These alerts depend on cron executing. They do not constitute an external watchdog and cannot detect a job that never starts. The Settings stale indicator still reports an old sync; external uptime monitoring is a separate deployment task. Push is best effort and depends on network, browser/OS permission, service-worker installation and the push provider. No actual device delivery or live configuration was verified in this workspace.

A separate ChatGPT task was created at the user's request for monthly statement validation, on the first day of each month around 10 AM Asia/Kolkata. It is not stored in this application's database. Enable ChatGPT phone/browser notifications to receive that task's reminders. It does not access the bank or ledger automatically.

The user confirms statement reconciliation was completed in another chat. Preserve it and validate new statement coverage; do not treat unavailable evidence in this workspace as proof that reconciliation was never done.
