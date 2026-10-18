import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseAlert } from "@/lib/gmail/alerts";
import {correctedRule} from "@/lib/gmail/classification";
import {ruleRow} from "@/lib/gmail/learning-data";

let db: PGlite;
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
before(async () => {
  db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';`);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  await db.query("insert into auth.users values ($1),($2)", [user, other]);
  await db.query("insert into accounts(id,user_id,name,type,opening_balance) values ('bank',$1,'Bank','BANK',0),('card',$1,'Card','CREDIT_CARD',0),('foreign',$2,'Other','BANK',0)", [user, other]);
  await db.query("insert into categories(id,user_id,name) values ('dining',$1,'Dining')", [user]);
  await db.query("insert into gmail_connections(user_id,email,refresh_token,start_date) values ($1,'person@example.com','encrypted','2026-10-01')", [user]);
});
after(async () => { await db?.close(); });

test('historical preview queue is isolated, replay-safe and owner-readable only',async()=>{
 const run='33333333-3333-4333-8333-333333333333';
 const before=(await db.query('select count(*) n from transactions')).rows[0];
 await db.query("insert into gmail_backfill_runs(id,user_id,start_date,end_date,query) values($1,$2,'2026-07-18','2026-10-18','fixed query')",[run,user]);
 await db.query("insert into gmail_backfill_items(run_id,user_id,message_id) values($1,$2,'history1') on conflict do nothing",[run,user]);
 await db.query("insert into gmail_backfill_items(run_id,user_id,message_id) values($1,$2,'history1') on conflict do nothing",[run,user]);
 assert.equal((await db.query('select * from gmail_backfill_items')).rows.length,1);
 assert.deepEqual((await db.query('select count(*) n from transactions')).rows[0],before);
 assert.equal((await db.query("select * from gmail_messages where message_id='history1'")).rows.length,0);
 await assert.rejects(db.query("insert into gmail_backfill_items(run_id,user_id,message_id) values($1,$2,'foreign')",[run,other]),/foreign key/);
 await db.exec("create or replace function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from gmail_backfill_runs')).rows.length,1);
  await assert.rejects(db.query("update gmail_backfill_items set status='proposed'"),/permission denied/);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from gmail_backfill_items')).rows.length,0);
 }finally{await db.exec("reset role;create or replace function auth.uid() returns uuid language sql as 'select null::uuid';");}
});

test("dated evidence survives labels/future activity and becomes stale on historical accounting changes", async () => {
  const evidence = { balance: 0, asOf: "2026-10-18", source: "Test statement",
    recordedAt: "2026-10-18T00:00:00Z", fingerprint: "test", status: "verified" };
  const stamp = () => db.query("update accounts set reconciliation=$1 where id='bank'", [evidence]);
  const status = async () => (await db.query<{ status: string }>("select reconciliation->>'status' status from accounts where id='bank'")).rows[0]!.status;
  await stamp();
  await db.query("insert into transactions(id,user_id,type,amount,description,date,account_id,source) values ('evidence-future',$1,'EXPENSE',100,'Future','2026-10-19','bank','manual')", [user]);
  assert.equal(await status(), "verified");
  await db.query("update transactions set date='2026-10-17' where id='evidence-future'");
  assert.equal(await status(), "stale");
  await stamp();
  await db.query("update transactions set description='My manual label' where id='evidence-future'");
  assert.equal(await status(), "verified");
  await db.query("delete from transactions where id='evidence-future'");
  assert.equal(await status(), "stale");
  await stamp();
  await db.query("update accounts set opening_balance=1 where id='bank'");
  assert.equal(await status(), "stale");
  await db.query("update accounts set opening_balance=0,reconciliation=null where id='bank'");
});
async function message(id: string, amount = 12300, accountId = "card") {
  await db.query("insert into gmail_messages(user_id,message_id,status,candidate) values ($1,$2,'review',$3)", [user, id, { amount, date: "2026-10-15", merchant: "Cafe", accountId, direction: "debit", categoryId: "dining" }]);
}
async function commit(id: string, reviewed = false, override = false, account = "card", type = "EXPENSE", destination: string | null = null) {
  const result = await db.query<{ status: string }>("select gmail_commit($1,$2,$3,$4,$5,'dining',false,$6,$7) as status", [user, id, type, account, destination, reviewed, override]);
  return result.rows[0]!.status;
}
test("real migrations apply; duplicate deliveries and repeated approval insert once", async () => {
  await message("a1");
  assert.equal(await commit("a1"), "logged");
  assert.equal(await commit("a1", true, true), "logged");
  assert.equal((await db.query("select id from transactions")).rows.length, 1);
  await message("a2");
  assert.equal(await commit("a2"), "review");
  assert.equal(await commit("a2", true), "review");
  assert.equal(await commit("a2", true, true), "logged");
});
test("account ownership and transfer destination are validated before any write", async () => {
  await message("b1", 45600, "bank");
  await assert.rejects(commit("b1", true, true, "foreign"), /Account not found/);
  await assert.rejects(commit("b1", true, true, "bank", "TRANSFER", "foreign"), /destination/);
  await assert.rejects(commit("b1", true, true, "bank", "TRANSFER", "bank"), /destination/);
  assert.equal((await db.query<{status: string}>("select status from gmail_messages where message_id='b1'")).rows[0]!.status, "review");
  assert.equal(await commit("b1", true, true, "bank", "TRANSFER", "card"), "logged");
  const tx = (await db.query<{type: string; to_account_id: string; category_id: string | null}>("select type,to_account_id,category_id from transactions where amount=45600")).rows[0]!;
  assert.equal(tx.type, "TRANSFER"); assert.equal(tx.to_account_id, "card"); assert.equal(tx.category_id, null);
});
test("bank references deduplicate independently of Gmail id", async () => {
  await db.query("update gmail_messages set event_key='same-reference' where message_id='a1'");
  await assert.rejects(db.query("update gmail_messages set event_key='same-reference' where message_id='a2'"), /unique constraint/);
});
test("only one sync lease can run; browser roles cannot read tokens or call import functions", async () => {
  const lease = "33333333-3333-4333-8333-333333333333";
  assert.equal((await db.query<{ ok: boolean }>("select gmail_acquire_lease($1,$2) ok", [user, lease])).rows[0]!.ok, true);
  assert.equal((await db.query<{ ok: boolean }>("select gmail_acquire_lease($1,$2) ok", [user, lease])).rows[0]!.ok, false);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query("select * from gmail_connections"), /permission denied/);
      await assert.rejects(db.query("select * from gmail_messages"), /permission denied/);
      await assert.rejects(commit("a1"), /permission denied/);
    } finally { await db.exec("reset role"); }
  }
});

