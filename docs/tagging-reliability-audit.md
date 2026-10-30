# Tagging reliability audit

This phase audits category decisions from manual entry through Gmail's learning
loader and automatic classifier. It changes future decisions; it does not bulk
relabel existing ledger entries or alter financial matching, amounts or balances.

## Findings and fixes

- Quick entry and Gmail selected saved rules differently. Both now use the same
  selector: approved time conditions, then explicit corrections, then the most
  specific matching pattern. Equally specific conflicting categories abstain
  instead of depending on array order or confidence. Overlapping conditional
  rules also abstain. An explicit correction still outranks vocabulary.
- Weak legacy rules within a recognised merchant's category family could block
  better merchant evidence. Both entry paths now defer those unscoped rules to
  current vocabulary. Cross-family choices, explicit corrections, strong rules
  and approved conditions remain protected.
- Manual category corrections lacked explicit provenance, making them look like
  weak old predictions. New corrections carry scoped manual-correction evidence.
  Correcting one payee creates a separate scoped rule when the previous rule was
  generic; it does not repurpose that generic rule for unrelated payees.
- Quick entry could replace an explicitly corrected or conditional dining leaf
  with a clock heuristic. Both paths now preserve the approved leaf. A broad
  dining choice can still be refined from actual transaction time.
- Classification could collapse a parent brand and its sub-brand, allowing a
  shopping correction to affect a subscription, or a saved Instamart alias to
  rename Swiggy delivery. Classification scopes now use specific recognised
  brands, including Nykaa Fashion. Existing full sub-brand keys remain readable.
  The separate financial `merchantKey` and financial source identities are
  unchanged. Known brands cannot inherit a different known brand's display alias.
- Gmail dropped a recognised merchant to Other when its specific category was
  absent even though the correct parent existed. It now uses that available
  parent; it never invents a category or chooses another family.
- Gmail learning used unpaged rules, contexts, categories and source predictions,
  plus a capped history loop. All five collections now use counted, ordered
  paging. Missing counts, shortened/incomplete results, duplicate pages and count
  changes fail the load rather than permit partial learning. Page progress uses
  actual returned rows, including servers with smaller response caps.
- Receipt metadata without a predicted category could be mistaken for a human
  category correction. It no longer trains history. Machine-enriched entries
  need an actual correction signal; refunds, reversals, zero/negative values and
  adjustment entries do not train spending history.
- A corpus run found Amazon Fresh colliding with Amazon, and Indian Oil's brand
  word being interpreted as grocery oil in quick entry. Both are corrected while
  standalone grocery wording remains intact.

## Verification and limits

The runtime corpus covers all 173 built-in merchant display names through both
entry paths, in addition to targeted rule, correction, scope, refund and missing
category regressions. Loader integration tests use the real Supabase client with
mock HTTP responses, more than 1,200 rows and a server cap of 137 rows. Existing
Gmail sync, historical-preview, investment and financial database tests remain
part of the full test run.

A private read-only production snapshot contained 645 ledger entries, 262 Gmail
records, 105 rules and 76 categories. Offline replay preserved its inputs and
retained uncertain personal payees and genuine cross-family conflicts for review.
The snapshot is not a bank statement and cannot establish that every real-world
payment was captured. These tests establish the supported deterministic cases;
they do not promise universal merchant recognition or eliminate financial review.

The existing Zomato entry reported in PR52 still requires its separately prepared,
backed-up category repair. Already edited historical rows are preserved even when
the new classifier would suggest a different subcategory. No historical category
repairs are included in this code deployment.
