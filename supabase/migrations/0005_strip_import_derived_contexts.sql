-- Bank statements only give a date, never a real time, so every imported
-- transaction's stored timestamp defaulted to local midnight — which
-- spuriously derived "late night" (hour < 4) on every single import, and
-- "weekend" whenever the real date happened to land on a Saturday/Sunday.
-- materialise() in src/lib/data/actions.ts now skips deriving these for
-- source='imported' rows going forward; this cleans up rows imported
-- before that fix. Non-urgent (no constraint depends on this, unlike
-- 0004) but worth running whenever convenient.

delete from transaction_contexts tc
using transactions t
where tc.transaction_id = t.id
  and t.source = 'imported'
  and tc.type = 'OCCASION'
  and tc.value in ('weekend', 'late-night');
