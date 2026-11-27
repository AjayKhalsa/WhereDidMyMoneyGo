# Integrated insight analysis

The existing insight cards, spending explanation, budget commentary, quick
answers, score and recap use AI explanations when a valid result is available.
There is no separate AI section or generation button. Home uses the same
analysis; Budgets reuses its budget explanation. Overview owns the insight
cards above the charts so Explore does not repeat them.

Recorded-pattern insights render immediately. One debounced request analyses
the current owner and pay cycle in the background. A valid response adds up to
three cross-cutting findings and supplies an evidence-bound explanation for
every existing narrative target. The model can connect evidence independently
of the detectors; it does not merely rewrite their headings.

## Financial correctness

The shared engines calculate all amounts, scores, commitments and forecasts.
The model returns bounded prose and supporting fact IDs, never numerical claims
or financial writes. Existing critical alerts retain their severity, amount and
transactions. Every generated finding opens its supporting records and exact
fact metrics. Mixed comparison evidence is not summed into a misleading total.

The server rebuilds context from complete, owner-filtered, counted reads using
the authenticated RLS client. It never accepts browser-supplied financial facts.
The browser and server use the same context builder and snapshot. Changes to
plans, contributions, linked money or supporting amounts invalidate the result.
Linked reimbursements use personal net spending. Historical comparisons use
equal elapsed prefixes instead of incomplete/full-cycle pairs. Live day counts use the Indian calendar on both phone and server, including midnight and payday boundaries.

Numerical claims, unknown or unrelated evidence, missing or repeated narrative
targets, and stale results fail validation. Model failure, quota, timeouts,
authentication failure and unsuitable provider configuration leave the original
recorded-pattern version in place. No retry loop is scheduled.

## Private processing and cost

Financial summaries derived from Gmail remain Google user data even without
raw messages or identifiers. The old AI_FREE_TIER_CONFIRMED assertion no longer
enables AI. Free-tier processing that may improve general models must not
receive these financial summaries.

GEMINI_API_KEY stays server-only. Set AI_PRIVATE_PROCESSING_CONFIRMED to the
exact value gemini-paid-services-no-training only after verifying that Gemini
Paid Services no-training terms apply to the project and the owner explicitly
approves any associated cost. This is an operator attestation, not an automated
billing or contract check. The app never enables billing, buys credits, changes
providers or sets this flag itself. Without it, financial screens continue with
recorded patterns. Shipping this source change does not authorize API charges.

Provider input contains aggregate metrics, standard labels and opaque evidence
and target IDs. Raw email, payee identities, notes, account names/numbers,
profile details, raw contexts, ledger transaction IDs and local routing keys
are excluded. Category suggestions require an explicit request before sending
the entered description; typing alone does not invoke the classifier. Screen
masking does not change summary requests.

The model remains fixed with no provider fallback, client model override,
grounding or tools. Thirty-minute reuse, in-flight deduplication and a per-owner
hourly allowance are best-effort within a warm server instance, not a durable
global spending cap. Browser cache is bounded, memory-only and owner-scoped.

## Verification

Tests cover personal net spending, cycle overrides, equal-prefix history,
source privacy, plan invalidation, narrative completeness, evidence validation,
critical alert preservation and read-only authenticated API behaviour. Test
provider calls are mocked. No live AI call, schema migration or production
financial mutation is needed to verify the implementation.
