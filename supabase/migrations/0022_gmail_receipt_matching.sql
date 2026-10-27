begin;
-- Add the requested Auto leaf only where the Transport group is unambiguous
-- and no equivalent user category exists. No existing IDs/labels are changed.
insert into public.categories(id,user_id,name,parent_id,"order",system)
select p.id||'.auto',p.user_id,'Auto',p.id,
 coalesce((select max(c."order")+1 from public.categories c where c.parent_id=p.id and c.user_id=p.user_id),0),true
from public.categories p where p.parent_id is null
 and (p.id='transport' or regexp_replace(lower(p.name),'[^a-z0-9]','','g')='transport')
 and (select count(*) from public.categories root where root.user_id=p.user_id and root.parent_id is null and (root.id='transport' or regexp_replace(lower(root.name),'[^a-z0-9]','','g')='transport'))=1
 and not exists(select 1 from public.categories c where c.user_id=p.user_id and c.parent_id=p.id
  and regexp_replace(lower(c.name),'[^a-z0-9]','','g') in ('auto','autorickshaw','rickshaw','autocab'))
on conflict(user_id,id) do nothing;

-- Existing reviewed/dismissed/removed financial entries are never rewritten.
alter table public.gmail_messages add column parser_version integer not null default 0;
create index gmail_messages_review_version on public.gmail_messages(user_id,parser_version,created_at) where status='review';

create or replace function public.ledger_bank_reference(notes text,description text) returns text
language sql immutable set search_path='' as $$
 select public.normalized_bank_reference(coalesce(
  substring(coalesce(notes,'')||' '||coalesce(description,'') from '(?i)\m(?:reference|rrn|utr|ref)(?:\s*[:#]\s*|\s+)([A-Z0-9]{8,64})\M'),
  substring(coalesce(description,'') from '(?i)\mUPI[-/](?:P2[MP]/)?([0-9]{10,30})[-/]')))
$$;

-- Match before categorization/purpose review, but only with a strong source or
-- bank reference. Amount/date collisions alone still require a user's choice.
create function public.gmail_match_recorded(p_user uuid,p_message text,p_authenticated boolean default false)
returns text language plpgsql set search_path='' as $$
declare m public.gmail_messages;a jsonb;ref text;ids text[];tid text;s public.transaction_sources;result text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from public.gmail_messages where user_id=p_user and message_id=p_message for update;
 if not found then raise exception 'Message not found';end if;
 if m.status<>'review' then return m.status;end if;
 if not p_authenticated then return 'review';end if;
 a:=m.candidate;
 if a is null or not exists(select 1 from public.accounts where id=a->>'accountId' and user_id=p_user and is_active) then return 'review';end if;
 select * into s from public.transaction_sources where user_id=p_user and source_kind='gmail' and source_key=p_message;
 if found then
  if s.transaction_id is null then
   update public.gmail_messages set status='duplicate',reason='Previously removed source; not restored automatically.' where user_id=p_user and message_id=p_message;
   return 'duplicate';
  end if;
  if s.account_id is distinct from a->>'accountId' or s.direction is distinct from a->>'direction' or s.amount is distinct from (a->>'amount')::bigint or abs(s.occurred_on-(a->>'date')::date)>3 then return 'review';end if;
  tid:=s.transaction_id;
 else
  if a->>'providerReference' ~ '^CRED:[A-Z0-9]{6,64}$' and a->>'creditKind'='repayment' and a->>'direction'='credit' then
   select array_agg(distinct t.id) into ids from public.gmail_messages g join public.transactions t on t.id=g.transaction_id and t.user_id=p_user
    where g.user_id=p_user and g.status='logged' and g.candidate->>'providerReference'=a->>'providerReference'
    and g.candidate->>'accountId'=a->>'accountId' and g.candidate->>'creditKind'='repayment'
    and t.amount=(a->>'amount')::bigint and t.type='TRANSFER' and t.to_account_id=a->>'accountId' and abs(t.date::date-(a->>'date')::date)<=3;
   if cardinality(ids)>1 then return 'review';end if;
   if cardinality(ids)=1 then tid:=ids[1];end if;
  end if;
  if tid is null then
  ref:=public.normalized_bank_reference(a->>'reference');
  if ref is null then return 'review';end if;
  -- A removed identity must not silently become a newly linked source.
  if exists(select 1 from public.transaction_sources where user_id=p_user and transaction_id is null and bank_reference=ref and account_id=a->>'accountId' and direction=a->>'direction' and amount=(a->>'amount')::bigint) then return 'review';end if;
  select array_agg(t.id) into ids from public.transactions t where t.user_id=p_user and t.amount=(a->>'amount')::bigint
   and public.financial_direction(t,a->>'accountId')=a->>'direction' and abs(t.date::date-(a->>'date')::date)<=3
   and (public.ledger_bank_reference(t.notes,t.description)=ref or exists(select 1 from public.transaction_sources ts where ts.user_id=p_user and ts.transaction_id=t.id and ts.bank_reference=ref and (ts.account_id=a->>'accountId' or t.type='TRANSFER')));
  if coalesce(cardinality(ids),0)<>1 then return 'review';end if;
  tid:=ids[1];
  end if;
 end if;
 result:=public.gmail_match_existing(p_user,p_message,a->>'accountId',tid);
 if result='matched' then
  update public.gmail_messages set category_review=false,category_review_snapshot=null,reason='Matched existing financial event by source/reference; manual fields preserved.' where user_id=p_user and message_id=p_message;
 end if;
 return result;
