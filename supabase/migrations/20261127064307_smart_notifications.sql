begin;
create function public.valid_notification_preferences(p jsonb) returns boolean
language plpgsql immutable strict security invoker set search_path='' as $$
declare k text; n numeric;
begin
 if jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>9 then return false;end if;
 foreach k in array array['bills','budgets','weeklyRecap','syncIssues','moneyPush','showDetails','quietHours'] loop
  if jsonb_typeof(p->k) is distinct from 'boolean' then return false;end if;
 end loop;
 foreach k in array array['quietStart','quietEnd'] loop
  if jsonb_typeof(p->k) is distinct from 'number' then return false;end if;
  n:=(p->>k)::numeric;if n<0 or n>23 or trunc(n)<>n then return false;end if;
 end loop;
 return not (p->>'quietHours')::boolean or p->>'quietStart'<>p->>'quietEnd';
end $$;
create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 settings jsonb not null default '{"bills":true,"budgets":true,"weeklyRecap":true,"syncIssues":true,"moneyPush":true,"showDetails":false,"quietHours":true,"quietStart":21,"quietEnd":9}'::jsonb check(public.valid_notification_preferences(settings)),
 last_checked_at timestamptz,
 updated_at timestamptz not null default now()
);
create table public.notification_state (
 user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null check(event_key ~ '^(bill|card|budget|recap|sync):[A-Za-z0-9_.:%-]{1,230}$'),
 read_at timestamptz,dismissed_at timestamptz,pushed_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(user_id,event_key)
);
create table public.notification_dispatches (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,channel text not null check(channel in ('money','sync')),
 token uuid not null,attempt integer not null check(attempt between 1 and 2),
 status text not null check(status in ('pending','sent','failed')),
 event_keys text[] not null,lease_until timestamptz not null,
 retry_after timestamptz,finished_at timestamptz,
 primary key(user_id,day,channel)
);
alter table public.notification_preferences enable row level security;
alter table public.notification_state enable row level security;
alter table public.notification_dispatches enable row level security;
revoke all on public.notification_preferences,public.notification_state,public.notification_dispatches from public,anon,authenticated;
grant select on public.notification_preferences,public.notification_state to authenticated;
grant all on public.notification_preferences,public.notification_state,public.notification_dispatches to service_role;
create policy "Read own notification preferences" on public.notification_preferences for select to authenticated using((select auth.uid())=user_id);
create policy "Read own notification state" on public.notification_state for select to authenticated using((select auth.uid())=user_id);

create function public.mark_notification_state(p_user uuid,p_keys text[],p_action text)
returns setof public.notification_state language plpgsql security invoker set search_path='' as $$
declare k text;
begin
 if cardinality(p_keys) is null or cardinality(p_keys)<1 or cardinality(p_keys)>50 or p_action is null or p_action not in ('read','dismiss','restore','pushed') then raise exception 'Invalid notification action';end if;
 if exists(select 1 from unnest(p_keys) x where x is null or x !~ '^(bill|card|budget|recap|sync):[A-Za-z0-9_.:%-]{1,230}$') then raise exception 'Invalid notification key';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 delete from public.notification_state where user_id=p_user and updated_at<now()-interval '90 days';
 if (select count(*) from public.notification_state where user_id=p_user)+(select count(distinct x) from unnest(p_keys) x where not exists(select 1 from public.notification_state s where s.user_id=p_user and s.event_key=x))>2000 then raise exception 'Notification state limit reached';end if;
 foreach k in array p_keys loop
  insert into public.notification_state as s(user_id,event_key,read_at,dismissed_at,pushed_at)
  values(p_user,k,case when p_action in ('read','dismiss') then now() end,case when p_action='dismiss' then now() end,case when p_action='pushed' then now() end)
  on conflict(user_id,event_key) do update set
   read_at=case when p_action='restore' then null when p_action in ('read','dismiss') then coalesce(s.read_at,now()) else s.read_at end,
   dismissed_at=case when p_action='restore' then null when p_action='dismiss' then now() else s.dismissed_at end,
   pushed_at=case when p_action='pushed' then now() else s.pushed_at end,updated_at=now();
 end loop;
 return query select * from public.notification_state where user_id=p_user and event_key=any(p_keys);
