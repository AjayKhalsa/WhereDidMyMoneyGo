-- Server-only resumable receipt discovery. No financial rows are changed.
alter table public.gmail_connections add column receipt_scan jsonb not null default '{}'::jsonb
  check (jsonb_typeof(receipt_scan) = 'object');
notify pgrst, 'reload schema';
