"""Bounded, private GitHub Actions caller for the existing Gmail cron endpoint.

No Gmail/Supabase credentials belong here. The server retains all parsing,
leases, deduplication, financial decisions and token handling.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_REQUESTS = 6
TIMEOUT_SECONDS = 70
MAX_RESPONSE_BYTES = 65536
ERROR_CODES = {"gmail_reconnect_required", "gmail_server_setup", "google_temporary_failure", "google_rate_limited"}


class SyncJobError(Exception):
    """Messages are controlled here, never copied from upstream responses."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the Authorization header to a redirect destination.
        return None


def validate_configuration(url, secret):
    if not secret or not secret.strip():
        raise SyncJobError("Add the existing Vercel CRON_SECRET as a GitHub Actions repository secret named CRON_SECRET.")
    if any(c in secret for c in "\r\n"):
        raise SyncJobError("CRON_SECRET contains an invalid newline. Copy the existing value without extra lines.")
    try:
        parsed = urllib.parse.urlsplit(url)
        valid = (parsed.scheme == "https" and parsed.hostname and
                 not parsed.username and not parsed.password and not parsed.query and
                 not parsed.fragment and parsed.port in (None, 443) and
                 parsed.path == "/api/cron/gmail")
    except ValueError:
        valid = False
    if not valid:
        raise SyncJobError("GMAIL_SYNC_URL must be the canonical HTTPS URL ending in /api/cron/gmail, with no query or credentials.")


def request_sync(url, secret):
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + secret,
        "Accept": "application/json",
        "User-Agent": "WhereDidMyMoneyGo-GitHubActions",
    })
    try:
        response = urllib.request.build_opener(NoRedirect()).open(request, timeout=TIMEOUT_SECONDS)
    except urllib.error.HTTPError as error:
        # Preserve only controlled error metadata, never upstream messages,
        # mailbox content or credentials. Read is bounded for hostile responses.
        status = error.code
        safe = None
        try:
            raw = error.read(MAX_RESPONSE_BYTES + 1)
            value = json.loads(raw) if len(raw) <= MAX_RESPONSE_BYTES else None
            if isinstance(value, dict) and isinstance(value.get("code"), str) and value["code"] in ERROR_CODES:
                safe = {"code": value["code"]}
                delay = value.get("retryAfterSeconds")
                if type(delay) is int and 0 < delay <= 86400:
                    safe["retryAfterSeconds"] = delay
        except (ValueError, UnicodeError, OSError):
            pass
        finally:
            error.close()
        return status, safe
    with response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise SyncJobError("The sync response was unexpectedly large. Check the deployed endpoint.")
        try:
            return response.status, json.loads(raw)
        except (ValueError, UnicodeError):
            raise SyncJobError("The sync endpoint did not return JSON. Check the production URL and deployment protection.") from None


def run_sync(url, secret, fetch=request_sync, pause=time.sleep):
    validate_configuration(url, secret)
    totals = {"logged": 0, "matched": 0, "reviewed": 0}
    for attempt in range(MAX_REQUESTS):
        try:
            status, body = fetch(url, secret)
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            status, body = 0, None
        code = body.get("code") if isinstance(body, dict) and status >= 400 else None
        if code == "gmail_reconnect_required":
            raise SyncJobError("Reconnect Gmail in the app's Settings. Google access expired or was revoked; saved scan progress and ledger entries are preserved.")
        if code == "gmail_server_setup":
            raise SyncJobError("The Google OAuth app configuration needs attention on the server. Reconnecting Gmail or changing CRON_SECRET alone will not fix it.")
        retry_delay = body.get("retryAfterSeconds", 5) if code == "google_rate_limited" else 5
        if type(retry_delay) is not int or retry_delay < 1:
            retry_delay = 5
        if retry_delay > 30:
            raise SyncJobError("Google requested a longer pause than this job's retry budget. Saved progress is preserved; allow the quota pause before retrying.")
        if status in (401, 403):
            raise SyncJobError("Sync authorization was rejected. Check that GitHub CRON_SECRET matches Vercel and the production endpoint is reachable.")
        if 300 <= status < 400:
            raise SyncJobError("The sync URL redirected. Use its final canonical HTTPS URL; credentials were not forwarded.")
        if status in (0, 409, 429) or 500 <= status <= 599:
            if attempt + 1 < MAX_REQUESTS:
                pause(retry_delay)
                continue
            raise SyncJobError("Sync remained unavailable or busy within the retry budget. Saved entries are safe to retry.")
        if status not in (200, 202):
            raise SyncJobError("The sync endpoint returned an unexpected HTTP status. Check the deployment and endpoint URL.")
        if not isinstance(body, dict):
            raise SyncJobError("The sync response was not a valid job result.")
        if body.get("connected") is False:
            raise SyncJobError("Gmail is not connected. Reconnect it in the app's Settings.")
        complete, more = body.get("complete"), body.get("more")
        if (type(complete) is not bool or type(more) is not bool or
                complete == more or (status == 200) != complete):
            raise SyncJobError("The endpoint did not confirm a consistent backlog status. A successful HTTP request alone is not a completed sync.")
        for field in ("logged", "matched", "reviewed"):
            count = body.get(field)
            if type(count) is not int or count < 0:
                raise SyncJobError("The sync response contained invalid counts.")
            totals[field] += count
        # Optional during a rolling deployment; counts only, no receipt content.
        for field in ("receiptsChecked", "receiptsLinked"):
            if field in body:
                count = body[field]
                if type(count) is not int or count < 0:
                    raise SyncJobError("The sync response contained invalid receipt counts.")
                totals.setdefault(field, 0)
                totals[field] += count
        if complete:
            return {**totals, "requests": attempt + 1}
        if attempt + 1 < MAX_REQUESTS:
            pause(5)
    raise SyncJobError("The request budget ended with an unfinished backlog. Run Gmail sync again or continue in Settings; this job is not marked complete.")


def main():
    try:
        totals = run_sync(os.environ.get("GMAIL_SYNC_URL", ""), os.environ.get("CRON_SECRET", ""))
        message = ("Gmail sync completed: "
                   f"{totals['logged']} imported, {totals['matched']} already matched, "
                   f"{totals['reviewed']} needing review, {totals['requests']} requests.")
        if "receiptsChecked" in totals:
            message += (f" Receipts: {totals['receiptsChecked']} checked, "
                        f"{totals.get('receiptsLinked', 0)} linked automatically.")
        code = 0
    except SyncJobError as error:
        message, code = str(error), 1
    except Exception:
        # Exception strings may contain request headers, URLs or private data.
        message, code = "The sync caller could not finish. Check the deployment and repository configuration.", 1
    print(message)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write(("## Gmail sync completed\n\n" if code == 0 else "## Gmail sync needs attention\n\n") + message + "\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
