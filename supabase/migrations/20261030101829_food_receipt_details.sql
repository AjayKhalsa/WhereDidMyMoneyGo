begin;
-- Receipt enrichment is evidence attached to a canonical financial event.
-- This migration does not alter existing ledger rows or source receipts.
create table public.food_receipt_details (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('Swiggy','Zomato')),
 order_id text not null check(order_id ~ '^[0-9]{8,25}$'),
 transaction_id text references public.transactions(id) on delete set null,
 first_message_id text not null check(first_message_id ~ '^[a-f0-9]{8,64}$'),
 paid_amount bigint not null check(paid_amount > 0),
 received_on date not null,
 restaurant text check(length(restaurant) between 1 and 120),
 outlet_address text check(length(outlet_address) between 8 and 400 and outlet_address !~* '(delivery address|deliver to|customer address|recipient)'),
 link_basis text not null check(link_basis in ('user_confirmation','order_reference')),
 created_at timestamptz not null default now(),
 primary key(user_id,provider,order_id)
);
alter table public.food_receipt_details enable row level security;
create policy "read own food receipt details" on public.food_receipt_details for select to authenticated using((select auth.uid())=user_id);
revoke all on public.food_receipt_details from public,anon,authenticated;
grant select on public.food_receipt_details to authenticated;
grant all on public.food_receipt_details to service_role;
create index food_receipt_details_transaction on public.food_receipt_details(user_id,transaction_id);

-- Server-only: the route re-fetches/authenticates Gmail and parses receipt
-- fields itself. The browser cannot supply restaurant/address/financial data.
create function public.link_food_receipt(p_user uuid,p_message text,p_transaction text,p_receipt jsonb,p_received date,p_expected jsonb,p_confirmed boolean)
returns text language plpgsql set search_path='' as $$
declare t public.transactions; existing public.food_receipt_details; src public.transaction_sources; provider_name text; order_number text; paid bigint; ids text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_confirmed is null then raise exception 'Explicit receipt confirmation required';end if;
 provider_name:=p_receipt->>'provider';order_number:=p_receipt->>'orderId';paid:=(p_receipt->>'paidAmount')::bigint;
 if provider_name not in ('Swiggy','Zomato') or provider_name is null or order_number is null or order_number !~ '^[0-9]{8,25}$' or paid is null or paid<=0 or p_message is null or p_message !~ '^[a-f0-9]{8,64}$' or p_received is null then raise exception 'Invalid receipt';end if;
 if exists(select 1 from jsonb_object_keys(p_receipt) k where k not in ('provider','orderId','paidAmount','restaurant','outletAddress')) then raise exception 'Unsupported receipt fields';end if;
 if exists(select 1 from public.gmail_messages where user_id=p_user and message_id=p_message and status in ('ignored','duplicate')) then return 'dismissed';end if;
 if exists(select 1 from public.gmail_messages m where m.user_id=p_user and m.message_id=p_message and m.status='logged' and (m.transaction_id is null or not exists(select 1 from public.transactions x where x.user_id=p_user and x.id=m.transaction_id))) then return 'removed';end if;
 if exists(select 1 from public.gmail_messages where user_id=p_user and message_id=p_message and transaction_id is not null and transaction_id<>p_transaction) then return 'conflict';end if;
 select * into existing from public.food_receipt_details where user_id=p_user and provider=provider_name and order_id=order_number;
 if found then
  if existing.transaction_id is null then return 'removed';end if;
  if existing.transaction_id<>p_transaction or existing.paid_amount<>paid then return 'conflict';end if;
  if (existing.restaurant is not null and p_receipt->>'restaurant' is not null and existing.restaurant<>p_receipt->>'restaurant') or (existing.outlet_address is not null and p_receipt->>'outletAddress' is not null and existing.outlet_address<>p_receipt->>'outletAddress') then return 'conflict';end if;
 end if;
 select * into t from public.transactions where id=p_transaction and user_id=p_user for update;
 if not found then return 'removed';end if;
 if to_jsonb(t) is distinct from p_expected then return 'changed';end if;
 if t.type<>'EXPENSE' or t.category_id='adjustment' or t.amount<>paid or t.account_id is null or abs(t.date::date-p_received)>1 or t.date::date>(now() at time zone 'Asia/Kolkata')::date or not exists(select 1 from public.accounts where id=t.account_id and user_id=p_user) then return 'conflict';end if;
 if not p_confirmed and existing.transaction_id is null then
  select array_agg(x.id) into ids from public.transactions x where x.user_id=p_user and x.type='EXPENSE' and x.category_id is distinct from 'adjustment' and x.amount=paid and abs(x.date::date-p_received)<=1
   and (coalesce(x.merchant,'')||' '||x.description||' '||coalesce(x.notes,'')) ~* ('\m'||provider_name||'\M')
   and (coalesce(x.merchant,'')||' '||x.description||' '||coalesce(x.notes,'')) ~* ('\morder([[:space:]]*(id|no[.]?|number))?[[:space:]]*[:#-]?[[:space:]]*'||order_number||'\M');
  if coalesce(cardinality(ids),0)<>1 or ids[1]<>t.id then return 'confirmation_required';end if;
 end if;
 -- Do not attach two distinct orders to one payment merely
 -- because amount/date happen to match (split orders require separate evidence).
 if exists(select 1 from public.food_receipt_details where user_id=p_user and transaction_id=t.id and (provider<>provider_name or order_id<>order_number)) then return 'conflict';end if;
 select * into src from public.transaction_sources where user_id=p_user and source_kind='gmail' and source_key=p_message;
 if found then
  if src.transaction_id is null then return 'removed';end if;
  if src.transaction_id<>t.id or src.account_id is distinct from t.account_id or src.direction<>'debit' or src.amount<>paid then return 'conflict';end if;
  if existing.transaction_id is not null then return 'already_linked';end if;
 end if;
 insert into public.food_receipt_details(user_id,provider,order_id,transaction_id,first_message_id,paid_amount,received_on,restaurant,outlet_address,link_basis)
 values(p_user,provider_name,order_number,t.id,p_message,paid,p_received,p_receipt->>'restaurant',p_receipt->>'outletAddress',case when p_confirmed then 'user_confirmation' else 'order_reference' end) on conflict(user_id,provider,order_id) do nothing;
 insert into public.transaction_sources(user_id,source_kind,source_key,transaction_id,account_id,direction,amount,occurred_on,payload_hash,match_reason)
 values(p_user,'gmail',p_message,t.id,t.account_id,'debit',t.amount,t.date::date,encode(sha256(convert_to(p_receipt::text,'UTF8')),'hex'),case when p_confirmed then 'User-confirmed completed food receipt; ledger fields preserved' else 'Exact provider/order reference; ledger fields preserved' end) on conflict(user_id,source_kind,source_key) do nothing;
 return 'linked';
end $$;
revoke all on function public.link_food_receipt(uuid,text,text,jsonb,date,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.link_food_receipt(uuid,text,text,jsonb,date,jsonb,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
