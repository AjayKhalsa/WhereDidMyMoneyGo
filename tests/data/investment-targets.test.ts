import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("cycle targets validate money and dates while inheriting investment ownership", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
      create table public.investments(id text primary key,user_id uuid not null,monthly_contribution bigint not null);
      alter table public.investments enable row level security;
      create policy own on public.investments for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      grant select,insert,update on public.investments to authenticated;
      insert into public.investments values ('mine','11111111-1111-4111-8111-111111111111',3000000),('other','22222222-2222-4222-8222-222222222222',3000000);`);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261126183108_investment_cycle_targets.sql", import.meta.url), "utf8"));
    await db.exec("set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set role authenticated");
    assert.deepEqual((await db.query("select cycle_targets from public.investments")).rows, [{cycle_targets:{}}]);
    await db.query("update public.investments set cycle_targets=$1 where id='mine'", [{"2026-11-24":1000000,"2028-02-29":0}]);
    assert.deepEqual((await db.query("select monthly_contribution,cycle_targets from public.investments where id='mine'")).rows, [{monthly_contribution:3000000,cycle_targets:{"2026-11-24":1000000,"2028-02-29":0}}]);
    for (const targets of [[], {"2026-11-24":-1}, {"2026-11-24":1.5}, {"2026-11-24":"100"}, {"2026-11-24":9007199254740992}, {"2026-02-30":100}, {"not-a-date":100}]) {
      await assert.rejects(db.query("update public.investments set cycle_targets=$1 where id='mine'", [targets]), /investments_valid_cycle_targets/);
    }
    assert.equal((await db.query("update public.investments set cycle_targets='{}' where id='other' returning id")).rows.length,0);
    await db.query("update public.investments set cycle_targets=cycle_targets-'2026-11-24' where id='mine'");
    assert.deepEqual((await db.query("select cycle_targets from public.investments")).rows,[{cycle_targets:{"2028-02-29":0}}]);
  } finally { await db.close(); }
});
