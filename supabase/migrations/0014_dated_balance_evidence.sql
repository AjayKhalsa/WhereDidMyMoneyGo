-- Additive evidence only: no opening amounts or transactions are changed.
begin;
alter table public.accounts add column opening_balance_as_of date;
alter table public.accounts add column reconciliation jsonb;
create function public.invalidate_balance_evidence() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='accounts' then
    if (new.opening_balance,new.opening_balance_as_of,new.type) is distinct from
       (old.opening_balance,old.opening_balance_as_of,old.type) and new.reconciliation is not null then
      new.reconciliation=jsonb_set(new.reconciliation,'{status}','"stale"'::jsonb);
    end if;
    return new;
  end if;
  if tg_op='UPDATE' and (new.type,new.amount,new.date,new.account_id,new.to_account_id,new.is_refund)
    is not distinct from (old.type,old.amount,old.date,old.account_id,old.to_account_id,old.is_refund) then return new; end if;
  if tg_op<>'INSERT' then
    update public.accounts set reconciliation=jsonb_set(reconciliation,'{status}','"stale"'::jsonb)
      where user_id=old.user_id and id in (old.account_id,old.to_account_id)
        and reconciliation is not null and old.date::date <= (reconciliation->>'asOf')::date;
  end if;
  if tg_op<>'DELETE' then
    update public.accounts set reconciliation=jsonb_set(reconciliation,'{status}','"stale"'::jsonb)
      where user_id=new.user_id and id in (new.account_id,new.to_account_id)
        and reconciliation is not null and new.date::date <= (reconciliation->>'asOf')::date;
    return new;
  end if;
  return old;
end $$;
create trigger transaction_balance_evidence after insert or update or delete on public.transactions
  for each row execute function public.invalidate_balance_evidence();
create trigger opening_balance_evidence before update on public.accounts
  for each row execute function public.invalidate_balance_evidence();
revoke all on function public.invalidate_balance_evidence() from public,anon,authenticated;
commit;
