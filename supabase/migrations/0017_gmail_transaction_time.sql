-- Preserve time only for newly created events. Matching never rewrites a
-- manually corrected ledger date, category, merchant, notes or contexts.
begin;
create or replace function public.gmail_commit(p_user uuid,p_message text,p_type text,p_account text,
 p_destination text,p_category text,p_refund boolean,p_reviewed boolean default false,p_allow_duplicate boolean default false)
returns text language plpgsql set search_path='' as $$
declare m public.gmail_messages;a jsonb;observed text;direction text;result jsonb;tx jsonb;eventdate text;timememo text;
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
 eventdate:=a->>'date';
 timememo:='; transaction time unknown';
 if a->>'timeSource' in ('bank','payment') and a->>'timeConfidence'='exact' and a->>'occurredAt' is not null then
  if (a->>'occurredAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' or (a->>'occurredAt')::timestamp::date<>(a->>'date')::date then raise exception 'Transaction timestamp and bank date disagree';end if;
  eventdate:=a->>'occurredAt';timememo:='; transaction time '||eventdate||' Asia/Kolkata; source '||(a->>'timeSource');
 elsif a->>'timeSource'='gmail' and a->>'occurredAt' is not null then
  timememo:=timememo||'; email received '||(a->>'occurredAt')||' Asia/Kolkata (fallback only; bank date retained)';
 end if;
 tx:=jsonb_build_object('id','gmail_'||replace(p_user::text,'-','')||'_'||p_message,'type',p_type,'amount',a->'amount',
  'description',a->>'merchant','date',eventdate,'merchant',a->>'merchant','account_id',p_account,
  'to_account_id',case when p_type='TRANSFER' then p_destination end,'category_id',case when p_type='EXPENSE' or p_refund then p_category end,
  'is_refund',p_refund,'source','imported','notes','Gmail bank alert; message '||p_message||case when a->>'reference' is not null then '; reference '||(a->>'reference') else '' end||timememo);
 result:=public.import_financial_event(p_user,'gmail',p_message,observed,direction,(a->>'date')::date,a->>'reference',tx,'[]',null,null,p_reviewed and p_allow_duplicate);
 if result->>'status'='review' then
  update public.gmail_messages set reason=result->>'reason' where user_id=p_user and message_id=p_message;return 'review';
 elsif result->>'status'='removed' then
  update public.gmail_messages set status='duplicate',reason=result->>'reason' where user_id=p_user and message_id=p_message;return 'duplicate';
 end if;
 update public.gmail_messages set status='logged',transaction_id=result->>'transactionId',reason=case when result->>'status'='matched' then result->>'reason' end where user_id=p_user and message_id=p_message;
 return case when result->>'status'='created' then 'logged' else 'matched' end;
end $$;
-- CREATE OR REPLACE retains the existing service-role-only grants.
commit;