test("new Gmail events retain real IST time; matching preserves the canonical manual date", async () => {
  await message("timed",79123,"bank");
  await db.query("update gmail_messages set candidate=candidate||$1 where message_id='timed'",[{occurredAt:"2026-10-15T22:03:04",timeSource:"bank",timeConfidence:"exact",reference:"991234567890"}]);
  assert.equal(await commit("timed",true,false,"bank"),"logged");
  const saved=(await db.query<{id:string;date:string;notes:string}>("select id,date::text,notes from transactions where amount=79123")).rows[0]!;
  assert.equal(saved.date,"2026-10-15 22:03:04");assert.match(saved.notes,/Asia\/Kolkata; source bank/);
  await db.query("update transactions set date='2026-10-15T21:01:00',description='My correction' where id=$1",[saved.id]);
  await message("timed-match",79123,"bank");
  await db.query("update gmail_messages set candidate=candidate||$1 where message_id='timed-match'",[{occurredAt:"2026-10-15T22:03:04",timeSource:"bank",timeConfidence:"exact",reference:"991234567890"}]);
  assert.equal(await commit("timed-match",true,false,"bank"),"matched");
  assert.equal((await db.query<{date:string}>("select date::text from transactions where id=$1",[saved.id])).rows[0]!.date,"2026-10-15 21:01:00");
});

test("parsed HDFC credit affects cash once after explicit review; delayed mail never shifts bank date", async () => {
  const a=parseAlert("alerts@hdfcbank.bank.in","View: Account update for your HDFC Bank A/c","Rs.2345.67 has been successfully credited to your HDFC Bank account ending in 1234. Transaction Details: a. Date: 15-10-26 b. Sender: EXAMPLE PERSON (VPA: person@bank) c. UPI Reference No.: 881234567890",Date.parse("2026-10-16T01:00:00Z"))!;
  await db.query("insert into gmail_messages(user_id,message_id,status,candidate) values($1,'credit-time','review',$2)",[user,{...a,accountId:"bank"}]);
  await assert.rejects(commit("credit-time",false,false,"bank","INCOME"),/Review required/);
  const balance=async()=>Number((await db.query<{n:string}>("select coalesce(sum(case when account_id='bank' then case when type='INCOME' then amount else -amount end else 0 end+case when type='TRANSFER' and to_account_id='bank' then amount else 0 end),0)::text n from transactions")).rows[0]!.n);
  const before=await balance();assert.equal(await commit("credit-time",true,false,"bank","INCOME"),"logged");
  assert.equal(await balance(),before+234567);await commit("credit-time",true,false,"bank","INCOME");assert.equal(await balance(),before+234567);
  const t=(await db.query<{date:string;notes:string}>("select date::text,notes from transactions where amount=234567")).rows[0]!;
  assert.equal(t.date,"2026-10-15 00:00:00");assert.match(t.notes,/transaction time unknown.*fallback only; bank date retained/);
});

