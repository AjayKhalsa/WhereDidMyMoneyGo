import importlib.util
import io
import re
from types import SimpleNamespace
from pathlib import Path
from contextlib import redirect_stdout
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location("gmail_sync", Path(__file__).resolve().parents[2] / "scripts/gmail_sync.py")
job = importlib.util.module_from_spec(spec)
spec.loader.exec_module(job)
URL = "https://budget.example/api/cron/gmail"
SECRET = "private-fixture-secret"


def complete(logged=1, matched=2, reviewed=3):
    return {"complete": True, "more": False, "logged": logged, "matched": matched, "reviewed": reviewed}


class SyncJobTests(unittest.TestCase):
    def run_results(self, results):
        iterator = iter(results)
        calls = []
        def fetch(url, secret):
            calls.append((url, secret))
            result = next(iterator)
            if isinstance(result, Exception):
                raise result
            return result
        return job.run_sync(URL, SECRET, fetch, lambda _: None), calls

    def test_complete_job_returns_only_safe_counts(self):
        result, calls = self.run_results([(200, complete())])
        self.assertEqual(result, {"logged": 1, "matched": 2, "reviewed": 3, "requests": 1})
        self.assertEqual(calls, [(URL, SECRET)])

    def test_incomplete_pass_continues_then_aggregates_completion(self):
        pending = {**complete(2, 0, 1), "complete": False, "more": True}
        result, _ = self.run_results([(202, pending), (200, complete(1, 4, 0))])
        self.assertEqual(result, {"logged": 3, "matched": 4, "reviewed": 1, "requests": 2})

    def test_receipt_counts_aggregate_separately_from_financial_events(self):
        pending = {**complete(0, 0, 0), "complete": False, "more": True, "receiptsChecked": 8, "receiptsLinked": 2}
        result, _ = self.run_results([(202, pending), (200, {**complete(0, 0, 0), "receiptsChecked": 3, "receiptsLinked": 1})])
        self.assertEqual(result["receiptsChecked"], 11)
        self.assertEqual(result["receiptsLinked"], 3)
        self.assertEqual(result["logged"], 0)
        for invalid in (True, -1, "private@example.com"):
            with self.assertRaises(job.SyncJobError):
                self.run_results([(200, {**complete(), "receiptsChecked": invalid})])

    def test_backlog_does_not_become_success_when_budget_ends(self):
        pending = {**complete(), "complete": False, "more": True}
        with self.assertRaisesRegex(job.SyncJobError, "unfinished backlog"):
            self.run_results([(202, pending)] * job.MAX_REQUESTS)

    def test_transient_network_busy_and_server_failures_retry(self):
        result, calls = self.run_results([urllib.error.URLError("private upstream detail"), (409, None), (503, None), (200, complete())])
        self.assertEqual(len(calls), 4)
        self.assertEqual(result["logged"], 1)

    def test_bad_auth_and_redirects_do_not_retry_or_expose_body(self):
        for status in (401, 403, 301, 307):
            calls = []
            def fetch(*_):
                calls.append(1)
                return status, {"error": SECRET}
            with self.assertRaises(job.SyncJobError) as caught:
                job.run_sync(URL, SECRET, fetch, lambda _: None)
            self.assertEqual(len(calls), 1)
            self.assertNotIn(SECRET, str(caught.exception))
        self.assertIsNone(job.NoRedirect().redirect_request(None, None, 302, "", {}, "https://elsewhere.example"))

    def test_google_access_and_server_setup_errors_have_actionable_messages(self):
        for code, expected in (("gmail_reconnect_required", "Reconnect Gmail"), ("gmail_server_setup", "OAuth app configuration")):
            with self.assertRaisesRegex(job.SyncJobError, expected):
                self.run_results([(401 if code == "gmail_reconnect_required" else 503, {"code": code, "error": SECRET})])

    def test_rate_limit_pause_is_bounded_and_honoured(self):
        calls, pauses = [], []
        def fetch(*_):
            calls.append(1)
            return (503, {"code": "google_rate_limited", "retryAfterSeconds": 12}) if len(calls) == 1 else (200, complete())
        job.run_sync(URL, SECRET, fetch, pauses.append)
        self.assertEqual(pauses, [12])
        with self.assertRaisesRegex(job.SyncJobError, "longer pause"):
            self.run_results([(503, {"code": "google_rate_limited", "retryAfterSeconds": 60})])

    def test_http_error_reader_keeps_only_allowlisted_metadata(self):
        for payload, expected in (({"code": "gmail_reconnect_required", "error": SECRET}, {"code": "gmail_reconnect_required"}), ({"code": [], "error": SECRET}, None), ({"code": "unknown", "error": SECRET}, None)):
            error = urllib.error.HTTPError(URL, 401, "", {}, io.BytesIO(job.json.dumps(payload).encode()))
            with patch.object(job.urllib.request, "build_opener", return_value=SimpleNamespace(open=lambda *_args, **_kwargs: (_ for _ in ()).throw(error))):
                status, body = job.request_sync(URL, SECRET)
                self.assertEqual(status, 401)
                self.assertEqual(body, expected)
                self.assertNotIn(SECRET, str(body))

    def test_disconnected_gmail_and_old_endpoint_are_not_healthy(self):
        for body in ({"connected": False}, {"ok": True}, {**complete(), "more": True}, {**complete(), "logged": True}):
            with self.assertRaises(job.SyncJobError):
                self.run_results([(200, body)])

    def test_missing_secret_and_invalid_urls_fail_before_http(self):
        for url, secret in ((URL, ""), (URL, "bad\nsecret"), ("http://budget.example/api/cron/gmail", SECRET), ("https://user:pass@budget.example/api/cron/gmail", SECRET), (URL + "?token=x", SECRET), (URL + "#fragment", SECRET), ("https://budget.example/login", SECRET)):
            with self.assertRaises(job.SyncJobError):
                job.run_sync(url, secret, lambda *_: self.fail("HTTP must not be called"))

    def test_http_boundary_uses_bearer_auth_and_rejects_private_non_json_payloads(self):
        response = io.BytesIO(b'{"complete":true,"more":false,"logged":1,"matched":0,"reviewed":0}')
        response.status = 200
        opener = SimpleNamespace(open=lambda request, timeout: response)
        with patch.object(job.urllib.request, "build_opener", return_value=opener) as build:
            status, body = job.request_sync(URL, SECRET)
            self.assertEqual(status, 200)
            self.assertEqual(body["logged"], 1)
            self.assertIsInstance(build.call_args.args[0], job.NoRedirect)
        captured = []
        def invalid(request, timeout):
            captured.append((request.get_header("Authorization"), timeout))
            value = io.BytesIO((SECRET + " bank@example.com").encode())
            value.status = 200
            return value
        with patch.object(job.urllib.request, "build_opener", return_value=SimpleNamespace(open=invalid)):
            with self.assertRaises(job.SyncJobError) as caught:
                job.request_sync(URL, SECRET)
        self.assertEqual(captured, [("Bearer " + SECRET, job.TIMEOUT_SECONDS)])
        self.assertNotIn(SECRET, str(caught.exception))
        self.assertNotIn("bank@example.com", str(caught.exception))

    def test_workflow_runs_every_four_hours_in_ist_and_retains_nightly_vercel_fallback(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / ".github/workflows/gmail-sync.yml").read_text()
        minute, hours = re.search(r"cron: '([0-9]+) ([0-9,]+) ", workflow).groups()
        times = sorted((int(hour) * 60 + int(minute) + 330) % 1440 for hour in hours.split(","))
        self.assertEqual(times, [77, 317, 557, 797, 1037, 1277])
        self.assertTrue(all((times[(i + 1) % len(times)] - t) % 1440 == 240 for i, t in enumerate(times)))
        self.assertIn('"schedule": "30 21 * * *"', (root / "vercel.json").read_text())
        self.assertNotIn("pull_request", workflow)

    def test_job_failure_keeps_private_upstream_details_out_of_logs(self):
        output = io.StringIO()
        with patch.dict(job.os.environ, {"GITHUB_STEP_SUMMARY": ""}), patch.object(job, "run_sync", side_effect=RuntimeError(SECRET + " bank@example.com")), redirect_stdout(output):
            self.assertEqual(job.main(), 1)
        self.assertNotIn(SECRET, output.getvalue())
        self.assertNotIn("bank@example.com", output.getvalue())


if __name__ == "__main__":
    unittest.main()
