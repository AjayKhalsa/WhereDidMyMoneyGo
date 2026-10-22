# Actual transaction times and historical enrichment

Apply `supabase/migrations/0020_transaction_enrichment.sql` after migrations 0001–0019, then deploy the app. It adds timestamp provenance, enrichment evidence and conditional rule fields; it does not rewrite historical rows. Local IndexedDB users need no migration.

In **Settings → Transaction times & smarter rules**, choose **Load saved bank times** (cloud accounts), inspect the proposed changes, then **Update selected expenses**. The app downloads a fresh full backup before applying the selected metadata changes atomically. Concurrent edits invalidate the preview; replaying an already saved batch is safe. Amounts, accounts, transaction types, linked refunds and calendar days remain unchanged. Transfers, credits, adjustments and future expenses are excluded.

The bank evidence endpoint reads authenticated users' already-linked, logged Gmail receipts. Only exact bank/payment clocks matching the transaction ID, account, amount and bank date can repair a missing time. It does not scan the mailbox anew or guess from similar transactions. Conflicting clocks or rule categories are skipped. Previously stored matching bank-time notes remain valid evidence. Old manual logging times, midnight imports, email receipt times and `createdAt` are not proof of when a purchase happened. Missing clocks remain visibly unknown and can be confirmed in the transaction editor; **Now** is an explicit choice.

Meal rules use India time (Asia/Kolkata), including when the browser is elsewhere:

| Actual time | Meal category |
| --- | --- |
| 00:00–11:59 | Breakfast |
| 12:00–16:59 | Lunch |
| 17:00–19:59 | Snacks |
| 20:00–23:59 | Dinner |

These are heuristics applied to meal categories, not groceries, coffee, drinks or arbitrary merchants. Explicit meal wording in the description wins. Historical previews may revise existing meal subcategories; deselect exceptions. Personal tags are retained. Weekend comes from the calendar day; late-night requires a verified clock (22:00–03:59). Time-based spending insights disclose known-time coverage and do not count unknown clocks as midnight spending.

Pattern suggestions run on the user's loaded history in the app. They require four user-recorded expenses across at least three dates, a consistent category, and at least 80% joint agreement on the proposed tags. Rules match the exact normalized merchant, meal-time window and weekday/weekend group. Only established people/purpose/attribute tags qualify; one-off occasions, project hashtags, impulse, alcohol and gift tags are excluded. Imported/recurring/seed rows and entries marked with automated rule provenance do not train suggestions. Time recovery alone does not prevent learning from independently recorded tags.

Each suggestion shows supporting transactions. Enabling a rule makes it available for future entries; run the history preview again to apply it retrospectively. Conditions remain attached when editing the saved rule. No personal ledger was accessed or modified during development: real pattern suggestions and historical updates happen after deployment in the signed-in app.

## Updated manual-entry preference

New manual entries now use the time of saving in India automatically, with `timing.source=logged` and `precision=estimated`. Meal/context tagging and conditional pattern suggestions may use this explicitly marked estimate; verified-time insight percentages continue to exclude it. Bank/payment evidence can replace a logging estimate when safely linked to the same transaction. Old logging clocks are not retroactively promoted to evidence. Backdating a new entry clears the default clock instead of attaching today's time. Editing an older entry preserves its saved clock.

The prominent time field and Now button have been removed. A collapsed Time control inside Details remains for optional corrections. Pasted SMS and Gmail processing continue to use bank/payment clocks when present; a date-only bank message never inherits the manual logging default.
