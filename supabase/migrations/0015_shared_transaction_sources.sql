-- Shared provenance, not a second financial ledger. No transactions are edited.
begin;
create table public.transaction_sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check(source_kind in ('reference','gmail','statement','reconciliation','ledger')),
  source_key text not null check(length(source_key) between 1 and 512),
  transaction_id text references public.transactions(id) on delete set null,
  account_id text references public.accounts(id) on delete set null,
  direction text not null check(direction in ('debit','credit')),
  amount bigint not null check(amount>0),
  occurred_on date not null,
  bank_reference text,
  payload_hash text,
  match_reason text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,source_kind,source_key)
);
alter table public.transaction_sources enable row level security;
create policy "read own source receipts" on public.transaction_sources for select using(auth.uid()=user_id);
revoke all on public.transaction_sources from public,anon,authenticated;
grant select on public.transaction_sources to authenticated;
grant all on public.transaction_sources to service_role;
create index transaction_sources_transaction on public.transaction_sources(user_id,transaction_id);

create function public.normalized_bank_reference(v text) returns text
language sql immutable set search_path='' as $$
 select case when normalized ~ '^[A-Z0-9]{8,64}$' and normalized ~ '[0-9]' then normalized end
 from (select case when trim(v) ~ '^[0-9]+$' then regexp_replace(trim(v),'^0+(?=[0-9])','') else upper(trim(v)) end as normalized) s
$$;
create function public.ledger_bank_reference(notes text,description text) returns text
language sql immutable set search_path='' as $$
 select public.normalized_bank_reference(coalesce(
  substring(coalesce(notes,'')||' '||coalesce(description,'') from '(?i)\m(?:reference|rrn|utr|ref)(?:\s*[:#]\s*|\s+)([A-Z0-9]{8,64})\M'),
  substring(coalesce(description,'') from '(?i)\mUPI[-/]([0-9]{10,30})[-/]')))
$$;
create function public.financial_direction(t public.transactions,account text) returns text
language sql immutable set search_path='' as $$
 select case when t.type='TRANSFER' and t.to_account_id=account then 'credit'
   when t.account_id=account then case when t.type='INCOME' then 'credit' else 'debit' end end
$$;

-- All ledger writers serialize with Gmail/import/reconciliation, including
-- ordinary user edits. An import never races a manual bank/category edit.
create function public.lock_financial_write() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then perform pg_advisory_xact_lock(hashtextextended(old.user_id::text,0));return old;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));return new;
end $$;
create trigger serialize_financial_writes before insert or update or delete on public.transactions
 for each row execute function public.lock_financial_write();
create trigger serialize_financial_contexts before insert or update or delete on public.transaction_contexts
 for each row execute function public.lock_financial_write();

-- Take the authenticated writer's lock before PostgreSQL obtains row locks;
-- the row trigger also covers trusted server jobs with no browser JWT.
create function public.lock_financial_statement() returns trigger
language plpgsql set search_path='' as $$
begin
 if auth.uid() is not null then perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));end if;
 return null;
end $$;
do $$ declare tbl text;begin
 foreach tbl in array array['accounts','credit_cards','investments','transactions','transaction_contexts'] loop
  execute format('create trigger serialize_financial_statement before insert or update or delete on public.%I for each statement execute function public.lock_financial_statement()',tbl);
 end loop;
end $$;

