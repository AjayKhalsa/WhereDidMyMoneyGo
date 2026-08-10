-- Goal contributions are now real TRANSFER transactions (see
-- contributeToGoal in src/lib/data/actions.ts) rather than a bare balance
-- edit. goal_id records which goal a TRANSFER row funded.
--
-- `on delete set null`: deleting a goal must not delete the transactions
-- that funded it — those still represent real money that left an account.
-- goals.id is app-generated (createId("goal")), not a shared built-in id
-- like categories.id was, so no per-user rescoping is needed here.
--
-- Run this once in the Supabase SQL editor.

alter table transactions add column goal_id text
  references goals(id) on delete set null;
