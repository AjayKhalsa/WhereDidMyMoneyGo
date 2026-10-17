# Gmail alert sync

This integration is optional. Without its server configuration, Settings shows
that setup is pending and no emails are read or transactions written.

## Google setup

1. Sign in to [Google Cloud](https://console.cloud.google.com/) with the Gmail
   account used to sign into the budget app. Create a project for this app.
2. Enable **Gmail API** in APIs & Services → Library.
3. Configure Google Auth Platform with an External audience and your own email
   as a test user. Use the app name and your contact email.
4. Add only `https://www.googleapis.com/auth/gmail.readonly` under Data Access.
   This grants mailbox-wide read permission; filtering to bank senders happens
   in this app. No send, delete, or mark-read permission is requested.
5. Create a **Web application** OAuth client with the exact redirect URI:
   `https://where-did-my-money-go-chi.vercel.app/api/gmail/callback`.
   For local development, add `http://localhost:3000/api/gmail/callback` separately.
6. Store the client ID and secret directly in Vercel environment settings as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Do not paste secrets into chat,
   commit them, or expose them through a `NEXT_PUBLIC_` variable.

Google's External **Testing** mode expires Gmail refresh tokens after seven days.
Use it for initial verification, then assess Production/personal-use eligibility
in Google's console for durable personal use. Public distribution may require
restricted-scope verification and additional requirements; do not claim verification
or bypass an OAuth warning. See Google's
[OAuth documentation](https://developers.google.com/identity/protocols/oauth2/)
and [verification exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Database and deployment

1. Apply `supabase/migrations/0013_gmail_sync.sql` to the existing database.
   It adds two server-only tables and atomic import functions; it does not edit
   existing transactions. Anonymous and signed-in browser roles cannot read tokens.
2. Set `SUPABASE_SERVICE_ROLE_KEY` on the server from the existing Supabase project.
   It must never be returned to a browser or printed in application logs.
3. Set `GMAIL_TOKEN_KEY` to 32 random bytes encoded as 64 hex characters, and
   `CRON_SECRET` to a separate random bearer secret. Keep the encryption key stable
   across deployments; losing it requires reconnecting Gmail. Generate these with
   a cryptographically secure generator and store directly in the environment.
4. Set `APP_ORIGIN` to the production origin above. Set it to `http://localhost:3000`
   only in local configuration. Deploy the application and `vercel.json`.
5. Settings → Gmail transaction alerts → choose start date → Connect Gmail.
   The user must authorize Google access for the same email as the app account.
6. Sync now processes up to six batches per click. Repeat if more alerts remain.
   Resolve unknown account/card matches in the queue. A remembered mapping affects
   future alerts; it never changes historical ledger entries.

The cron checks one connected mailbox daily around 08:00 IST (Hobby scheduling is
approximate). This is a personal-app implementation, not a multi-tenant scheduler.
Each invocation queues 25 message IDs and processes a bounded batch. A durable
cursor and seven-day scan overlap handle pagination and recently delayed mail.
Daily execution continues a backlog; Sync now catches up sooner. Very late alerts
beyond the overlap require reconnecting with an earlier start date. If production
traffic exceeds batch capacity, increase cadence on an appropriate hosting plan
and monitor the backlog rather than assuming every alert has been processed.

## Import rules and limitations

- Only observed purchase layouts from the allowlisted HDFC/ICICI/Axis/HSBC senders
  are parsed. Amounts are integer paise. Dates are taken from the bank's body.
- Only authenticated, known-account, known-category purchases are auto-logged.
  New senders/layouts, credits, refunds, transfers and unknown merchants wait for
  review. A statement attachment is not automatically imported.
- One email can create at most one transaction. A bank reference deduplicates
  repeated emails. Any existing ledger movement for the same account and amount
  within three days blocks automatic insertion and requires explicit review.
- Manual and subsequent statement imports should still be reviewed: this feature
  cannot prevent a separate import path from adding a later duplicate. It never
  overwrites balances, reconciliation dates or existing entries to force a tally.
- Transaction facts, subject and message ID are stored; complete email bodies are
  not stored or sent to AI. Refresh tokens use AES-256-GCM with user-bound AAD.
- Disconnect revokes the Google grant and removes its encrypted token. Existing
  ledger rows and deduplication receipts remain, preserving safe reconnects.
- No amounts, account numbers, mailbox contents, tokens or raw upstream errors are
  logged by the integration. Gmail API calls are read-only except token revocation.

## Validation before activation

Run `npm test`, `npm run typecheck`, and `npm run build`. After applying the migration
and supplying credentials, verify consent, a small first sync, a repeated sync with
no added duplicates, cron authentication, and disconnect/reconnect against the live
account. Local tests cannot verify Google consent or deployed environment settings.
