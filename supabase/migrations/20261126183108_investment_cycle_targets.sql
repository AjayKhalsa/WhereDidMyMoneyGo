-- Existing investment ownership/RLS applies to this optional settings column.
create or replace function public.valid_investment_cycle_targets(targets jsonb)
returns boolean language plpgsql immutable strict security invoker
set search_path = '' as $$
declare item record; amount numeric;
begin
  if jsonb_typeof(targets) <> 'object' then return false; end if;
  for item in select key, value from jsonb_each(targets) loop
    if item.key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(item.key::date, 'YYYY-MM-DD') <> item.key then return false; end if;
    if jsonb_typeof(item.value) <> 'number' then return false; end if;
    amount := item.value::text::numeric;
    if amount < 0 or amount > 9007199254740991 or trunc(amount) <> amount then return false; end if;
  end loop;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;

alter table public.investments add column cycle_targets jsonb default '{}'::jsonb;
alter table public.investments add constraint investments_valid_cycle_targets
  check (cycle_targets is null or public.valid_investment_cycle_targets(cycle_targets));
comment on column public.investments.cycle_targets is 'Paise targets keyed by exact salary-cycle start date. Missing keys use monthly_contribution; zero pauses that cycle.';
