begin;
-- Device capabilities stay server-only and encrypted with user-bound AAD.
create table public.push_subscriptions (
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint_hash text not null,
 subscription text not null,
 created_at timestamptz not null default now(),
 last_notice text,
 last_sent_at timestamptz,
 delivery_failed boolean not null default false,
 primary key(user_id,endpoint_hash)
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon,authenticated;
grant all on public.push_subscriptions to service_role;
create function public.register_push_subscription(p_user uuid,p_hash text,p_subscription text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if not exists(select 1 from public.push_subscriptions where user_id=p_user and endpoint_hash=p_hash)
 and (select count(*) from public.push_subscriptions where user_id=p_user)>=8 then
  raise exception 'Device limit reached';
 end if;
 insert into public.push_subscriptions(user_id,endpoint_hash,subscription) values(p_user,p_hash,p_subscription)
 on conflict(user_id,endpoint_hash) do update set subscription=excluded.subscription,delivery_failed=false;
end $$;
revoke all on function public.register_push_subscription(uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_push_subscription(uuid,text,text) to service_role;
commit;
