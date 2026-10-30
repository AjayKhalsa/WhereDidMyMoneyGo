# Current suggestions for saved category reviews

Old Gmail category-review cards stored the category guess from the original
import. A classifier improvement therefore helped new alerts but left old cards
showing the obsolete reason and category.

The authenticated status endpoint now computes a current suggestion for an
unchanged, already-recorded expense still labelled top-level Other. It uses the
current complete rule/category data and correction history, without seeding rules,
updating source candidates or touching transactions. Financial-purpose reviews,
credits, refunds, investments and specific existing categories receive no new
automatic cleanup suggestion.

Each proposed row must match its original full database snapshot, including
notes and nested metadata. The alert must agree with the ledger account, amount
and date. Conflicting or low-confidence results remain manual reviews. Only a
confident result in an existing category is preselected. Snapshot objects are
stripped from API responses and never sent to the browser.

The card shows the fresh category, with its reason collapsed under “Why this
category?”. The user can apply it or choose another category. Refreshing status
updates untouched defaults but preserves a user's active manual selection.
Changed entries disable category saving and link to Transactions. Existing
“Keep current entry” and the server's atomic snapshot check remain in place.
Opening the queue causes no writes; applying a category uses the existing
review-save RPC and does not insert another financial event.

Verification includes pure snapshot/evidence tests, a real authenticated route
with mocked Supabase HTTP, incomplete-load/auth checks, read-only replay of a
private 645-entry snapshot, and mobile/desktop browser checks with synthetic
IndexedDB and mocked endpoints. The replay identified one current suggestion and
protected edited or missing snapshots. It did not apply historical corrections.
