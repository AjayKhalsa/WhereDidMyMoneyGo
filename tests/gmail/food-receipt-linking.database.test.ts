import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db:PGlite;const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const receipt={provider:'Zomato',orderId:'1234567890',paidAmount:50000,restaurant:'Example Cafe',outletAddress:'Shop 1, Example Road, Mumbai'};
async function snapshot(id:string){return (await db.query<{v:object}>('select to_jsonb(t) v from transactions t where id=$1',[id])).rows[0]!.v;}
async function link(message:string,id='payment',r:object=receipt,expected?:object,who=user,confirmed=true){return (await db.query<{v:string}>('select link_food_receipt($1,$2,$3,$4,$5,$6,$7) v',[who,message,id,JSON.stringify(r),'2026-10-29',JSON.stringify(expected??await snapshot(id)),confirmed])).rows[0]!.v;}
before(async()=>{
 db=await PGlite.create();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[user,other]);await db.query("insert into accounts(id,user_id,name,type,opening_balance) values('bank',$1,'Bank','BANK',100000)",[user]);
 await db.query("insert into categories(id,user_id,name) values('dining',$1,'Dining')",[user]);
 for(const id of ['payment','repeat','deleted','changed','dismissed','conflict','foreign'])await db.query("insert into transactions(id,user_id,type,amount,description,date,account_id,category_id,notes,source) values($1,$2,'EXPENSE',50000,'Zomato corrected name','2026-10-29','bank','dining','My private manual note','manual')",[id,user]);
 await db.query("insert into transaction_contexts values('payment',$1,'PEOPLE','friends')",[user]);await db.exec('grant all on all tables in schema public to service_role;');
});
after(async()=>{await db?.close();});
test('receipt link and replay preserve the entire manually corrected financial event',async()=>{
 const before=await snapshot('payment');assert.equal(await link('aa00000001'),'linked');assert.equal(await link('aa00000001'),'already_linked');assert.deepEqual(await snapshot('payment'),before);
 assert.equal((await db.query<{n:number}>("select count(*) n from transactions where id='payment'")).rows[0]!.n,1);
 assert.equal((await db.query<{n:number}>("select count(*) n from transaction_contexts where transaction_id='payment'")).rows[0]!.n,1);
 assert.equal((await db.query<{n:number}>("select count(*) n from transaction_sources where source_key='aa00000001'")).rows[0]!.n,1);
});
test('two receipt emails can corroborate one order but cannot claim another event',async()=>{
 assert.equal(await link('aa00000002'),'linked');assert.equal(await link('aa00000003','repeat'),'conflict');
 assert.equal(await link('aa00000004','payment',{...receipt,orderId:'9999999999'}),'conflict');
 assert.equal(await link('aa00000005','payment',{...receipt,provider:'Swiggy',orderId:'8888888888'}),'conflict');
 assert.equal(await link('aa00000006','repeat',{...receipt,orderId:'3333333333'}),'linked');
});
test('deleted identities, explicit dismissals and source tombstones are preserved',async()=>{
 assert.equal(await link('aa00000007','deleted',{...receipt,orderId:'4444444444'}),'linked');await db.query("delete from transactions where id='deleted'");
 assert.equal(await link('aa00000008','repeat',{...receipt,orderId:'4444444444'}),'removed');
 await db.query("insert into gmail_messages(user_id,message_id,status) values($1,'aa00000009','ignored')",[user]);assert.equal(await link('aa00000009','dismissed',{...receipt,orderId:'5555555555'}),'dismissed');
 await db.query("insert into transaction_sources(user_id,source_kind,source_key,transaction_id,account_id,direction,amount,occurred_on,match_reason) values($1,'gmail','aa00000010',null,'bank','debit',50000,'2026-10-29','Removed source')",[user]);
 assert.equal(await link('aa00000010','conflict',{...receipt,orderId:'6666666666'}),'removed');
});
test('stale snapshots, different amounts, unconfirmed and private-address payloads cannot attach',async()=>{
 const old=await snapshot('changed');await db.query("update transactions set notes='New manual correction' where id='changed'");
 assert.equal(await link('aa00000011','changed',{...receipt,orderId:'7777777777'},old),'changed');
 assert.equal(await link('aa00000012','changed',{...receipt,orderId:'7777777777',paidAmount:123}),'conflict');
 assert.equal(await link('aa00000013','changed',{...receipt,orderId:'7777777777'},undefined,user,false),'confirmation_required');
 await assert.rejects(link('aa00000014','changed',{...receipt,orderId:'7777777777',deliveryAddress:'PRIVATE HOME'}),/Unsupported receipt fields/);
 await assert.rejects(link('aa00000015','changed',{...receipt,orderId:'7777777777',outletAddress:'Delivery address: PRIVATE HOME'}));
 assert.equal((await db.query<{n:number}>("select count(*) n from food_receipt_details where order_id='7777777777'")).rows[0]!.n,0);
});
test('server role can link, while browser roles cannot write or call the RPC and see only their own evidence',async()=>{
 assert.equal(await link('aa00000016','foreign',{...receipt,orderId:'1010101010'},undefined,other),'removed');
 await db.exec('set role service_role');try{assert.equal(await link('aa00000017','changed',{...receipt,orderId:'1212121212'}),'linked');}finally{await db.exec('reset role');}
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
 try{
  assert.equal((await db.query<{n:number}>('select count(*) n from food_receipt_details')).rows[0]!.n,0);
  await assert.rejects(db.query("select link_food_receipt($1,'aa00000018','payment',$2,'2026-10-29','{}',true)",[user,JSON.stringify(receipt)]),/permission denied/);
  await assert.rejects(db.query("delete from food_receipt_details"),/permission denied/);
 }finally{await db.exec('reset role');}
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');try{assert.ok((await db.query<{n:number}>('select count(*) n from food_receipt_details')).rows[0]!.n>0);}finally{await db.exec('reset role');}
});

test('legacy logged mail cannot be reassigned to another payment or revive a deleted identity',async()=>{
 await db.query("insert into gmail_messages(user_id,message_id,status,transaction_id) values($1,'aa00000020','logged','repeat'),($1,'aa00000021','logged','missing-old-event')",[user]);
 assert.equal(await link('aa00000020','conflict',{...receipt,orderId:'2020202020'}),'conflict');
 assert.equal(await link('aa00000021','conflict',{...receipt,orderId:'2121212121'}),'removed');
});

test('only a unique explicit provider/order reference may link automatically',async()=>{
 await db.query("insert into transactions(id,user_id,type,amount,description,date,account_id,notes,source) values('strong',$1,'EXPENSE',50000,'Zomato','2026-10-29','bank','Order ID: 9898989898','manual')",[user]);
 assert.equal(await link('aa00000022','strong',{...receipt,orderId:'9898989898'},undefined,user,false),'linked');
 assert.equal((await db.query<{basis:string}>("select link_basis basis from food_receipt_details where order_id='9898989898'")).rows[0]!.basis,'order_reference');
 await db.query("insert into transactions(id,user_id,type,amount,description,date,account_id,notes,source) values('amb-one',$1,'EXPENSE',50000,'Zomato','2026-10-29','bank','Order ID: 9797979797','manual'),('amb-two',$1,'EXPENSE',50000,'Zomato','2026-10-29','bank','Order ID: 9797979797','manual')",[user]);
 assert.equal(await link('aa00000023','amb-one',{...receipt,orderId:'9797979797'},undefined,user,false),'confirmation_required');
});
