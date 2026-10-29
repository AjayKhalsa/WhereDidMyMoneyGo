# Personal merchant recognition and richer insights

User direction, 29 October 2026: no budget setup or shared spaces. Improve automatic classification, category navigation and evidence-backed insights in the existing application.

## 1. Merchant recognition (first implementation)

Use word-boundary phrases and canonical merchant names, not only individual aliases. Support Tea Post and Nariyal Pani and a bounded set of recognisable Mumbai food businesses. Clear restaurant/cafe descriptors can suggest Dining. Do not classify arbitrary Mumbai payees, generic Social/bar/hotel names, or equipment suppliers as food. Saved corrections and historical conflicts take precedence. Preserve the existing meal-time evidence rules and under-₹150 personal UPI exception hierarchy.

This source increment adds shared phrase recognition to Gmail classification and manual entry; no database migration, paid lookup or historical recategorisation. It does not promise recognition of every business. Merchant classification is not transaction identity or evidence of an outlet address. Keep original Gmail merchant text. Evaluate real unresolved merchants in a read-only report before proposing historical changes.

## 2. Category experience

Reuse existing category IDs and manual labels. Add a searchable, grouped picker with consistent icons and recent selections. Present subscription merchants such as Netflix and Spotify within Bills & Subscriptions rather than creating a category for every brand. Keep meal, merchant and venue dimensions separate: a restaurant can also be Dinner. Propose any new persistent categories once, with explicit approval and no automatic rewriting of history.

## 3. Evidence-backed trends

Build category detail views from the existing net spending engine: cumulative trend, comparable prior-period trend, merchants, purchase count and average purchase. Keep consumption, personal transfers and investments distinct. Show sent, received and net for people. Add daily spending drill-down and an upcoming calendar reusing recurring rules, card due dates and investment commitments. Predicted obligations must never create posted payments. No budget setup. Suppress confident forecasts when history is incomplete, and link every total to its ledger rows.

## 4. Location and timestamp enrichment

Current Alert/Transaction models do not retain structured transaction location. First audit representative email/statement evidence for explicit outlet, city and address fields. A card narration may identify a city or processing location; a delivery address is not an outlet; a brand lookup does not establish a visited branch. No GPS backfill and no assumed Mumbai location.

After that audit, add optional source-linked place evidence with role (merchant outlet, delivery destination, processor location), precision and source excerpt. Only confidently attributed outlet evidence may power spending-by-area insights. Ambiguous evidence stays labelled as such; absent evidence stays unknown. Keep sensitive home addresses out of normal insight cards and logs. New metadata requires backward-compatible persistence and a migration backup/approval. No paid maps or AI fallback: retain the ₹0 AI budget.

## Validation and rollout

Each increment gets a separate reviewable change. First increment tests multiword names, manual entry, saved overrides, missing categories, unknown clocks, credit/special-event protection, historical conflicts and false positives. Later UI checks cover 320/390px layouts, search, privacy masking and transaction drill-downs. Financial tests must include refunds, family credits, SIPs, equal repeated payments and incomplete coverage. Production status must be reported separately from passing local checks. No historical ledger mutations without the established backed-up, approved dry run.

## Platform preference
Swiggy, Instamart (including Swiggy Instamart), Zomato, Zepto and District default to Food & Dining, as explicitly requested. Saved corrections retain precedence. Instamart, Zepto and District do not receive clock-only meal subcategories: the platform can represent groceries or tickets. No existing ledger categories are rewritten.
