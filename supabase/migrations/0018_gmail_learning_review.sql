begin;
alter table public.rules add column learning_evidence jsonb;
alter table public.gmail_messages add column category_review boolean not null default false,
 add column category_review_snapshot jsonb;
create unique index learned_payee_identity on public.rules(user_id,pattern,(learning_evidence->>'merchantKey')) where learning_evidence is not null;
create trigger serialize_rule_statement before insert or update or delete on public.rules for each statement execute function public.lock_financial_statement();
create trigger serialize_rule_context_statement before insert or update or delete on public.rule_contexts for each statement execute function public.lock_financial_statement();

-- Server-only; bootstrap inserts scoped rules and never overwrites saved rules.
create function public.gmail_seed_rules(p_user uuid,p_rules jsonb) returns integer
language plpgsql set search_path='' as $$
declare j jsonb;r public.rules;n integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if jsonb_typeof(p_rules)<>'array' or jsonb_array_length(p_rules)>1000 then raise exception 'Invalid rule batch';end if;
 for j in select value from jsonb_array_elements(p_rules) loop
  select * into r from jsonb_populate_record(null::public.rules,j||jsonb_build_object('user_id',p_user));
  if r.learning_evidence->>'source'<>'history' or nullif(r.learning_evidence->>'merchantKey','') is null or not exists(select 1 from public.categories where id=r.category_id and user_id=p_user) then raise exception 'Invalid rule evidence';end if;
  if jsonb_array_length(r.learning_evidence->'exampleIds')<3 or (select count(distinct t.id) from public.transactions t join jsonb_array_elements_text(r.learning_evidence->'exampleIds') e on t.id=e.value where t.user_id=p_user and t.type='EXPENSE' and t.category_id=r.category_id)<>jsonb_array_length(r.learning_evidence->'exampleIds') then raise exception 'Insufficient consistent examples';end if;
  if exists(select 1 from public.rules where user_id=p_user and pattern=r.pattern) then continue;end if;
  insert into public.rules select r.*;n:=n+1;
 end loop;
 return n;
end $$;

create function public.gmail_commit_classified(p_user uuid,p_message text) returns text
language plpgsql set search_path='' as $$
declare a jsonb;result text;m public.gmail_messages;t public.transactions;c jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from public.gmail_messages where user_id=p_user and message_id=p_message for update;
 if not found then raise exception 'Message not found';end if;
 if m.status<>'review' then return m.status;end if;
 a:=m.candidate;
 if a->>'direction'<>'debit' or coalesce((a->>'special')::boolean,false) then raise exception 'Financial purpose requires review';end if;
 result:=public.gmail_commit(p_user,p_message,'EXPENSE',a->>'accountId',null,a->>'categoryId',false);
 if result<>'logged' then return result;end if;
 select * into t from public.transactions where id='gmail_'||replace(p_user::text,'-','')||'_'||p_message and user_id=p_user;
 if not found then raise exception 'Canonical event missing';end if;
 for c in select value from jsonb_array_elements(coalesce(a#>'{classification,contexts}','[]'::jsonb)) loop
  if c->>'type' not in ('PEOPLE','PURPOSE','OCCASION','ATTRIBUTE') or nullif(c->>'value','') is null then raise exception 'Invalid context';end if;
  insert into public.transaction_contexts values(t.id,p_user,c->>'type',c->>'value') on conflict do nothing;
 end loop;
 if coalesce((a#>>'{classification,needsReview}')::boolean,false) then
  update public.gmail_messages set category_review=true,category_review_snapshot=to_jsonb(t),reason=a#>>'{classification,reason}' where user_id=p_user and message_id=p_message;
 end if;
 return result;
end $$;

-- Category-only review never creates another event or rewrites financial fields.
-- Normal type review still uses the established shared-source Gmail commit.
create function public.gmail_review_save(p_user uuid,p_message text,p_type text,p_account text,
 p_destination text,p_category text,p_refund boolean,p_allow_duplicate boolean default false,p_rule jsonb default null)
returns text language plpgsql set search_path='' as $$
declare m public.gmail_messages;t public.transactions;result text;before_rule jsonb;after_rule jsonb;current_rule jsonb;r public.rules;c jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from public.gmail_messages where user_id=p_user and message_id=p_message for update;
 if not found then raise exception 'Message not found';end if;
 if m.category_review and m.status='logged' then
  select * into t from public.transactions where id=m.transaction_id and user_id=p_user for update;
  if not found or to_jsonb(t) is distinct from m.category_review_snapshot then raise exception 'The saved entry changed; keep the current entry or review it in the ledger';end if;
  if not exists(select 1 from public.categories where id=p_category and user_id=p_user) then raise exception 'Choose a category';end if;
  update public.transactions set category_id=p_category,updated_at=now() where id=t.id and user_id=p_user;
  update public.gmail_messages set category_review=false,category_review_snapshot=null,reason=null where user_id=p_user and message_id=p_message;
  result:='categorized';
 elsif m.status='review' then
  result:=public.gmail_commit(p_user,p_message,p_type,p_account,p_destination,p_category,p_refund,true,p_allow_duplicate);
 else return m.status;end if;
 if result not in ('logged','categorized') or p_type<>'EXPENSE' or p_refund or p_rule is null then return result;end if;
 after_rule:=(p_rule->'after')||jsonb_build_object('user_id',p_user);
 select * into r from jsonb_populate_record(null::public.rules,after_rule);
 if r.category_id<>p_category or r.learning_evidence->>'source'<>'gmail-correction' or nullif(r.learning_evidence->>'merchantKey','') is null then raise exception 'Invalid learned correction';end if;
 select to_jsonb(x) into current_rule from public.rules x where id=r.id for update;
 if current_rule is not null and current_rule->>'user_id'<>p_user::text then raise exception 'Rule is not owned';end if;
 if p_rule->'before'<>'null'::jsonb then select to_jsonb(jsonb_populate_record(null::public.rules,(p_rule->'before')||jsonb_build_object('user_id',p_user))) into before_rule;end if;
 if public.finance_row_image(current_rule) is distinct from public.finance_row_image(before_rule) then raise exception 'Saved rule changed; reload before learning this correction';end if;
 insert into public.rules select r.* on conflict(id) do update set category_id=excluded.category_id,confidence=excluded.confidence,times_applied=excluded.times_applied,updated_at=excluded.updated_at,learning_evidence=excluded.learning_evidence;
 -- Preserve contexts on existing rules; new correction rules start without inferred personal tags.
 return result;
end $$;
revoke all on function public.gmail_seed_rules(uuid,jsonb),public.gmail_commit_classified(uuid,text),public.gmail_review_save(uuid,text,text,text,text,text,boolean,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.gmail_seed_rules(uuid,jsonb),public.gmail_commit_classified(uuid,text),public.gmail_review_save(uuid,text,text,text,text,text,boolean,boolean,jsonb) to service_role;
commit;
