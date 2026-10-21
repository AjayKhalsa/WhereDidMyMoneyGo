import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('push subscriptions are server-only, owner-scoped, limited and daily claims are idempotent',async()=>{
 const db=await PGlite.create();const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);');
  await db.exec(await readFile(new URL('../../supabase/migrations/0021_push_notifications.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1),($2)',[user,other]);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from push_subscriptions'),/permission denied/);
  await assert.rejects(db.query('select register_push_subscription($1,$2,$3)',[user,'hash','encrypted']),/permission denied/);
  await db.exec('reset role;set role service_role');
  for(let i=0;i<8;i++)await db.query('select register_push_subscription($1,$2,$3)',[user,String(i),'encrypted']);
  await db.query('select register_push_subscription($1,$2,$3)',[user,'0','updated']);
  await assert.rejects(db.query('select register_push_subscription($1,$2,$3)',[user,'9','encrypted']),/Device limit/);
  await db.query('select register_push_subscription($1,$2,$3)',[other,'0','other-encrypted']);
  const claim=()=>db.query("update push_subscriptions set last_notice='2026-10-21' where user_id=$1 and endpoint_hash='0' and (last_notice is null or last_notice<>'2026-10-21') returning endpoint_hash",[user]);
  assert.equal((await claim()).rows.length,1);assert.equal((await claim()).rows.length,0);
  const r=await db.query<{last_notice:string|null}>('select last_notice from push_subscriptions where user_id=$1',[other]);assert.equal(r.rows[0]!.last_notice,null);
 }finally{await db.close();}
});