end $$;
revoke all on function public.gmail_match_recorded(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.gmail_match_recorded(uuid,text,boolean) to service_role;

-- Explicit salary and posted card refunds are financial credits. Never use
-- this path for generic incoming transfers, card repayments or initiations.
create function public.gmail_commit_identified_credit(p_user uuid,p_message text,p_authenticated boolean default false)
returns text language plpgsql set search_path='' as $$
declare m public.gmail_messages;a jsonb;account public.accounts;result text;category text;refund boolean:=false;t public.transactions;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from public.gmail_messages where user_id=p_user and message_id=p_message for update;
 if not found then raise exception 'Message not found';end if;
 if m.status<>'review' then return m.status;end if;
 if not p_authenticated then return 'review';end if;
 a:=m.candidate;
 select * into account from public.accounts where id=a->>'accountId' and user_id=p_user and is_active;
 if not found or a->>'direction' is distinct from 'credit' or (a->>'date')::date>(now() at time zone 'Asia/Kolkata')::date
   or not exists(select 1 from public.gmail_connections where user_id=p_user and start_date<=(a->>'date')::date) then return 'review';end if;
 if a->>'incomeKind'='salary' and a->>'creditKind'='income' and a->>'instrument'='bank' and account.type='BANK'
   and a->>'merchant' ~* '(^|[-/:[:space:]])SAL(ARY)?[[:space:]]+(FOR[[:space:]]+)?(JAN(UARY)?|FEB(RUARY)?|MAR(CH)?|APR(IL)?|MAY|JUN(E)?|JUL(Y)?|AUG(UST)?|SEP(TEMBER)?|OCT(OBER)?|NOV(EMBER)?|DEC(EMBER)?)[[:space:]]+(20[0-9]{2}|[0-9]{2})\M'
   and a->>'merchant' !~* '\m(refund|reversal|cashback|loan|self[ -]?transfer|own[ -]?transfer)\M' then
  result:=public.gmail_commit(p_user,p_message,'INCOME',account.id,null,null,false,true,false);
 elsif a->>'creditKind'='refund' and a->>'refundStatus'='posted' and a->>'instrument'='credit_card' and account.type='CREDIT_CARD' then
  category:=a->>'categoryId';
  if not exists(select 1 from public.categories where id=category and user_id=p_user) then return 'review';end if;
  refund:=true;
  result:=public.gmail_commit(p_user,p_message,'INCOME',account.id,null,category,true,true,false);
 else return 'review';end if;
 if result='logged' and refund and coalesce((a#>>'{classification,needsReview}')::boolean,true) then
  select * into t from public.transactions where user_id=p_user and id='gmail_'||replace(p_user::text,'-','')||'_'||p_message;
  if not found then raise exception 'Canonical refund missing';end if;
  update public.gmail_messages set category_review=true,category_review_snapshot=to_jsonb(t),reason='Refund is in your card balance; choose its original spending category.' where user_id=p_user and message_id=p_message;
 end if;
 return result;
end $$;
revoke all on function public.gmail_commit_identified_credit(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.gmail_commit_identified_credit(uuid,text,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
