# Gmail connection recovery

This phase improves connection/error recovery without changing the ledger, parsing rules, Gmail scopes or job frequency. No database migration or new environment variable is required.

## Google failures

The server classifies allowlisted Google error codes and returns controlled application codes. Revoked/expired refresh grants and missing read-only permission request reconnection. Invalid OAuth clients/scopes and missing server configuration request setup repair. Quota/rate limits, outages, malformed responses and network failures remain temporary failures. Raw provider descriptions, messages, tokens and request exceptions are never returned or logged.

The Actions caller retains only allowlisted error codes and bounded numeric retry metadata from HTTP failures. It distinguishes a revoked Google grant from an invalid cron secret and stops retrying configuration failures. Short rate-limit pauses are honoured; pauses over 30 seconds end this run visibly rather than violate the provider pause or exceed the job budget. Existing bounded retries and resumable queues remain in use. A quota failure never resets a scan or disconnects Gmail.

## Reconnection

After validating the signed OAuth state, an existing connection acquires the same mailbox lease used by sync before exchanging the authorization code. A verified same-address, read-only grant changes only encrypted refresh credentials and clears the old connection error. The original start date, financial cursor/scan bounds, last completed scan, aliases and receipt checkpoint are preserved. A busy or expired lease, denied/wrong-account authorization or failed token exchange cannot overwrite saved progress. A first connection uses an insert rather than an upsert so a concurrent connection cannot be reset. The OAuth cookie is cleared and refreshed app-auth cookies are preserved.

No agent-initiated production reconnect or credential rotation was performed for this release. These are future user-consented connection behaviours.

## Status and interface

Settings shows the actual configured four-hour Actions target and nightly 03:00 IST fallback, with a 12-hour stale threshold. Unfinished receipt discovery contributes to incomplete status without exposing its raw cursor. After a manual sync error, connection status refreshes so a required reconnect button appears immediately. Setup/quota failures do not show an unnecessary reconnect button, and duplicate copies of the same error are avoided. Home's information density is unchanged.

The collapsed connection help links to Google Auth Platform → Audience. Google documents seven-day refresh-token expiry for external OAuth apps in **Testing** when Gmail scopes are requested. Publish appropriately and reconnect once to renew the grant if transitioning from Testing. Production status does not prevent later revocation, password/security changes or removed permission. The actual publishing status of this project's Google OAuth app was not accessible through the current connection and has not been changed or claimed verified.

References: [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration), [OAuth app audience](https://console.cloud.google.com/auth/audience).

## Validation

Google-error tests cover revoked versus misconfigured grants, resource permissions, cursor errors, rate limits, date/numeric retry headers, outages and safe error responses. Callback integration tests cover successful reconnect preservation, busy/expired leases, wrong mailbox, failed/setup exchanges, first connection and racing inserts. Caller tests cover controlled metadata only, malformed metadata, actionable messages and bounded retry pauses. Health tests include receipt backlog, stale checks and the four-hour schedule. Browser checks use mocked status/sync endpoints and synthetic local state; they do not exercise real OAuth consent or change the live refresh token.

Release validation and production workflow status are recorded separately after deployment. No permanent-connection or universal-email-coverage guarantee is implied.
