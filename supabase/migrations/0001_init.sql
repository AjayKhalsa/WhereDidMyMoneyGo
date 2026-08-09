-- Where Did My Money Go — initial schema
--
-- One table per CollectionName in src/lib/data/repository.ts, plus `profiles`
-- and two join tables for the array-valued `contexts` fields (both
-- Transaction.contexts and ClassificationRule.contexts are TransactionContext[]
-- — see src/lib/domain/types.ts).
--
-- App-generated ids from createId() in src/lib/utils/index.ts are
-- `prefix_xxxxxxxx` strings, NOT real UUIDs — every app-owned id column is
-- `text`. Only user_id (references auth.users) is a real uuid.
--
-- Run this once in the Supabase SQL editor after creating the project.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  currency text not null default 'INR',
  locale text not null default 'en-IN',
  timezone text not null default 'Asia/Kolkata',
  is_demo boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table accounts (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('BANK','CASH','CREDIT_CARD','INVESTMENT')),
  opening_balance bigint not null,
  is_active boolean not null default true,
  hint text,
  created_at timestamptz not null default now()
);

create table credit_cards (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id text not null references accounts(id) on delete cascade,
  statement_day int not null,
  due_day int not null,
  credit_limit bigint not null
);

create table categories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  parent_id text references categories(id),
  "order" int not null default 0,
  system boolean not null default false
);

create table transactions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('EXPENSE','INCOME','TRANSFER','INVESTMENT')),
  amount bigint not null,
  description text not null,
  date timestamp not null,
  merchant text,
  account_id text references accounts(id) on delete set null,
  to_account_id text references accounts(id) on delete set null,
  category_id text references categories(id) on delete set null,
  investment_id text,
  notes text,
  recurring_id text,
  source text not null check (source in ('manual','parsed','recurring','seed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transaction_contexts (
  transaction_id text not null references transactions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('COMPANY','OCCASION','NATURE')),
  value text not null,
  primary key (transaction_id, type, value)
);

create table recurring (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  amount bigint not null,
  frequency text not null check (frequency in ('MONTHLY','WEEKLY','YEARLY')),
  day_of_period int not null,
  category_id text references categories(id) on delete set null,
  account_id text references accounts(id) on delete set null,
  type text not null check (type in ('EXPENSE','INVESTMENT')),
  merchant text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table goals (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_amount bigint not null,
  current_amount bigint not null default 0,
  target_date date,
  monthly_contribution bigint not null default 0,
  created_at timestamptz not null default now()
);

create table investments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('PPF','MUTUAL_FUND','FD','STOCKS','NPS','GOLD','OTHER')),
  monthly_contribution bigint not null default 0,
  is_active boolean not null default true,
  current_value bigint,
  created_at timestamptz not null default now()
);

alter table transactions add constraint transactions_investment_id_fkey
  foreign key (investment_id) references investments(id) on delete set null;
alter table transactions add constraint transactions_recurring_id_fkey
  foreign key (recurring_id) references recurring(id) on delete set null;

create table income_sources (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  amount bigint not null,
  recurring boolean not null default true,
  day_of_month int not null,
  deductions bigint not null default 0,
  account_id text references accounts(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table rules (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern text not null,
  category_id text not null references categories(id) on delete cascade,
  account_id text references accounts(id) on delete set null,
  merchant text,
  confidence real not null default 0.5,
  times_applied int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rule_contexts (
  rule_id text not null references rules(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('COMPANY','OCCASION','NATURE')),
  value text not null,
  primary key (rule_id, type, value)
);

create table people (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table splits (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  transaction_id text not null references transactions(id) on delete cascade,
  person_id text not null references people(id) on delete cascade,
  direction text not null check (direction in ('OWED_TO_ME','I_OWE')),
  amount bigint not null,
  status text not null check (status in ('OUTSTANDING','SETTLED')) default 'OUTSTANDING',
  settled_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security: every table scoped to the owning user.
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table credit_cards enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table transaction_contexts enable row level security;
alter table recurring enable row level security;
alter table goals enable row level security;
alter table investments enable row level security;
alter table income_sources enable row level security;
alter table rules enable row level security;
alter table rule_contexts enable row level security;
alter table people enable row level security;
alter table splits enable row level security;

create policy "own row only" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own rows only" on accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on credit_cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on transaction_contexts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on recurring for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on investments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on income_sources for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on rule_contexts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on people for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on splits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index on transactions (user_id, date desc);
create index on transaction_contexts (transaction_id);
create index on splits (person_id);
