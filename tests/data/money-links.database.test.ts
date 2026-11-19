import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from 'node:fs/promises';import {PGlite}from '@electric-sql/pglite';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('money links are owner-scoped, capacity checked, atomic and version checked',async()=>{
 const db=await PGlite.create();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create table public.profiles(id uuid primary key references auth.users(id));
 create table public.transactions(id text primary key,user_id uuid not null references auth.users(id),type text,amount bigint,category_id text,is_refund boolean);
 alter table profiles enable row level security;create policy owner on profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
 alter table transactions enable row level security;create policy owner on transactions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 grant select,insert,update,delete on profiles,transactions to authenticated;`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261119114901_transaction_money_links.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[owner,other]);await db.query('insert into profiles values($1),($2)',[owner,other]);
 for(const [id,user,type,amount]of [['income',owner,'INCOME',2000],['expense',owner,'EXPENSE',10000],['foreignIncome',other,'INCOME',2000],['foreignExpense',other,'EXPENSE',10000]])await db.query('insert into transactions(id,user_id,type,amount) values($1,$2,$3,$4)',[id,user,type,amount]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 const l={id:'link1',kind:'CONTRIBUTION',income_id:'income',expense_id:'expense',amount:2000};
 await db.query('select commit_money_links($1,$2)',[JSON.stringify([]),JSON.stringify([l])]);
 assert.equal((await db.query('select * from money_links')).rows.length,1);
 await assert.rejects(db.query('select commit_money_links($1,$2)',[JSON.stringify([]),JSON.stringify([])]),/another session/);
 await assert.rejects(db.query('select commit_money_links($1,$2)',[null,JSON.stringify([])]),/Invalid/);
 await assert.rejects(db.query("insert into money_links(id,kind,income_id,expense_id,amount) values('over','CONTRIBUTION','income','expense',1)"),/allocated/);
 await assert.rejects(db.query("update transactions set amount=1999 where id='income'"),/links first/);
 await assert.rejects(db.query("insert into money_links(id,kind,income_id,expense_id,amount) values('foreign','CONTRIBUTION','foreignIncome','expense',1)"),/incoming/);
 await assert.rejects(db.query("insert into money_links(id,kind,income_id,expense_id,amount) values('foreign','CONTRIBUTION','income','foreignExpense',1)"),/allocated|expense/);
 await assert.rejects(db.query('select commit_money_links($1,$2)',[JSON.stringify([l]),JSON.stringify([{...l,amount:2001}])]),/allocated/);
 assert.equal((await db.query<{amount:number}>('select amount from money_links')).rows[0]!.amount,2000);
 await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);assert.equal((await db.query('select * from money_links')).rows.length,0);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from money_links'),/permission denied/);
 await assert.rejects(db.query("select commit_money_links('[]','[]')"),/permission denied/);
 }finally{await db.close();}
});
