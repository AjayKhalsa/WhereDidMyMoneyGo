import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('receipt migration adds Auto once and preserves equivalent user categories and existing labels',async()=>{
 const db=await PGlite.create();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as 'select null::uuid';");
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333';
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){
   if(file==='0022_gmail_receipt_matching.sql'){
    await db.query('insert into auth.users values($1),($2),($3)',[first,second,third]);
    await db.query("insert into categories(id,user_id,name,parent_id,\"order\",system) values('transport',$1,'Transport',null,2,true),('transport.cab',$1,'Cab','transport',0,true),('other-transport',$2,'Transport',null,7,false),('custom-auto',$2,'Auto / Cab','other-transport',3,false)",[first,second]);
    await db.query("insert into categories(id,user_id,name,parent_id) values('transport',$1,'Transport',null)",[third]);
   }
   await db.exec(await readFile(new URL(file,dir),'utf8'));
  }
  const auto=(await db.query<{id:string;name:string;parent_id:string}>("select id,name,parent_id from categories where id='transport.auto' and user_id=$1",[first])).rows[0]!;
  assert.deepEqual(auto,{id:'transport.auto',name:'Auto',parent_id:'transport'});
  assert.equal((await db.query<{n:number}>("select count(*)::int n from categories where id='transport.auto'")).rows[0]!.n,2,'Default category IDs are scoped per user');
  assert.equal((await db.query<{name:string}>("select name from categories where id='transport.cab'")).rows[0]!.name,'Cab');
  const custom=(await db.query<{id:string;name:string;order:number;system:boolean}>('select id,name,"order",system from categories where user_id=$1 and parent_id is not null',[second])).rows;
  assert.deepEqual(custom,[{id:'custom-auto',name:'Auto / Cab',order:3,system:false}]);
  assert.equal((await db.query<{n:number}>('select count(*)::int n from transactions')).rows[0]!.n,0);
 }finally{await db.close();}
});
