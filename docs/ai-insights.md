# Grounded AI insights

Insights → **A fresh perspective** offers My money, Food & dining and What
changed. Generation is explicit and on demand. It returns short interpretations
with evidence buttons; every displayed figure comes from the shared ledger
engines, not model arithmetic. Evidence includes original transactions and
separate current/previous tabs for equal-prefix comparisons. No AI operation can
write financial data, alter categories or run a tool.

## Free-only configuration

The existing server-only GEMINI_API_KEY is reused. AI_FREE_TIER_CONFIRMED must
equal gemini-no-billing, and must be set only after the owner confirms that the
key belongs to a Google AI Studio **Free tier** project with Cloud Billing
disabled. The owner confirmed this configuration on 31 October 2026.

This flag is an owner assertion, not an automated billing check. Keep the project
without billing to maintain ₹0; clear the flag before changing billing or moving
the key to a paid project. The app cannot prevent a later external billing change.
It never enables billing, purchases credits or uses Vercel AI Gateway credits.

The fixed model is gemini-3.1-flash-lite, whose standard input/output were listed
as Free of charge in Google's pricing on 31 October 2026. There is no model
override, fallback provider, paid grounding, automatic generation schedule,
automatic retry or data-loading retry that invokes a model. Quota exhaustion
returns a controlled error. The legacy optional classifier now shares this
free-tier gate, model and authenticated same-origin access; its key is sent in
an API header rather than a URL. Its category list now includes the additive
built-in subcategories as well as the original taxonomy.

Recent results are reused for thirty minutes per owner/snapshot/view, concurrent
identical calls are combined, and each warm server instance allows three new
requests per owner per hour. These are best-effort instance-local controls, not
a durable global quota. The no-billing provider project is the ₹0 boundary.

## Data and evidence

The server verifies the session with Supabase getUser, uses the user's own
RLS-authenticated client and explicit owner filters, and loads complete counted,
ordered pages of transactions, accounts, categories and income sources. It needs
no service-role key, Gmail token or database migration. No new table or financial
write is introduced. Existing table RLS was checked as enabled.

The shared fact builder calculates net purchases/refunds, food subcategories,
category changes, merchant frequency/average purchase, funding-source totals,
recorded income, gross investments, principal returned, small purchases and
verified-clock coverage. Income, contributions, principal and repayments retain
their distinct accounting treatment. Full-cycle totals do not get truncated to
shorter equal-period comparisons. Future rows and verified future clocks remain
excluded. Input order cannot change the snapshot checksum.

Only aggregate metrics, public built-in labels and recognised public merchant
brands go to Gemini. Unknown payees, custom categories and renamed categories
are anonymised. Raw emails, free-form notes/descriptions, bank/account names or
numbers, profile fields, transaction IDs and user IDs are not sent. The visible
Generate disclosure explains that Google's free-tier terms may use submitted
content to improve products. The generation sends figures even when their local
display is masked; balance hiding is a screen privacy preference.

The model selects real fact IDs and returns plain interpretation text. A schema
and server validator reject unknown/repeated evidence, invented numeric figures,
HTML/links, oversized prose and unsupported fields. Figures are rendered from
the authenticated app's matching fact snapshot. Text remains an AI interpretation
and can be mistaken; supporting metrics are the authoritative calculation. A
checksum detects changed views, not authentication. Both server and client hide
stale interpretations, and owners cannot receive one another's cached results.

API responses are private/no-store; the existing service worker treats /api as
network-only. Responses are not persisted to the ledger, browser storage or a
third-party trace service. Production logs do not contain model prompts, provider
errors, keys or responses. Fixed focus choices cannot request writes or other
models. The feature makes no claim of complete bank/email coverage, affordability,
precise unknown clocks, visited outlets or medical/personality inference. It does
not impose budgets, shared spaces or investment-product recommendations.

## Verification

Unit tests cover money/refund/contribution/withdrawal invariants, private-data
projection, canonical snapshots, comparisons, future dates and output rejection.
Route integration exercises real SDK serialization with mocked Gemini and owner
auth: no writes, setup/origin/auth gates, changed/incomplete data, quota errors
without retries, per-owner caches, concurrent calls, best-effort limits and the
legacy classifier. Browser checks use synthetic IndexedDB and mocked generation;
they cover mobile layouts, evidence, view choices, stale results, privacy, cancel
and unchanged financial rows. These do not impersonate a production user.

For an explicit real-provider check only, run the following in a trusted server
environment after the no-billing confirmation. It uses entirely synthetic data,
one request through the actual generator and logs only a safe pass/failure code:

```sh
node --experimental-transform-types --import ./tests/loader.mjs scripts/ai-provider-smoke.mjs
```

This is not part of the default build or CI and does not read the database. It
must not be run with an unconfirmed project or by printing/pulling the key.

References: [Google pricing](https://ai.google.dev/gemini-api/docs/pricing),
[billing](https://ai.google.dev/gemini-api/docs/billing),
[terms](https://ai.google.dev/gemini-api/terms). Installed SDKs are pinned with
their lockfile; provider APIs were checked against the bundled version docs.
