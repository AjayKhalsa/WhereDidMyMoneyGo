begin;
create function public.finance_row_image(j jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(case when j->'is_refund'='false'::jsonb then j-'is_refund' else j end)
  -case when j->'is_default'='false'::jsonb then 'is_default' else '__absent__' end
  #-'{reconciliation,status}'
$$;
create function public.finance_context_image(j jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('type',c->>'type','value',c->>'value') order by c->>'type',c->>'value'),'[]'::jsonb)
 from jsonb_array_elements(coalesce(j,'[]'::jsonb)) c
$$;

create function public.commit_reconciliation(p_changes jsonb,p_checks jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();tbl text;cols text;e jsonb;afterrow jsonb;beforerow jsonb;currentrow jsonb;
 ctx jsonb;wantedctx jsonb;result jsonb;t public.transactions;a public.accounts;checkrow jsonb;actual bigint;
begin
 if u is null then raise exception 'Not signed in';end if;
 if jsonb_typeof(p_changes)<>'object' or jsonb_typeof(p_checks)<>'array' or jsonb_array_length(p_checks)=0 then raise exception 'Invalid reconciliation';end if;
 if exists(select 1 from jsonb_object_keys(p_changes) k where k not in ('accounts','credit_cards','investments','transactions')) then raise exception 'Unsupported reconciliation table';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 -- Contexts and manual saves share this user lock as well as the transaction
 -- locks below. Comparisons and all writes run in the same database transaction.
 for tbl in select unnest(array['accounts','credit_cards','investments','transactions']) loop
  if p_changes->tbl is null then continue;end if;
  if jsonb_typeof(p_changes->tbl)<>'array' or jsonb_array_length(p_changes->tbl)>10000 then raise exception 'Invalid batch size';end if;
  for e in select value from jsonb_array_elements(p_changes->tbl)
    order by ((value->'after'->>'reverses_transaction_id') is not null)::int loop
   afterrow:=(e->'after')||jsonb_build_object('user_id',u);
   if nullif(afterrow->>'id','') is null then raise exception 'Missing stable ID';end if;
   execute format('select to_jsonb(x) from public.%I x where id=$1 for update',tbl) into currentrow using afterrow->>'id';
   if currentrow is not null and currentrow->>'user_id'<>u::text then raise exception 'Row is not owned by this user';end if;
   execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',tbl) into afterrow using afterrow;
   beforerow:=null;
   if e->'before' is not null and e->'before'<>'null'::jsonb then
    execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',tbl) into beforerow using (e->'before')||jsonb_build_object('user_id',u);
    if beforerow->>'id'<>afterrow->>'id' then raise exception 'Cannot change a canonical ID';end if;
   end if;
   ctx:='[]';wantedctx:=public.finance_context_image(e->'afterContexts');
   if tbl='transactions' then
    select coalesce(jsonb_agg(jsonb_build_object('type',c.type,'value',c.value) order by c.type,c.value),'[]'::jsonb)
     into ctx from public.transaction_contexts c where c.transaction_id=afterrow->>'id' and c.user_id=u;
   end if;
   if currentrow is not null and public.finance_row_image(currentrow)=public.finance_row_image(afterrow) and (tbl<>'transactions' or ctx=wantedctx) then continue;end if;
   if public.finance_row_image(currentrow) is distinct from public.finance_row_image(beforerow)
      or (tbl='transactions' and ctx<>public.finance_context_image(e->'beforeContexts')) then
     raise exception 'Saved entry changed since this reconciliation was prepared; export fresh data';end if;
   if tbl='credit_cards' and not exists(select 1 from public.accounts where id=afterrow->>'account_id' and user_id=u and type='CREDIT_CARD') then raise exception 'Card account is not owned';end if;
   if tbl='transactions' then
    select * into t from jsonb_populate_record(null::public.transactions,afterrow);
    if t.amount is null or t.amount<=0 or t.date is null or t.type not in ('EXPENSE','INCOME','TRANSFER','INVESTMENT') then raise exception 'Invalid accounting row';end if;
    if (t.account_id is not null and not exists(select 1 from public.accounts where id=t.account_id and user_id=u)) or
       (t.to_account_id is not null and not exists(select 1 from public.accounts where id=t.to_account_id and user_id=u)) or
       (t.category_id is not null and not exists(select 1 from public.categories where id=t.category_id and user_id=u)) or
       (t.investment_id is not null and not exists(select 1 from public.investments where id=t.investment_id and user_id=u)) or
       (t.goal_id is not null and not exists(select 1 from public.goals where id=t.goal_id and user_id=u)) or
       (t.recurring_id is not null and not exists(select 1 from public.recurring where id=t.recurring_id and user_id=u)) or
       (t.reverses_transaction_id is not null and not exists(select 1 from public.transactions where id=t.reverses_transaction_id and user_id=u and type='EXPENSE')) then raise exception 'Referenced row is not owned';end if;
    if t.type='TRANSFER' and (t.to_account_id is null or t.to_account_id=t.account_id) then raise exception 'Invalid destination';end if;
    if (t.is_refund and t.type<>'INCOME') or (t.reverses_transaction_id is not null and not coalesce(t.is_refund,false)) then raise exception 'Invalid refund';end if;
    for checkrow in select value from jsonb_array_elements(wantedctx) loop
     if checkrow->>'type' not in ('PEOPLE','PURPOSE','OCCASION','ATTRIBUTE') or nullif(checkrow->>'value','') is null then raise exception 'Invalid context';end if;
    end loop;
    for a in select * from public.accounts where user_id=u and type<>'INVESTMENT' and id in(t.account_id,t.to_account_id,beforerow->>'account_id',beforerow->>'to_account_id') loop
     if not exists(select 1 from jsonb_array_elements(p_checks) c where c->>'accountId'=a.id) then raise exception 'Every affected account needs a closing check';end if;
    end loop;
    if currentrow is null then
     result:=public.import_financial_event(u,'reconciliation',t.id,t.account_id,case when t.type='INCOME' then 'credit' else 'debit' end,
       t.date::date,public.ledger_bank_reference(t.notes,t.description),afterrow,wantedctx,null,null,coalesce((e->>'allowSeparate')::boolean,false));
     if result->>'status' not in ('created','matched') or result->>'transactionId'<>t.id then raise exception 'Existing or ambiguous financial event: rebuild the reconciliation with canonical IDs';end if;
     continue;
    end if;
   elsif tbl='accounts' and afterrow->>'type'<>'INVESTMENT' then
    if not exists(select 1 from jsonb_array_elements(p_checks) c where c->>'accountId'=afterrow->>'id') then raise exception 'Affected account needs a closing check';end if;
   end if;
   cols:=case tbl
    when 'accounts' then 'name=excluded.name,type=excluded.type,opening_balance=excluded.opening_balance,is_active=excluded.is_active,hint=excluded.hint,is_default=excluded.is_default,created_at=excluded.created_at,last_reconciled_at=excluded.last_reconciled_at,opening_balance_as_of=excluded.opening_balance_as_of,reconciliation=excluded.reconciliation'
    when 'credit_cards' then 'account_id=excluded.account_id,statement_day=excluded.statement_day,due_day=excluded.due_day,credit_limit=excluded.credit_limit'
    when 'investments' then 'name=excluded.name,kind=excluded.kind,monthly_contribution=excluded.monthly_contribution,is_active=excluded.is_active,created_at=excluded.created_at,current_value=excluded.current_value,valued_at=excluded.valued_at'
    when 'transactions' then 'type=excluded.type,amount=excluded.amount,description=excluded.description,date=excluded.date,merchant=excluded.merchant,account_id=excluded.account_id,to_account_id=excluded.to_account_id,category_id=excluded.category_id,investment_id=excluded.investment_id,notes=excluded.notes,recurring_id=excluded.recurring_id,goal_id=excluded.goal_id,is_refund=excluded.is_refund,reverses_transaction_id=excluded.reverses_transaction_id,source=excluded.source,created_at=excluded.created_at,updated_at=excluded.updated_at' end;
   execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set %s',tbl,tbl,cols) using afterrow;
   if tbl='transactions' then
    delete from public.transaction_contexts where transaction_id=t.id and user_id=u;
    insert into public.transaction_contexts(transaction_id,user_id,type,value)
     select t.id,u,c->>'type',c->>'value' from jsonb_array_elements(wantedctx) c on conflict do nothing;
   end if;
  end loop;
 end loop;
 for checkrow in select value from jsonb_array_elements(p_checks) loop
  select * into a from public.accounts where id=checkrow->>'accountId' and user_id=u;
  if not found then raise exception 'Checkpoint account not found';end if;
  select case when a.type='CREDIT_CARD' then coalesce(sum(case
    when ledger.type='EXPENSE' and ledger.account_id=a.id then ledger.amount
    when ledger.type='TRANSFER' and ledger.to_account_id=a.id then -ledger.amount
    when ledger.type='TRANSFER' and ledger.account_id=a.id then ledger.amount
    when ledger.type='INCOME' and ledger.is_refund and ledger.account_id=a.id then -ledger.amount else 0 end),0)
   else a.opening_balance+coalesce(sum(case when ledger.account_id=a.id then case when ledger.type='INCOME' then ledger.amount else -ledger.amount end else 0 end+
    case when ledger.type='TRANSFER' and ledger.to_account_id=a.id then ledger.amount else 0 end),0) end into actual
   from public.transactions ledger where ledger.user_id=u and ledger.date::date<=(checkrow->>'asOf')::date;
  if actual is distinct from (checkrow->>'balance')::bigint then raise exception 'Closing balance does not tally; all changes rolled back';end if;
 end loop;
end $$;
revoke all on function public.finance_row_image(jsonb),public.finance_context_image(jsonb),public.commit_reconciliation(jsonb,jsonb) from public,anon;
revoke all on function public.finance_row_image(jsonb),public.finance_context_image(jsonb) from authenticated;
grant execute on function public.commit_reconciliation(jsonb,jsonb) to authenticated;
commit;
