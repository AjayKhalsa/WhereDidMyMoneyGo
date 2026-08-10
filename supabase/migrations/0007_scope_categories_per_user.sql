-- Categories reuse the exact same built-in ids across every account by
-- design ("dining", "transport.cab", ...) — that's the whole point of a
-- shared taxonomy. But `categories.id` was declared `primary key` on its
-- own in 0001_init.sql, making it a *global* key across every user, not
-- one scoped to the account that owns the row. 0003_flatten_categories.sql
-- already called this out as a known limitation ("only behaves correctly
-- with a single real user").
--
-- The app's `SupabaseRepository.putOne` always upserts categories with
-- `.upsert({ id, user_id, ... })`, which PostgREST resolves against the
-- table's primary key by default. With a global `id` key, once any row
-- with a given id exists for ANY account, every other account's upsert of
-- that same id becomes an UPDATE of that other account's row — which
-- row-level security silently blocks (an UPDATE whose USING clause doesn't
-- match simply touches zero rows, without PostgREST treating it as an
-- error). The practical effect: a newly-introduced built-in category can
-- silently fail to ever attach to some accounts, while looking like a
-- successful write.
--
-- This scopes the key properly: `(user_id, id)` becomes the primary key.
-- Three other tables hold a foreign key against the old single-column
-- `categories(id)` — transactions.category_id, recurring.category_id,
-- rules.category_id — plus categories' own self-referencing parent_id.
-- All four have to be dropped before the old primary key can go, and
-- rebuilt as composite `(user_id, ...)` foreign keys afterward, each
-- keeping its *original* on-delete behaviour exactly (transactions and
-- recurring: on delete set null; rules: on delete cascade, matching
-- 0001_init.sql) — getting this wrong would silently change what happens
-- to a user's transactions/rules when a category is ever deleted.
--
-- Constraints are found via pg_constraint/pg_attribute catalog metadata
-- (referenced table's OID, constrained column's actual name), not by
-- string-matching pg_get_constraintdef()'s output — that text renders SQL
-- keywords in uppercase ("FOREIGN KEY ... REFERENCES"), so a lowercase
-- `like '%references%'` pattern would silently never match anything.
--
-- Run this once in the Supabase SQL editor.
--
-- Safe to accidentally run twice: if categories_pkey is already the
-- composite (user_id, id) shape this migration produces, it stops with a
-- clear message instead of failing confusingly on the "drop primary key"
-- step (that step's dependency error is real but misleading on a re-run —
-- the FK-lookup steps above it only know how to find the *old*
-- single-column foreign keys, so they find nothing to drop, and the
-- already-correct composite foreign keys are still attached when the
-- final step tries to drop the primary key anyway).
do $$
begin
  if (
    select array_length(conkey, 1)
    from pg_constraint
    where conrelid = 'categories'::regclass and contype = 'p'
  ) = 2 then
    raise exception 'categories.id is already scoped per user — 0007 was already applied. Nothing to do; continue with 0008.';
  end if;
end $$;

do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid = 'transactions'::regclass
    and c.contype = 'f'
    and c.confrelid = 'categories'::regclass
    and a.attname = 'category_id';
  if con_name is not null then
    execute format('alter table transactions drop constraint %I', con_name);
  end if;
end $$;

do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid = 'recurring'::regclass
    and c.contype = 'f'
    and c.confrelid = 'categories'::regclass
    and a.attname = 'category_id';
  if con_name is not null then
    execute format('alter table recurring drop constraint %I', con_name);
  end if;
end $$;

do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid = 'rules'::regclass
    and c.contype = 'f'
    and c.confrelid = 'categories'::regclass
    and a.attname = 'category_id';
  if con_name is not null then
    execute format('alter table rules drop constraint %I', con_name);
  end if;
end $$;

do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid = 'categories'::regclass
    and c.contype = 'f'
    and c.confrelid = 'categories'::regclass
    and a.attname = 'parent_id';
  if con_name is not null then
    execute format('alter table categories drop constraint %I', con_name);
  end if;
end $$;

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'categories'::regclass
    and contype = 'p';
  if con_name is not null then
    execute format('alter table categories drop constraint %I', con_name);
  end if;
end $$;

alter table categories add constraint categories_pkey primary key (user_id, id);

alter table categories add constraint categories_parent_id_fkey
  foreign key (user_id, parent_id) references categories (user_id, id);

-- `on delete set null` on a composite FK nulls *every* referencing column
-- by default — that would try to null out user_id too, which is not-null
-- and would break every category deletion. The `(category_id)` column
-- list (Postgres 15+) restricts it to just the column that should
-- actually go null, matching the original single-column FK's behaviour.
alter table transactions add constraint transactions_category_id_fkey
  foreign key (user_id, category_id) references categories (user_id, id)
  on delete set null (category_id);

alter table recurring add constraint recurring_category_id_fkey
  foreign key (user_id, category_id) references categories (user_id, id)
  on delete set null (category_id);

alter table rules add constraint rules_category_id_fkey
  foreign key (user_id, category_id) references categories (user_id, id) on delete cascade;
