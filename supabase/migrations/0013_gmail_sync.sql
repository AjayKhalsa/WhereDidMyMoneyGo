-- Gmail credentials and inbox are server-only. Browser roles have no grants.
begin;
create table public.gmail_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  refresh_token text not null,
  start_date date not null,
  aliases jsonb not null default '{}',
  page_token text,
  scan_after bigint,
  scan_started_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
create table public.gmail_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  status text not null default 'pending' check (status in ('pending','review','logged','ignored','duplicate')),
  subject text,
  candidate jsonb,
  reason text,
  event_key text,
  transaction_id text,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id),
  unique (user_id, event_key)
);
alter table public.gmail_connections enable row level security;
alter table public.gmail_messages enable row level security;
revoke all on public.gmail_connections, public.gmail_messages from anon, authenticated;
grant all on public.gmail_connections, public.gmail_messages to service_role;
create index gmail_messages_pending on public.gmail_messages(user_id,status,created_at);

create function public.gmail_acquire_lease(p_user uuid, p_lease uuid) returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.gmail_connections set lease_id=p_lease, lease_until=now()+interval '2 minutes'
  where user_id=p_user and (lease_until is null or lease_until < now());
  return found;
end $$;

-- The ledger insertion and inbox acknowledgement commit together. A retry, a
-- double click, or a concurrent cron request can never insert the email twice.
create function public.gmail_commit(
  p_user uuid, p_message text, p_type text, p_account text,
  p_destination text, p_category text, p_refund boolean,
  p_reviewed boolean default false, p_allow_duplicate boolean default false
) returns text language plpgsql set search_path = '' as $$
declare m public.gmail_messages; a jsonb; tid text; amt bigint; day timestamp; overlap boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select * into m from public.gmail_messages where user_id=p_user and message_id=p_message for update;
  if not found then raise exception 'Message not found'; end if;
  if m.status <> 'review' then return m.status; end if;
  a := m.candidate;
  amt := (a->>'amount')::bigint; day := (a->>'date')::date;
  if amt is null or amt <= 0 or day is null or p_type not in ('EXPENSE','INCOME','TRANSFER') then raise exception 'Invalid transaction'; end if;
  if not exists(select 1 from public.accounts where id=p_account and user_id=p_user and is_active) then raise exception 'Account not found'; end if;
  if p_type='TRANSFER' and (p_destination is null or p_destination=p_account or not exists(select 1 from public.accounts where id=p_destination and user_id=p_user and is_active)) then raise exception 'Choose a different destination'; end if;
  if (p_type='EXPENSE' or p_refund) and not exists(select 1 from public.categories where id=p_category and user_id=p_user) then raise exception 'Choose a category'; end if;
  if p_refund and p_type <> 'INCOME' then raise exception 'Invalid refund'; end if;
  if not p_reviewed and (p_type <> 'EXPENSE' or p_refund or p_account is distinct from a->>'accountId' or p_category is distinct from a->>'categoryId') then raise exception 'Review required'; end if;
  select exists(select 1 from public.transactions t where t.user_id=p_user and t.amount=amt
    and (t.account_id=p_account or t.to_account_id=p_account)
    and t.date >= day-interval '3 days' and t.date < day+interval '4 days') into overlap;
  if overlap and not (p_reviewed and p_allow_duplicate) then
    update public.gmail_messages set reason='Possible existing transaction with the same amount and account within three days.' where user_id=p_user and message_id=p_message;
    return 'review';
  end if;
  tid := 'gmail_' || replace(p_user::text,'-','') || '_' || p_message;
  insert into public.transactions(id,user_id,type,amount,description,date,merchant,account_id,to_account_id,category_id,is_refund,notes,source)
  values(tid,p_user,p_type,amt,a->>'merchant',day,a->>'merchant',p_account,
    case when p_type='TRANSFER' then p_destination end,
    case when p_type='EXPENSE' or p_refund then p_category end,p_refund,
    'Gmail bank alert; message ' || p_message || case when a->>'reference' is not null then '; reference ' || (a->>'reference') else '' end,'imported');
  update public.gmail_messages set status='logged',transaction_id=tid,reason=null where user_id=p_user and message_id=p_message;
  return 'logged';
end $$;
revoke all on function public.gmail_acquire_lease(uuid,uuid) from public,anon,authenticated;
revoke all on function public.gmail_commit(uuid,text,text,text,text,text,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.gmail_acquire_lease(uuid,uuid) to service_role;
grant execute on function public.gmail_commit(uuid,text,text,text,text,text,boolean,boolean,boolean) to service_role;
commit;
