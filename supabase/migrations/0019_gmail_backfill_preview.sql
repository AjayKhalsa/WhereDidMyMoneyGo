-- Historical discovery is isolated from the ordinary pending receipt queue.
-- A preview never calls ledger import RPCs or resets dismissed receipts.
create table public.gmail_backfill_runs (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 start_date date not null,
 end_date date not null check (end_date >= start_date and end_date-start_date <= 100),
 query text not null,
 page_token text,
 discovery_complete boolean not null default false,
 status text not null default 'scanning' check (status in ('scanning','attention','complete')),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 last_error text,
 unique(id,user_id)
);
create unique index gmail_backfill_one_active on public.gmail_backfill_runs(user_id) where status <> 'complete';
create table public.gmail_backfill_items (
 run_id uuid not null,
 user_id uuid not null,
 message_id text not null,
 status text not null default 'pending' check(status in ('pending','matched','proposed','review','ignored','skipped','failed')),
 attempts integer not null default 0,
 subject text,
 candidate jsonb,
 reason text,
 matched_transaction_id text,
 subscription jsonb,
 primary key(run_id,message_id),
 foreign key(run_id,user_id) references public.gmail_backfill_runs(id,user_id) on delete cascade
);
create index gmail_backfill_queue on public.gmail_backfill_items(user_id,run_id,status,message_id);
alter table public.gmail_backfill_runs enable row level security;
alter table public.gmail_backfill_items enable row level security;
create policy backfill_runs_own_read on public.gmail_backfill_runs for select to authenticated using(user_id=auth.uid());
create policy backfill_items_own_read on public.gmail_backfill_items for select to authenticated using(user_id=auth.uid());
revoke all on public.gmail_backfill_runs,public.gmail_backfill_items from anon,authenticated;
grant select on public.gmail_backfill_runs,public.gmail_backfill_items to authenticated;
grant all on public.gmail_backfill_runs,public.gmail_backfill_items to service_role;
