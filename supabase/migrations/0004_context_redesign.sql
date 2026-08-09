-- Context redesign: COMPANY/NATURE -> PEOPLE/ATTRIBUTE (OCCASION unchanged),
-- plus dropping "Travel" as a selectable Occasion now that Travel is a real
-- category (see 0003_flatten_categories.sql) and removing Treat/Impulse.
-- See src/lib/domain/types.ts's ContextType and src/lib/domain/contexts.ts.
--
-- Order matters: the check constraint must be widened BEFORE the data is
-- updated to new type values (existing rows would otherwise violate the
-- old constraint on update), so this happens for both transaction_contexts
-- and rule_contexts, in the same drop-by-lookup pattern as
-- 0002_add_imported_source.sql.

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'transaction_contexts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%type%';
  if con_name is not null then
    execute format('alter table transaction_contexts drop constraint %I', con_name);
  end if;
end $$;

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'rule_contexts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%type%';
  if con_name is not null then
    execute format('alter table rule_contexts drop constraint %I', con_name);
  end if;
end $$;

-- Remap stored type values. Value strings are untouched (no check
-- constraint on value) — "travel"/"treat"/"impulse" rows that don't get
-- deleted below simply become orphaned-but-harmless data under their new
-- type, same as any tag no longer offered in the picker.
update transaction_contexts set type = 'PEOPLE' where type = 'COMPANY';
update transaction_contexts set type = 'ATTRIBUTE' where type = 'NATURE';
update rule_contexts set type = 'PEOPLE' where type = 'COMPANY';
update rule_contexts set type = 'ATTRIBUTE' where type = 'NATURE';

alter table transaction_contexts add constraint transaction_contexts_type_check
  check (type in ('PEOPLE', 'OCCASION', 'ATTRIBUTE'));
alter table rule_contexts add constraint rule_contexts_type_check
  check (type in ('PEOPLE', 'OCCASION', 'ATTRIBUTE'));

-- "Travel" stopped being a selectable Occasion — an Occasion:Travel chip
-- sitting next to a Travel category label is pure visible duplication, so
-- clean it up specifically where that duplication exists (the transaction
-- or rule's own category_id is now 'travel', per 0003's migration). A
-- travel tag on a row categorised as something else is left alone, same as
-- any other now-orphaned context value.
delete from transaction_contexts tc
using transactions t
where tc.transaction_id = t.id
  and tc.type = 'OCCASION'
  and tc.value = 'travel'
  and t.category_id = 'travel';

delete from rule_contexts rc
using rules r
where rc.rule_id = r.id
  and rc.type = 'OCCASION'
  and rc.value = 'travel'
  and r.category_id = 'travel';
