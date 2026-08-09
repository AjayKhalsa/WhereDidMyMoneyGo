-- "imported" was added to Transaction["source"] in the statement-import
-- feature, but the original check constraint on transactions.source was
-- never updated to match — every imported row was rejected by Postgres.
-- Drop-by-lookup rather than a hardcoded constraint name, since Postgres
-- auto-names inline check constraints and the exact name isn't guaranteed.

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%source%';

  if con_name is not null then
    execute format('alter table transactions drop constraint %I', con_name);
  end if;
end $$;

alter table transactions add constraint transactions_source_check
  check (source in ('manual','parsed','recurring','seed','imported'));
