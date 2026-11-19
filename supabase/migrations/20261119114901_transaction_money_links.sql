-- Separate allocations preserve the bank ledger. RLS applies to every endpoint.
create table public.money_links (
 id text primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check(kind in ('CONTRIBUTION','PASS_THROUGH')),
 income_id text not null references public.transactions(id) on delete cascade,
 expense_id text references public.transactions(id) on delete cascade,
 amount bigint not null check(amount>0 and amount<=9007199254740991),
 created_at timestamptz not null default now(),
 check(income_id is distinct from expense_id)
);
create index money_links_owner on public.money_links(user_id);
create index money_links_income on public.money_links(income_id);
create index money_links_expense on public.money_links(expense_id);
alter table public.money_links enable row level security;
create policy money_links_owner on public.money_links for all to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.money_links to authenticated;

create function public.validate_money_link() returns trigger language plpgsql security invoker set search_path='' as $$
declare incoming public.transactions; outgoing public.transactions; used bigint;
begin
 -- Serialize allocations for one owner, including direct Data API writes.
 perform 1 from public.profiles where id=new.user_id for update;
 select * into incoming from public.transactions where id=new.income_id and user_id=new.user_id;
 if incoming.id is null or incoming.type<>'INCOME' or coalesce(incoming.is_refund,false) or incoming.category_id='adjustment' then raise exception 'Choose an incoming payment, excluding refunds and adjustments.'; end if;
 select coalesce(sum(amount),0) into used from public.money_links where user_id=new.user_id and income_id=new.income_id and id<>new.id;
 if used+new.amount>incoming.amount then raise exception 'Incoming payment is already allocated. Reload and reduce the linked amounts.'; end if;
 if new.expense_id is not null then
  select * into outgoing from public.transactions where id=new.expense_id and user_id=new.user_id;
  if outgoing.id is null or outgoing.type<>'EXPENSE' or outgoing.category_id='adjustment' then raise exception 'Choose an expense belonging to your account.'; end if;
  select coalesce(sum(amount),0) into used from public.money_links where user_id=new.user_id and expense_id=new.expense_id and id<>new.id;
  if used+new.amount>outgoing.amount then raise exception 'Linked funding exceeds the purchase amount.'; end if;
 end if;
 return new;
end $$;
create trigger validate_money_link before insert or update on public.money_links for each row execute function public.validate_money_link();

create function public.guard_linked_transaction() returns trigger language plpgsql security invoker set search_path='' as $$
declare incoming_used bigint; outgoing_used bigint;
begin
 if new.amount=old.amount and new.type=old.type and new.is_refund is not distinct from old.is_refund and new.category_id is not distinct from old.category_id then return new; end if;
 perform 1 from public.profiles where id=new.user_id for update;
 select coalesce(sum(amount),0) into incoming_used from public.money_links where income_id=new.id and user_id=new.user_id;
 select coalesce(sum(amount),0) into outgoing_used from public.money_links where expense_id=new.id and user_id=new.user_id;
 if (incoming_used>0 and (new.type<>'INCOME' or coalesce(new.is_refund,false) or new.category_id='adjustment' or new.amount<incoming_used)) or
    (outgoing_used>0 and (new.type<>'EXPENSE' or new.category_id='adjustment' or new.amount<outgoing_used)) then
  raise exception 'This edit conflicts with linked money. Remove or adjust the links first.';
 end if;
 return new;
end $$;
create trigger guard_linked_transaction before update on public.transactions for each row execute function public.guard_linked_transaction();

create function public.commit_money_links(p_expected jsonb,p_next jsonb) returns void
 language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); current_links jsonb;
begin
 if owner_id is null then raise exception 'Sign in before saving links.'; end if;
 if p_expected is null or p_next is null or jsonb_typeof(p_expected)<>'array' or jsonb_typeof(p_next)<>'array' or jsonb_array_length(p_next)>10000 then raise exception 'Invalid link data.'; end if;
 perform 1 from public.profiles where id=owner_id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'income_id',income_id,'expense_id',expense_id,'amount',amount) order by id),'[]'::jsonb)
 into current_links from public.money_links where user_id=owner_id;
 if current_links<>p_expected then raise exception 'Links changed in another session. Reload before saving.'; end if;
 delete from public.money_links where user_id=owner_id;
 insert into public.money_links(id,user_id,kind,income_id,expense_id,amount,created_at)
 select x.id,owner_id,x.kind,x.income_id,x.expense_id,x.amount,coalesce(x.created_at,now())
 from jsonb_to_recordset(p_next) as x(id text,kind text,income_id text,expense_id text,amount bigint,created_at timestamptz);
end $$;
revoke all on function public.commit_money_links(jsonb,jsonb) from public,anon;
grant execute on function public.commit_money_links(jsonb,jsonb) to authenticated;
revoke all on function public.validate_money_link() from public,anon;
revoke all on function public.guard_linked_transaction() from public,anon;
