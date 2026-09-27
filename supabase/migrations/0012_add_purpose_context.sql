-- The app's context model supports PURPOSE (commute, work, travel, etc.).
-- Keep both tag tables aligned so imports and normal edits can save it.
begin;

alter table public.transaction_contexts
  drop constraint if exists transaction_contexts_type_check;
alter table public.transaction_contexts
  add constraint transaction_contexts_type_check
  check (type in ('PEOPLE', 'PURPOSE', 'OCCASION', 'ATTRIBUTE'));

alter table public.rule_contexts
  drop constraint if exists rule_contexts_type_check;
alter table public.rule_contexts
  add constraint rule_contexts_type_check
  check (type in ('PEOPLE', 'PURPOSE', 'OCCASION', 'ATTRIBUTE'));

commit;
