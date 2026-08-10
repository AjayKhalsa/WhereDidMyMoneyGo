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
-- This scopes the key properly: `(user_id, id)` becomes the primary key,
-- and the self-referencing `parent_id` FK is rebuilt to match — a
-- composite FK where `parent_id` is NULL (every top-level category) is
-- simply not enforced for that row, which is exactly what's wanted.
--
-- Run this once in the Supabase SQL editor.

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'categories'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) like '%parent_id%';
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
