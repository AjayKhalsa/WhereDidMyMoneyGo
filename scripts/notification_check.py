"""Independent, bounded alert check. Reuses the existing cron secret and origin.
Never forwards credentials on redirects or prints upstream content.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from gmail_sync import NoRedirect, SyncJobError, validate_configuration


def request_check(url, secret):
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + secret, "Accept": "application/json"})
    try:
        response = urllib.request.build_opener(NoRedirect()).open(request, timeout=130)
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        return status, None
    with response:
        raw = response.read(8193)
        if len(raw) > 8192:
            raise SyncJobError("The notification check returned an invalid response.")
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeError):
            raise SyncJobError("The notification check did not return JSON.") from None
        return response.status, body


def run_check(gmail_url, secret, fetch=request_check, pause=time.sleep):
    validate_configuration(gmail_url, secret)
    origin = urllib.parse.urlsplit(gmail_url)
    url = urllib.parse.urlunsplit((origin.scheme, origin.netloc, "/api/cron/notifications", "", ""))
    for attempt in range(2):
        try:
            status, body = fetch(url, secret)
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            status, body = 0, None
        if status in (401, 403):
            raise SyncJobError("Notification authorization was rejected. Check the existing cron secret and production access.")
        if 300 <= status < 400:
            raise SyncJobError("The notification URL redirected. Credentials were not forwarded.")
        if status == 0 or status == 429 or 500 <= status <= 599:
            if attempt == 0:
                pause(5)
                continue
            raise SyncJobError("The notification check remained unavailable. The next scheduled run can retry safely.")
        if status != 200 or not isinstance(body, dict) or body.get("complete") is not True:
            raise SyncJobError("The notification check did not confirm completion.")
        counts = {key: body.get(key) for key in ("checked", "sent", "failed")}
        if any(type(n) is not int or n < 0 for n in counts.values()) or counts["failed"] != 0 or counts["sent"] > counts["checked"] * 2:
            raise SyncJobError("The notification check returned invalid counts.")
        return counts


def main():
    try:
        result = run_check(os.environ.get("GMAIL_SYNC_URL", ""), os.environ.get("CRON_SECRET", ""))
        message, code = f"Money alerts checked: {result['checked']} accounts, {result['sent']} alert groups sent.", 0
    except SyncJobError as error:
        message, code = str(error), 1
    except Exception:
        message, code = "The notification check could not finish. Check the deployment configuration.", 1
    print(message)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as summary:
            summary.write("\n## Money alerts\n\n" + message + "\n")
    return code


if __name__ == "__main__":
    sys.exit(main())