-- Internal entry point. Browser calls use authenticated wrappers below;
-- server-only Gmail uses the explicit trusted user argument.
create function public.import_financial_event(p_user uuid,p_kind text,p_key text,p_account text,
 p_direction text,p_date date,p_reference text,p_tx jsonb,p_contexts jsonb default '[]',
 p_hash text default null,p_existing text default null,p_separate boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.transaction_sources;r public.transactions;ref text;refkey text;tid text;
 n int;ids text[];reason text;was_created boolean:=false;ctx jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_kind not in ('gmail','statement','reconciliation') or p_key is null or length(p_key) not between 1 and 512
   or p_date is null or p_direction not in ('debit','credit') then raise exception 'Invalid source identity';end if;
 if not exists(select 1 from public.accounts where id=p_account and user_id=p_user and is_active) then raise exception 'Account not found';end if;
 select * into r from jsonb_populate_record(null::public.transactions,p_tx||jsonb_build_object('user_id',p_user));
 if r.id is null or r.amount is null or r.amount<=0 or r.date is null or r.description is null
   or r.type not in ('EXPENSE','INCOME','TRANSFER','INVESTMENT')
   or public.financial_direction(r,p_account) is distinct from p_direction
   or abs(r.date::date-p_date)>3 then raise exception 'Invalid financial event direction, date or amount';end if;
 if r.account_id is null or not exists(select 1 from public.accounts where id=r.account_id and user_id=p_user and is_active)
   or (r.to_account_id is not null and not exists(select 1 from public.accounts where id=r.to_account_id and user_id=p_user and is_active))
   then raise exception 'Account not found';end if;
 if r.type='TRANSFER' and (r.to_account_id is null or r.to_account_id=r.account_id) then raise exception 'Choose a different destination';end if;
 if r.category_id is not null and not exists(select 1 from public.categories where id=r.category_id and user_id=p_user) then raise exception 'Category not found';end if;
 if r.investment_id is not null and not exists(select 1 from public.investments where id=r.investment_id and user_id=p_user) then raise exception 'Investment not found';end if;
 if r.goal_id is not null and not exists(select 1 from public.goals where id=r.goal_id and user_id=p_user) then raise exception 'Goal not found';end if;
 if r.recurring_id is not null and not exists(select 1 from public.recurring where id=r.recurring_id and user_id=p_user) then raise exception 'Recurring rule not found';end if;
 if r.is_refund and r.type<>'INCOME' then raise exception 'Invalid refund';end if;
 if r.reverses_transaction_id is not null and (not coalesce(r.is_refund,false) or not exists(select 1 from public.transactions where id=r.reverses_transaction_id and user_id=p_user and type='EXPENSE')) then raise exception 'Invalid original refund transaction';end if;
 if jsonb_typeof(p_contexts)<>'array' then raise exception 'Invalid contexts';end if;
 for ctx in select value from jsonb_array_elements(p_contexts) loop
  if ctx->>'type' not in ('PEOPLE','PURPOSE','OCCASION','ATTRIBUTE') or nullif(ctx->>'value','') is null then raise exception 'Invalid context';end if;
 end loop;
 ref:=public.normalized_bank_reference(p_reference);
 refkey:=p_account||'|'||p_direction||'|'||r.amount::text||'|'||coalesce(ref,'');
 select * into s from public.transaction_sources where user_id=p_user and source_kind=p_kind and source_key=p_key;
 if found then
  if s.transaction_id is null then return jsonb_build_object('status','removed','reason','Previously removed transaction; review before restoring.');end if;
  if s.account_id is distinct from p_account or s.amount<>r.amount or s.direction<>p_direction or abs(s.occurred_on-p_date)>3 then
   return jsonb_build_object('status','review','reason','Source identity conflicts with its saved financial details.');end if;
  tid:=s.transaction_id;reason:='existing source';
 end if;
 if tid is null and ref is not null then
  select * into s from public.transaction_sources where user_id=p_user and source_kind='reference' and source_key=refkey;
  if found then
   if s.transaction_id is null then return jsonb_build_object('status','removed','reason','Previously removed reference; review before restoring.');end if;
   if abs(s.occurred_on-p_date)>3 then return jsonb_build_object('status','review','reason','Reference reused outside the posting-date window.');end if;
   tid:=s.transaction_id;reason:='bank reference';
  end if;
 end if;
 if tid is null and p_existing is not null then tid:=p_existing;reason:='explicit user match';end if;
 if tid is null and exists(select 1 from public.transaction_sources ts where ts.user_id=p_user and ts.transaction_id is null
   and (ts.account_id=p_account or ts.account_id is null) and ts.direction=p_direction and ts.amount=r.amount and abs(ts.occurred_on-p_date)<=3) then
   return jsonb_build_object('status','review','reason','A previously removed source may represent this payment. Review before restoring it.');end if;
 if tid is null and ref is not null then
  select array_agg(t.id) into ids from public.transactions t where t.user_id=p_user and t.amount=r.amount
    and public.financial_direction(t,p_account)=p_direction and abs(t.date::date-p_date)<=3
    and (public.ledger_bank_reference(t.notes,t.description)=ref or exists(
      select 1 from public.transaction_sources ts where ts.user_id=p_user and ts.transaction_id=t.id
        and ts.bank_reference=ref and (ts.account_id=p_account or t.type='TRANSFER')));
  if cardinality(ids)=1 then tid:=ids[1];reason:='unique legacy bank reference';
  elsif cardinality(ids)>1 then return jsonb_build_object('status','review','reason','Several saved entries share this reference; choose the canonical entry.');end if;
 end if;
 if tid is not null then
  if p_existing is not null and p_existing<>tid then return jsonb_build_object('status','review','reason','Chosen match conflicts with the saved source identity.');end if;
  if not exists(select 1 from public.transactions t where t.id=tid and t.user_id=p_user and t.amount=r.amount
      and public.financial_direction(t,p_account)=p_direction and abs(t.date::date-p_date)<=3) then
   return jsonb_build_object('status','review','reason','The saved entry changed; review its account, direction, date and amount.');end if;
 else
  -- A collision is only a review signal. Distinct proven bank references
  -- preserve legitimate same-day, same-amount repeated payments.
  if not p_separate and exists(select 1 from public.transactions t where t.user_id=p_user and t.amount=r.amount
    and public.financial_direction(t,p_account)=p_direction and abs(t.date::date-p_date)<=3
    and (ref is null or public.ledger_bank_reference(t.notes,t.description) is null or public.ledger_bank_reference(t.notes,t.description)=ref)
    and not (ref is not null and exists(select 1 from public.transaction_sources ts where ts.user_id=p_user and ts.transaction_id=t.id
      and ts.account_id=p_account and ts.direction=p_direction and ts.bank_reference is not null and ts.bank_reference<>ref))) then
    return jsonb_build_object('status','review','reason','Possible existing transaction: link a saved entry or explicitly confirm a separate payment.');
  end if;
  if exists(select 1 from public.accounts where id=p_account and opening_balance_as_of>p_date) then return jsonb_build_object('status','review','reason','This entry predates the opening balance. Reconcile the starting history first.');end if;
  if exists(select 1 from public.transactions where id=r.id) then return jsonb_build_object('status','review','reason','Transaction ID already exists; refresh before importing.');end if;
  r.created_at:=coalesce(r.created_at,now());r.updated_at:=coalesce(r.updated_at,now());r.source:=coalesce(r.source,'imported');
  insert into public.transactions select r.*;
  insert into public.transaction_contexts(transaction_id,user_id,type,value)
    select r.id,p_user,c->>'type',c->>'value' from jsonb_array_elements(p_contexts) c on conflict do nothing;
  tid:=r.id;reason:=case when p_separate then 'separate payment confirmed by user' else 'new financial event' end;was_created:=true;
 end if;
 insert into public.transaction_sources(user_id,source_kind,source_key,transaction_id,account_id,direction,amount,occurred_on,bank_reference,payload_hash,match_reason)
  values(p_user,p_kind,p_key,tid,p_account,p_direction,r.amount,p_date,ref,p_hash,reason) on conflict do nothing;
 if ref is not null then
  insert into public.transaction_sources(user_id,source_kind,source_key,transaction_id,account_id,direction,amount,occurred_on,bank_reference,match_reason)
   values(p_user,'reference',refkey,tid,p_account,p_direction,r.amount,p_date,ref,'strong bank reference') on conflict do nothing;
 end if;
 return jsonb_build_object('status',case when was_created then 'created' else 'matched' end,'transactionId',tid,'reason',reason);
end $$;

create function public.commit_statement_import(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();e jsonb;o jsonb;result jsonb;created jsonb:='[]';matched int:=0;removed int:=0;
begin
 if u is null then raise exception 'Not signed in';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>10000 then raise exception 'Invalid import batch';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 for e in select value from jsonb_array_elements(p_rows) loop
  o:=e->'observation';
  if o->>'kind'<>'statement' then raise exception 'Expected statement source';end if;
  result:=public.import_financial_event(u,'statement',o->>'key',o->>'accountId',o->>'direction',(o->>'date')::date,
    o->>'reference',e->'transaction',coalesce(e->'contexts','[]'),o->>'payloadHash',o->>'existingTransactionId',coalesce((o->>'allowSeparate')::boolean,false));
  if result->>'status'='review' then raise exception '%',result->>'reason';end if;
  if result->>'status'='created' then created:=created||jsonb_build_array(result->>'transactionId');
  elsif result->>'status'='matched' then matched:=matched+1;else removed:=removed+1;end if;
 end loop;
 return jsonb_build_object('createdIds',created,'matched',matched,'removed',removed);
end $$;

create or replace function public.gmail_commit(p_user uuid,p_message text,p_type text,p_account text,
 p_destination text,p_category text,p_refund boolean,p_reviewed boolean default false,p_allow_duplicate boolean default false)
returns text language plpgsql set search_path='' as $$
declare m public.gmail_messages;a jsonb;observed text;direction text;result jsonb;tx jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from public.gmail_messages where user_id=p_user and message_id=p_message for update;
 if not found then raise exception 'Message not found';end if;
 if m.status<>'review' then return m.status;end if;
 a:=m.candidate;direction:=coalesce(a->>'direction',case when p_type='INCOME' then 'credit' else 'debit' end);
 if not exists(select 1 from public.accounts where id=p_account and user_id=p_user and is_active) then raise exception 'Account not found';end if;
 if p_type='TRANSFER' and (p_destination is null or p_destination=p_account or not exists(select 1 from public.accounts where id=p_destination and user_id=p_user and is_active)) then raise exception 'Choose a different destination';end if;
 observed:=coalesce(a->>'accountId',case when direction='credit' and p_type='TRANSFER' then p_destination else p_account end);
 if p_type not in ('EXPENSE','INCOME','TRANSFER') then raise exception 'Invalid transaction';end if;
 if (p_type='EXPENSE' or p_refund) and not exists(select 1 from public.categories where id=p_category and user_id=p_user) then raise exception 'Choose a category';end if;
 if not p_reviewed and (p_type<>'EXPENSE' or p_refund or p_account is distinct from a->>'accountId' or p_category is distinct from a->>'categoryId') then raise exception 'Review required';end if;
 tx:=jsonb_build_object('id','gmail_'||replace(p_user::text,'-','')||'_'||p_message,'type',p_type,'amount',a->'amount',
  'description',a->>'merchant','date',a->>'date','merchant',a->>'merchant','account_id',p_account,
  'to_account_id',case when p_type='TRANSFER' then p_destination end,'category_id',case when p_type='EXPENSE' or p_refund then p_category end,
  'is_refund',p_refund,'source','imported','notes','Gmail bank alert; message '||p_message||case when a->>'reference' is not null then '; reference '||(a->>'reference') else '' end);
 result:=public.import_financial_event(p_user,'gmail',p_message,observed,direction,(a->>'date')::date,a->>'reference',tx,'[]',null,null,p_reviewed and p_allow_duplicate);
 if result->>'status'='review' then
  update public.gmail_messages set reason=result->>'reason' where user_id=p_user and message_id=p_message;return 'review';
 elsif result->>'status'='removed' then
  update public.gmail_messages set status='duplicate',reason=result->>'reason' where user_id=p_user and message_id=p_message;return 'duplicate';
 end if;
 update public.gmail_messages set status='logged',transaction_id=result->>'transactionId',reason=case when result->>'status'='matched' then result->>'reason' end where user_id=p_user and message_id=p_message;
 return case when result->>'status'='created' then 'logged' else 'matched' end;
end $$;

create function public.gmail_match_existing(p_user uuid,p_message text,p_account text,p_transaction text) returns text
language plpgsql set search_path='' as $$
declare m public.gmail_messages;t public.transactions;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from public.gmail_messages where user_id=p_user and message_id=p_message for update;
 if not found then raise exception 'Message not found';end if;
 if m.status<>'review' then return m.status;end if;
 select * into t from public.transactions where id=p_transaction and user_id=p_user;
 if not found then raise exception 'Existing entry not found';end if;
 result:=public.import_financial_event(p_user,'gmail',p_message,p_account,m.candidate->>'direction',(m.candidate->>'date')::date,
   m.candidate->>'reference',to_jsonb(t)||jsonb_build_object('amount',m.candidate->'amount','date',m.candidate->>'date'),
   '[]',null,p_transaction,false);
 if result->>'status'<>'matched' then
  update public.gmail_messages set reason=coalesce(result->>'reason','Check the selected entry before linking.') where user_id=p_user and message_id=p_message;return 'review';end if;
 update public.gmail_messages set status='logged',transaction_id=p_transaction,reason='Linked to existing entry by user; manual fields preserved.' where user_id=p_user and message_id=p_message;
 return 'matched';
end $$;

-- Existing logged Gmail identities are metadata only. Preserve intentional
-- dismissals and orphaned/deleted ledger identities without recreating rows.
insert into public.transaction_sources(user_id,source_kind,source_key,transaction_id,account_id,direction,amount,occurred_on,bank_reference,match_reason)
select g.user_id,'gmail',g.message_id,t.id,case
 when exists(select 1 from public.accounts a where a.id=g.candidate->>'accountId' and a.user_id=g.user_id) then g.candidate->>'accountId'
 when t.type='TRANSFER' and g.candidate->>'direction'='credit' then t.to_account_id else t.account_id end,
 coalesce(g.candidate->>'direction',case when t.type='INCOME' then 'credit' else 'debit' end),
 coalesce(t.amount,(g.candidate->>'amount')::bigint),(g.candidate->>'date')::date,
 public.normalized_bank_reference(g.candidate->>'reference'),'existing logged Gmail receipt'
from public.gmail_messages g left join public.transactions t on t.id=g.transaction_id and t.user_id=g.user_id
where g.status='logged' and g.candidate is not null and (g.candidate->>'amount')::bigint>0 and g.candidate->>'date' is not null
on conflict do nothing;

-- Seed only unambiguous strong identities. Conflicting legacy references
-- remain review cases; no ledger entries are merged, deleted or relabeled.
with candidates as (
 select user_id,transaction_id,account_id,direction,amount,occurred_on,bank_reference from public.transaction_sources where bank_reference is not null and transaction_id is not null
 union all
 select t.user_id,t.id,t.account_id,public.financial_direction(t,t.account_id),t.amount,t.date::date,public.ledger_bank_reference(t.notes,t.description)
 from public.transactions t where t.account_id is not null and t.amount>0 and public.ledger_bank_reference(t.notes,t.description) is not null
), unique_refs as (
 select user_id,account_id,direction,amount,bank_reference,min(transaction_id) tid,min(occurred_on) first_on from candidates
 where account_id is not null group by user_id,account_id,direction,amount,bank_reference having count(distinct transaction_id)=1
)
insert into public.transaction_sources(user_id,source_kind,source_key,transaction_id,account_id,direction,amount,occurred_on,bank_reference,match_reason)
select user_id,'reference',account_id||'|'||direction||'|'||amount::text||'|'||bank_reference,tid,account_id,direction,amount,first_on,bank_reference,'unique existing reference'
from unique_refs on conflict do nothing;

revoke all on function public.normalized_bank_reference(text),public.ledger_bank_reference(text,text),public.financial_direction(public.transactions,text),public.lock_financial_write(),public.lock_financial_statement() from public,anon,authenticated;
grant execute on function public.lock_financial_write() to service_role;
revoke all on function public.import_financial_event(uuid,text,text,text,text,date,text,jsonb,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.import_financial_event(uuid,text,text,text,text,date,text,jsonb,jsonb,text,text,boolean) to service_role;
revoke all on function public.commit_statement_import(jsonb) from public,anon;
grant execute on function public.commit_statement_import(jsonb) to authenticated;
revoke all on function public.gmail_match_existing(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.gmail_match_existing(uuid,text,text,text) to service_role;
-- Existing gmail_commit grants remain server-only after CREATE OR REPLACE.
commit;
