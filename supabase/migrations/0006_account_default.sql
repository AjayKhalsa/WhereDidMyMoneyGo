-- Adds a per-account "default for new expenses" flag, pre-selecting an
-- account as "Paid with" instead of leaving new entries unset. See
-- src/lib/domain/types.ts's Account.isDefault and saveAccount() in
-- src/lib/data/actions.ts, which enforces at most one default at a time.

alter table accounts add column is_default boolean not null default false;
