import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from notification_check import run_check
from gmail_sync import SyncJobError

URL = 'https://example.vercel.app/api/cron/gmail'
OK = {'complete': True, 'checked': 1, 'sent': 2, 'failed': 0}

class NotificationChecks(unittest.TestCase):
    def test_origin_and_secret_reused_and_only_counts_returned(self):
        calls = []
        def fetch(url, secret):
            calls.append((url, secret))
            return 200, {**OK, 'private': 'not returned'}
        self.assertEqual(run_check(URL, 'existing-secret', fetch), {'checked': 1, 'sent': 2, 'failed': 0})
        self.assertEqual(calls, [('https://example.vercel.app/api/cron/notifications', 'existing-secret')])

    def test_auth_redirect_fail_immediately(self):
        for status in (301, 302, 401, 403):
            calls = []
            with self.assertRaises(SyncJobError):
                run_check(URL, 'secret', lambda *args: (calls.append(args) or (status, {'error': 'private'})), lambda n: self.fail('unexpected retry'))
            self.assertEqual(len(calls), 1)

    def test_bounded_retries_and_recovery(self):
        responses = iter([(503, None), (200, OK)])
        pauses = []
        self.assertEqual(run_check(URL, 'secret', lambda *args: next(responses), pauses.append)['sent'], 2)
        self.assertEqual(pauses, [5])
        calls = []
        with self.assertRaises(SyncJobError):
            run_check(URL, 'secret', lambda *args: (calls.append(args) or (503, None)), lambda n: None)
        self.assertEqual(len(calls), 2)

    def test_no_false_success(self):
        for body in ({}, {**OK, 'complete': False}, {**OK, 'failed': 1}, {**OK, 'sent': True}, {**OK, 'sent': 3}):
            with self.assertRaises(SyncJobError):
                run_check(URL, 'secret', lambda *args: (200, body))

    def test_invalid_configuration_never_fetches(self):
        for url in ('http://example/api/cron/gmail', URL+'?token=private', 'https://user:secret@example/api/cron/gmail'):
            with self.assertRaises(SyncJobError):
                run_check(url, 'secret', lambda *args: self.fail('unexpected request'))

    def test_alerts_run_independently_of_gmail(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / '.github/workflows/gmail-sync.yml').read_text()
        self.assertIn('if: always()', workflow)
        self.assertIn('python3 scripts/notification_check.py', workflow)
        crons = __import__('json').loads((root / 'vercel.json').read_text())['crons']
        self.assertIn('/api/cron/notifications', [c['path'] for c in crons])
