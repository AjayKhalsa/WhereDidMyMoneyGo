-- Existing profiles RLS scopes reads and writes to auth.uid(). No new grants.
alter table public.profiles add column if not exists budget_plans jsonb not null default '[]'::jsonb
  check (jsonb_typeof(budget_plans) = 'array');
