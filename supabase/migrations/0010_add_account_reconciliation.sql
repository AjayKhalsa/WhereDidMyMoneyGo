-- Account reconciliation: a timestamp confirming an account's tracked
-- balance was checked against the real bank/wallet. The correction itself
-- (when the two don't match) is a normal Transaction — categorised under
-- the new "adjustment" leaf added client-side via CATEGORY_TREE, which
-- back-fills into every existing account through the same
-- missingBuiltInCategories() upsert path 0007/0008/0009 already established,
-- so no migration is needed for the category itself.
--
-- accounts.id is a plain single-column primary key (untouched by
-- 0007_scope_categories_per_user.sql, which only rescoped categories), so
-- this is a normal single-column, no-FK column addition.
--
-- Run this once in the Supabase SQL editor.

alter table accounts add column last_reconciled_at timestamptz;
