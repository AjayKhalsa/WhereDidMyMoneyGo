begin;
alter table public.gmail_connections add column statement_scan jsonb not null default '{}'::jsonb
 check (jsonb_typeof(statement_scan)='object');

-- Read-only source evidence. Amounts here never become purchases or income.
-- Only the server's authenticated-bank scanner writes; the owner can read.
create table public.financial_mail_evidence (
 user_id uuid not null references auth.users(id) on delete cascade,
 message_id text not null,
 bank text not null check(bank in ('HDFC','ICICI','HSBC','Axis','CRED')),
 sender text not null,
 subject text not null check(length(subject)<=250),
 received_at timestamptz not null,
 body_text text not null check(length(body_text)<=20000),
 attachments jsonb not null default '[]'::jsonb check(jsonb_typeof(attachments)='array'),
 parsed jsonb,
 parser_version integer not null default 0,
 primary key(user_id,message_id)
);
alter table public.financial_mail_evidence enable row level security;
revoke all on public.financial_mail_evidence from anon,authenticated;
grant select on public.financial_mail_evidence to authenticated;
grant all on public.financial_mail_evidence to service_role;
create policy "owner reads financial evidence" on public.financial_mail_evidence for select
 to authenticated using(user_id=(select auth.uid()));
create index financial_evidence_received on public.financial_mail_evidence(user_id,received_at desc);
commit;