end $$;

create function public.claim_notification_dispatch(p_user uuid,p_day date,p_channel text,p_keys text[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare old public.notification_dispatches; ticket uuid;
begin
 if p_day is null or p_channel is null or p_day<>(now() at time zone 'Asia/Kolkata')::date or p_channel not in ('money','sync') or cardinality(p_keys) is null or cardinality(p_keys)<1 or cardinality(p_keys)>50 then raise exception 'Invalid notification dispatch';end if;
 if exists(select 1 from unnest(p_keys) x where x is null or x !~ '^(bill|card|budget|recap|sync):[A-Za-z0-9_.:%-]{1,230}$') then raise exception 'Invalid notification keys';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_channel,0));
 select * into old from public.notification_dispatches where user_id=p_user and day=p_day and channel=p_channel for update;
 if found and (old.status='sent' or old.attempt>=2 or old.lease_until>now() or coalesce(old.retry_after,'-infinity'::timestamptz)>now()) then return null;end if;
 delete from public.notification_dispatches where user_id=p_user and day<current_date-90;
 ticket:=gen_random_uuid();
 insert into public.notification_dispatches(user_id,day,channel,token,attempt,status,event_keys,lease_until)
 values(p_user,p_day,p_channel,ticket,coalesce(old.attempt,0)+1,'pending',p_keys,now()+interval '5 minutes')
 on conflict(user_id,day,channel) do update set token=excluded.token,attempt=excluded.attempt,status='pending',event_keys=excluded.event_keys,lease_until=excluded.lease_until,retry_after=null,finished_at=null;
 return ticket;
end $$;
create function public.finish_notification_dispatch(p_user uuid,p_day date,p_channel text,p_token uuid,p_sent boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare dispatch public.notification_dispatches;
begin
 select * into dispatch from public.notification_dispatches where user_id=p_user and day=p_day and channel=p_channel and token=p_token and status='pending' for update;
 if not found then return false;end if;
 if p_sent then perform public.mark_notification_state(p_user,dispatch.event_keys,'pushed');end if;
 update public.notification_dispatches set status=case when p_sent then 'sent' else 'failed' end,finished_at=now(),lease_until=now(),retry_after=case when not p_sent then now()+interval '1 hour' end
 where user_id=p_user and day=p_day and channel=p_channel and token=p_token;
 return true;
end $$;
create function public.notification_recipients() returns setof uuid language sql stable security invoker set search_path='' as $$
 select p.user_id from public.push_subscriptions p left join public.notification_preferences n on n.user_id=p.user_id group by p.user_id,n.last_checked_at order by n.last_checked_at nulls first,p.user_id limit 5
$$;
create function public.notification_sync_status(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('state',case when g.last_error is not null then 'failed' when g.page_token is not null or g.receipt_scan->>'before' is not null or exists(select 1 from public.gmail_messages m where m.user_id=p_user and m.status='pending') then 'incomplete' when g.last_synced_at is null or g.last_synced_at<now()-interval '12 hours' then 'stale' else 'ok' end,'lastCheckedAt',g.last_synced_at) from public.gmail_connections g where g.user_id=p_user),' {"state":"disconnected"}'::jsonb)
$$;
revoke all on function public.mark_notification_state(uuid,text[],text),public.claim_notification_dispatch(uuid,date,text,text[]),public.finish_notification_dispatch(uuid,date,text,uuid,boolean),public.notification_recipients(),public.notification_sync_status(uuid) from public,anon,authenticated;
grant execute on function public.mark_notification_state(uuid,text[],text),public.claim_notification_dispatch(uuid,date,text,text[]),public.finish_notification_dispatch(uuid,date,text,uuid,boolean),public.notification_recipients(),public.notification_sync_status(uuid) to service_role;
alter table public.push_subscriptions add column device_name text not null default 'Browser' check(length(device_name) between 1 and 80),add column last_test_at timestamptz;
commit;