test('uncertain category debits affect cash once and category approval is atomic with future learning',async()=>{
 await db.query("insert into categories(id,user_id,name) values('other',$1,'Other'),('gifts',$1,'Gifts')",[user]);
 await message('category-review',90321,'bank');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='category-review'",[{merchant:'Example Person',categoryId:'other',classification:{categoryId:'dining',needsReview:true,reason:'Weak rule',contexts:[]}}]);
 assert.equal((await db.query<{r:string}>("select gmail_commit_classified($1,'category-review') r",[user])).rows[0]!.r,'logged');
 const id=(await db.query<{transaction_id:string}>("select transaction_id from gmail_messages where message_id='category-review' and category_review")).rows[0]!.transaction_id;
 assert.equal((await db.query<{category_id:string}>("select category_id from transactions where id=$1",[id])).rows[0]!.category_id,'other');
 const change=correctedRule({bank:'HDFC',instrument:'bank',tail:'1234',date:'2026-10-15',amount:90321,merchant:'Example Person',direction:'debit'},'gifts',[])!;
 const p={before:null,after:ruleRow({...change.after,id:'category-correction'})};
 assert.equal((await db.query<{r:string}>("select gmail_review_save($1,'category-review','EXPENSE','bank',null,'gifts',false,false,$2) r",[user,p])).rows[0]!.r,'categorized');
 assert.equal((await db.query<{category_id:string;amount:number}>("select category_id,amount from transactions where id=$1",[id])).rows[0]!.category_id,'gifts');
 await db.query("select gmail_review_save($1,'category-review','EXPENSE','bank',null,'gifts',false,false,$2)",[user,p]);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=90321")).rows[0]!.n,1);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from rules where id='category-correction'")).rows[0]!.n,1);
 assert.equal((await db.query<{category_review:boolean}>("select category_review from gmail_messages where message_id='category-review'")).rows[0]!.category_review,false);
});

test('category review cannot overwrite later manual changes or modify a matched existing entry',async()=>{
 await message('category-stale',90421,'bank');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='category-stale'",[{categoryId:'other',reference:'661234567890',classification:{categoryId:'dining',needsReview:true,reason:'Unknown',contexts:[]}}]);
 await db.query("select gmail_commit_classified($1,'category-stale')",[user]);
 await db.query("update transactions set description='My manual correction',category_id='gifts' where amount=90421");
 await assert.rejects(db.query("select gmail_review_save($1,'category-stale','EXPENSE','bank',null,'dining',false)",[user]),/saved entry changed/);
 await message('category-match',90421,'bank');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='category-match'",[{categoryId:'other',reference:'661234567890',classification:{categoryId:'dining',needsReview:true,reason:'Unknown',contexts:[{type:'PEOPLE',value:'work'}]}}]);
 assert.equal((await db.query<{r:string}>("select gmail_commit_classified($1,'category-match') r",[user])).rows[0]!.r,'matched');
 const m=(await db.query<{category_review:boolean}>("select category_review from gmail_messages where message_id='category-match'")).rows[0]!;assert.equal(m.category_review,false);
 assert.equal((await db.query<{description:string}>("select description from transactions where amount=90421")).rows[0]!.description,'My manual correction');
});

test('learning failure rolls category approval back and new RPCs remain server-only',async()=>{
 await message('category-atomic',90521,'bank');await db.query("update gmail_messages set candidate=candidate||$1 where message_id='category-atomic'",[{categoryId:'other',classification:{needsReview:true,reason:'Unknown',contexts:[]}}]);
 await db.query("select gmail_commit_classified($1,'category-atomic')",[user]);
 await assert.rejects(db.query("select gmail_review_save($1,'category-atomic','EXPENSE','bank',null,'dining',false,false,$2)",[user,{before:null,after:{id:'broken',category_id:'gifts',learning_evidence:{source:'gmail-correction',merchantKey:'person'}}}]),/Invalid learned correction/);
 assert.equal((await db.query<{category_id:string}>("select category_id from transactions where amount=90521")).rows[0]!.category_id,'other');
 await db.exec('set role authenticated');try{await assert.rejects(db.query("select gmail_commit_classified($1,'category-atomic')",[user]),/permission denied/);await assert.rejects(db.query("select gmail_seed_rules($1,'[]')",[user]),/permission denied/);}finally{await db.exec('reset role');}
});
