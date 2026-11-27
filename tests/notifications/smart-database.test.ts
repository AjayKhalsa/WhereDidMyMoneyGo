import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';

test('notification storage isolates owners and confines all mutations and dispatch claims to the server',async()=>{
 const db=await PGlite.create();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table public.gmail_connections(user_id uuid,last_error text,page_token text,receipt_scan jsonb,last_synced_at timestamptz);
   create table public.gmail_messages(user_id uuid,status text);
   grant all on public.gmail_connections,public.gmail_messages to service_role;
   create table transactions(id text,amount bigint);insert into transactions values('immutable',291800);`);
  await db.exec(await readFile(new URL('../../supabase/migrations/0021_push_notifications.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261127064307_smart_notifications.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1),($2)',[user,other]);
  await db.exec('set role service_role');
  await db.query('insert into notification_preferences(user_id) values($1),($2)',[user,other]);
  const states=await db.query<{read_at:string|null;dismissed_at:string|null}>("select * from mark_notification_state($1,array['budget:cycle:food:100'],'dismiss')",[user]);assert.ok(states.rows[0]!.read_at);assert.ok(states.rows[0]!.dismissed_at);
  await db.query("select * from mark_notification_state($1,array['budget:other'],'read')",[other]);
  await db.exec('reset role;set role authenticated');await db.query("select set_config('test.user',$1,false)",[user]);
  assert.equal((await db.query('select * from notification_preferences')).rows.length,1);assert.equal((await db.query('select * from notification_state')).rows.length,1);
  await assert.rejects(db.query('update notification_preferences set updated_at=now()'),/permission denied/);
  await assert.rejects(db.query('select * from notification_dispatches'),/permission denied/);
  for(const sql of ["select * from mark_notification_state($1,array['bill:a'],'read')","select notification_sync_status($1)","select claim_notification_dispatch($1,current_date,'money',array['bill:a'])"]){await assert.rejects(db.query(sql,[other]),/permission denied/);}
  await db.exec('reset role;set role service_role');
  const restored=await db.query<{read_at:null;dismissed_at:null}>("select * from mark_notification_state($1,array['budget:cycle:food:100'],'restore')",[user]);assert.equal(restored.rows[0]!.read_at,null);assert.equal(restored.rows[0]!.dismissed_at,null);
  await assert.rejects(db.query("select * from mark_notification_state($1,array['bad-key'],'read')",[user]),/Invalid notification key/);
  await assert.rejects(db.query("select * from mark_notification_state($1,array['bill:a'],null)",[user]),/Invalid notification action/);
  await assert.rejects(db.query("update notification_preferences set settings='{}' where user_id=$1",[user]),/check constraint/);
  await assert.rejects(db.query("update notification_preferences set settings=jsonb_set(settings,'{quietEnd}','21') where user_id=$1",[user]),/check constraint/);
  const day=(await db.query<{day:string}>("select to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD') as day")).rows[0]!.day;
  const claim=async(channel='money')=>(await db.query<{ticket:string|null}>("select claim_notification_dispatch($1,$2::date,$3,array['bill:a:today']) as ticket",[user,day,channel])).rows[0]!.ticket;
  const ticket=await claim();assert.ok(ticket);assert.equal(await claim(),null);
  assert.equal((await db.query<{done:boolean}>("select finish_notification_dispatch($1,$2::date,'money',$3,false) as done",[user,day,ticket])).rows[0]!.done,true);
  assert.equal(await claim(),null,'retry delay enforced');
  await db.query("update notification_dispatches set retry_after=now()-interval '1 hour' where user_id=$1",[user]);
  const second=await claim();assert.ok(second);assert.notEqual(second,ticket);
  assert.equal((await db.query<{done:boolean}>("select finish_notification_dispatch($1,$2::date,'money',$3,true) as done",[user,day,ticket])).rows[0]!.done,false,'old lease cannot finish retry');
  await db.query("select finish_notification_dispatch($1,$2::date,'money',$3,true)",[user,day,second]);assert.equal(await claim(),null,'sent channel cannot send again today');
  const pushed=await db.query<{pushed_at:unknown;read_at:null}>("select pushed_at,read_at from notification_state where user_id=$1 and event_key='bill:a:today'",[user]);assert.ok(pushed.rows[0]!.pushed_at);assert.equal(pushed.rows[0]!.read_at,null,'push acceptance is not a read receipt');
  const sync=await claim('sync');assert.ok(sync,'sync has its own daily limit');await db.query("select finish_notification_dispatch($1,$2::date,'sync',$3,false)",[user,day,sync]);
  await db.query("update notification_dispatches set retry_after=now()-interval '1 hour' where user_id=$1 and channel='sync'",[user]);const retry=await claim('sync');assert.ok(retry);await db.query("select finish_notification_dispatch($1,$2::date,'sync',$3,false)",[user,day,retry]);await db.query("update notification_dispatches set retry_after=now()-interval '1 hour' where user_id=$1 and channel='sync'",[user]);assert.equal(await claim('sync'),null,'two attempts maximum');
  const disconnected=await db.query<{s:{state:string}}>('select notification_sync_status($1) as s',[user]);assert.equal(disconnected.rows[0]!.s.state,'disconnected');
  await db.query("insert into gmail_connections values($1,'private provider error',null,null,now())",[user]);
  const failed=await db.query<{s:unknown}>('select notification_sync_status($1) as s',[user]);assert.deepEqual(Object.keys(failed.rows[0]!.s as object).sort(),['lastCheckedAt','state']);assert.doesNotMatch(JSON.stringify(failed.rows),/private provider/);
  await db.query('select register_push_subscription($1,$2,$3)',[user,'device','encrypted']);
  assert.deepEqual((await db.query('select notification_recipients() as user_id')).rows,[{user_id:user}]);
  await db.exec('reset role');assert.deepEqual((await db.query('select * from transactions')).rows,[{id:'immutable',amount:291800}]);
 }finally{await db.close();}
});
