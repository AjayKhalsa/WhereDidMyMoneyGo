# Frequent Gmail sync with GitHub Actions

GitHub Actions calls the existing `/api/cron/gmail` endpoint every four hours (six times daily).
Vercel retains its Hobby-compatible nightly `30 21 * * *` job. No new Gmail
integration, database migration or financial write path is introduced.

## One-time activation

1. Merge the workflow to the repository's default branch (`main`). Scheduled
   workflows do not start from a PR branch. Ensure Actions is enabled for the repo.
2. Open **GitHub → Settings → Secrets and variables → Actions → New repository
   secret** and add `CRON_SECRET`, using the **same existing value** configured
   in Vercel. Do not generate a different value, expose it in a repository variable,
   commit it, or paste it into chat. This connection cannot read/manage those
   repository secrets (GitHub returned HTTP 403).
3. The default production URL is
   `https://where-did-my-money-go-chi.vercel.app/api/cron/gmail`. If the canonical
   production domain changes, set repository **variable** `GMAIL_SYNC_URL` to its
   full HTTPS endpoint. No secret, query string or redirect belongs in that URL.
4. Open **Actions → Gmail sync → Run workflow**, using `main`, and check the result.
   A successful run must say the backlog completed; opening an endpoint or returning
   HTTP 200 alone is not sufficient. A disconnected mailbox fails with a setup hint.
5. Confirm the app's last-sync timestamp advances and review any pending financial
   decisions. Scheduled dispatch is not a promise of exact delivery time.

Secret settings: https://github.com/AjayKhalsa/WhereDidMyMoneyGo/settings/secrets/actions
Workflow runs: https://github.com/AjayKhalsa/WhereDidMyMoneyGo/actions/workflows/gmail-sync.yml

## Timing

`47 3,7,11,15,19,23 * * *` is UTC and targets **01:17, 05:17, 09:17, 13:17, 17:17 and 21:17 IST**.
The offset avoids deliberately starting at the same time as the Vercel nightly job
at 03:00 IST. GitHub can delay or drop scheduled dispatches under load; public
repositories may have scheduled workflows disabled after 60 days without activity.
Keep the nightly fallback, watch Actions failures and do not certify uninterrupted
sync from the presence of a workflow file.

The Vercel multi-run proposal in PR #25 is superseded by this approach; do not merge
that unsupported Hobby expression. Settings describes the four-hour Actions
target and nightly fallback; both update the same last-sync/backlog information.

## Reliability and privacy

- The workflow has only read access to repository contents, a pinned checkout,
  no persisted checkout credentials and no dependency installation.
- The secret is passed only to the sync-caller step. The caller never prints
  headers, response bodies, mailbox identities, transaction content or raw
  exception messages. Its summary contains only completion state and counts.
- HTTPS is required. Redirects are rejected so Authorization is never forwarded
  to a different destination. Authentication failures stop immediately.
- A run makes at most six requests with a 70-second per-request timeout, inside
  a ten-minute job budget. Transient errors, busy leases and incomplete responses
  can continue safely because the endpoint already serializes writes and deduplicates.
- HTTP 202 means unfinished work. The caller continues within its budget; if the
  backlog is still unfinished, the job fails visibly rather than claiming success.
- Actions concurrency prevents overlapping scheduled/manual runs of this workflow.
  The existing server lease handles overlap with Vercel or the app's Sync now.
- Counts describe this run. Repeating a request after a lost response can match
  saved rows rather than recount an earlier insertion; no duplicate is intended.
- Use GitHub's Actions failure notifications if desired. Existing app push alerts
  still depend on their own server keys/device permissions. A failure before the
  endpoint is reached can only appear in Actions, not in the app's push system.

Connection and retry errors now carry controlled codes so revoked Gmail access
is not confused with a cron-secret mismatch. See [connection recovery](gmail-connection-recovery.md)
for checkpoint preservation, quota handling and Google's OAuth Testing limit.

Run `python3 -m unittest discover -s tests/automation -v` to test the caller without
network or real credentials. These are caller/contract tests; production activation,
actual Gmail token health, repository secret configuration and successful device
notifications must be verified in the real deployment.
