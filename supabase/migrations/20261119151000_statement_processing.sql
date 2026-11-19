begin;
alter table public.financial_mail_evidence
 add column account_id text references public.accounts(id) on delete set null,
 add column pdf_text text check(length(pdf_text)<=150000),
 add column pdf_status text not null default 'pending' check(pdf_status in ('pending','read','locked','unsupported','none')),
 add column processed_at timestamptz,
 add column processing_note text;
create table public.statement_credentials (
 user_id uuid not null references auth.users(id) on delete cascade,
 account_id text not null references public.accounts(id) on delete cascade,
 sealed_password text not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,account_id)
);
alter table public.statement_credentials enable row level security;
revoke all on public.statement_credentials from public,anon,authenticated;
grant all on public.statement_credentials to service_role;

-- Only server-parsed, authenticated source evidence may update bill metadata.
-- This never inserts an accounting transaction or overwrites a conflicting bill.
create function public.apply_issuer_statement(p_user uuid,p_message text,p_account text,p_statement jsonb,p_statement_day integer default null)
returns text language plpgsql set search_path='' as $$
declare c public.credit_cards;e public.financial_mail_evidence;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into e from public.financial_mail_evidence where user_id=p_user and message_id=p_message;
 if not found or not exists(select 1 from public.accounts where user_id=p_user and id=p_account and type='CREDIT_CARD' and is_active) then raise exception 'Statement account is unavailable';end if;
 if not public.valid_card_statement(p_statement) or
   (p_statement->>'issuedOn')::date>(e.received_at at time zone 'Asia/Kolkata')::date+2 or
   (p_statement->>'dueOn')::date>(p_statement->>'issuedOn')::date+60 or
   (p_statement_day is not null and p_statement_day not between 1 and 31) then raise exception 'Invalid statement evidence';end if;
 select * into c from public.credit_cards where user_id=p_user and account_id=p_account for update;
 if not found then return 'needs_card_details';end if;
 if c.reported_statement is not null then
  if c.reported_statement->>'issuedOn'>p_statement->>'issuedOn' then return 'older';end if;
  if c.reported_statement->>'issuedOn'=p_statement->>'issuedOn' and
    (c.reported_statement->>'amount')::bigint<>(p_statement->>'amount')::bigint then return 'conflict';end if;
 end if;
 update public.credit_cards set reported_statement=p_statement,
  statement_day=coalesce(p_statement_day,statement_day),due_day=extract(day from (p_statement->>'dueOn')::date)::int
  where user_id=p_user and id=c.id;
 return 'applied';
end $$;
revoke all on function public.apply_issuer_statement(uuid,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.apply_issuer_statement(uuid,text,text,jsonb,integer) to service_role;
commit;
