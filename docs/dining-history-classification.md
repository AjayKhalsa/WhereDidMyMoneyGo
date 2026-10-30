# Dining history classification

Mixed Food & Dining subcategories do not mean the merchant's category family is
disputed. Historical Zomato entries labelled Coffee, Food delivery, Breakfast,
Dinner or Other under Dining must not force a new recognised Zomato debit into
the top-level Other category.

The Gmail history learner now treats all `dining` / `dining.*` labels as compatible
when deciding whether to block merchant recognition. Mixed leaves do not train
a new leaf rule. Current merchant evidence and reliable transaction time choose
the category through the existing classifier; email receipt time never supplies
a meal time. Explicit saved corrections continue to take priority. Conflicts
across category families still abstain, and existing historical labels are not
rewritten by this code change.

Regression coverage exercises the next debit after mixed dining history for
Zomato, Swiggy, Instamart and Zepto, including a legacy weak rule, unknown actual
transaction time, preserved historical labels, explicit corrections and real
cross-family conflicts. Refund/purpose gates remain unchanged.

An existing incorrectly tagged entry needs a separate snapshot-guarded category
repair; deploying the classifier does not silently recategorise the ledger.
