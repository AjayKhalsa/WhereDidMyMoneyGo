-- Refund support: an INCOME row can now be flagged as money credited back
-- against earlier spending, optionally linked to the specific EXPENSE it
-- reverses. See src/lib/domain/types.ts's Transaction.isRefund /
-- reversesTransactionId doc comments for the semantics.
--
-- `on delete set null`, not cascade: deleting the original expense must
-- never delete the refund transaction itself — that would destroy real
-- income history over an unrelated deletion. transactions.id is a plain
-- single-column primary key (untouched by 0007_scope_categories_per_user,
-- which only rescoped categories), so this is a normal single-column FK,
-- no composite-key handling needed.
--
-- Run this once in the Supabase SQL editor.

alter table transactions add column is_refund boolean;
alter table transactions add column reverses_transaction_id text
  references transactions(id) on delete set null;
