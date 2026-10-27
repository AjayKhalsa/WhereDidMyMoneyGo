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

test('strong-reference matching precedes financial-purpose review and preserves every manual field',async()=>{
 const amount=6234567,ref='761234567890';
 await db.query("insert into transactions(id,user_id,type,amount,description,date,account_id,to_account_id,notes,source) values('manual-repayment',$1,'TRANSFER',$2,'My partial card payment','2026-10-15T09:17:21','bank','card',$3,'manual')",[user,amount,`My note; reference ${ref}`]);
 const original=(await db.query("select to_jsonb(t) as row from transactions t where id='manual-repayment'")).rows[0];
 await message('repayment-credit-match',amount,'card');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='repayment-credit-match'",[{direction:'credit',special:true,creditKind:'repayment',reference:ref}]);
 const match=async(auth=true)=>(await db.query<{r:string}>("select gmail_match_recorded($1,'repayment-credit-match',$2) r",[user,auth])).rows[0]!.r;
 assert.equal(await match(false),'review'); assert.equal(await match(),'matched');
 assert.equal(await match(),'logged');
 assert.deepEqual((await db.query("select to_jsonb(t) as row from transactions t where id='manual-repayment'")).rows[0],original);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=$1",[amount])).rows[0]!.n,1);
 assert.equal((await db.query<{category_review:boolean}>("select category_review from gmail_messages where message_id='repayment-credit-match'")).rows[0]!.category_review,false);
});

test('same amount/date without a shared reference stays review; user can link an ICICI-style receipt once',async()=>{
 const amount=6234567;
 await message('receipt-no-reference',amount,'card');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='receipt-no-reference'",[{direction:'credit',special:true,creditKind:'repayment'}]);
 assert.equal((await db.query<{r:string}>("select gmail_match_recorded($1,'receipt-no-reference',true) r",[user])).rows[0]!.r,'review');
 assert.equal((await db.query<{r:string}>("select gmail_match_existing($1,'receipt-no-reference','card','manual-repayment') r",[user])).rows[0]!.r,'matched');
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=$1",[amount])).rows[0]!.n,1);
});

test('repeated CRED order identity links to its confirmed transfer, never another amount/date-only payment',async()=>{
 await message('provider-first',6234567,'card');
 const data={direction:'credit',special:true,creditKind:'repayment',providerReference:'CRED:ORDER123456'};
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='provider-first'",[data]);
 await db.query("select gmail_match_existing($1,'provider-first','card','manual-repayment')",[user]);
 await message('provider-repeated',6234567,'card');await db.query("update gmail_messages set candidate=candidate||$1 where message_id='provider-repeated'",[data]);
 assert.equal((await db.query<{r:string}>("select gmail_match_recorded($1,'provider-repeated',true) r",[user])).rows[0]!.r,'matched');
 await message('different-provider-order',6234567,'card');await db.query("update gmail_messages set candidate=candidate||$1 where message_id='different-provider-order'",[{...data,providerReference:'CRED:OTHER123456'}]);
 assert.equal((await db.query<{r:string}>("select gmail_match_recorded($1,'different-provider-order',true) r",[user])).rows[0]!.r,'review');
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=6234567")).rows[0]!.n,1);
});

test('ambiguous bank references never merge legitimate repeated payments',async()=>{
 const amount=7234567,ref='771234567890';
 await db.query("insert into transactions(id,user_id,type,amount,description,date,account_id,notes,source) values('repeat-one',$1,'EXPENSE',$2,'One','2026-10-15','bank',$3,'manual'),('repeat-two',$1,'EXPENSE',$2,'Two','2026-10-15','bank',$3,'manual')",[user,amount,`reference ${ref}`]);
 await message('ambiguous-reference',amount,'bank');await db.query("update gmail_messages set candidate=candidate||$1 where message_id='ambiguous-reference'",[{reference:ref}]);
 assert.equal((await db.query<{r:string}>("select gmail_match_recorded($1,'ambiguous-reference',true) r",[user])).rows[0]!.r,'review');
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=$1",[amount])).rows[0]!.n,2);
});

test('new parser version retries only unresolved receipts, preserving dismissals and completed category reviews',async()=>{
 for(const [id,status] of [['old-format','review'],['intentional-dismissal','ignored'],['already-logged','logged']] as const){
  await db.query("insert into gmail_messages(user_id,message_id,status) values($1,$2,$3)",[user,id,status]);
 }
 await db.query("update gmail_messages set parser_version=1 where message_id='old-format'");
 const queue=async()=>(await db.query<{message_id:string}>("select message_id from gmail_messages where user_id=$1 and (status='pending' or (status='review' and parser_version<2)) and message_id in ('old-format','intentional-dismissal','already-logged')",[user])).rows.map(r=>r.message_id);
 assert.deepEqual(await queue(),['old-format']);
 await db.query("update gmail_messages set parser_version=2 where message_id='old-format'");assert.deepEqual(await queue(),[]);
});

test('partial card repayment changes bank cash and liability once, without a second spending expense',async()=>{
 await message('partial-card-repayment',6400000,'card');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='partial-card-repayment'",[{direction:'credit',special:true,creditKind:'repayment',reference:'781234567890'}]);
 const totals=async()=>(await db.query<{cash:string;liability:string;spending:string}>("select coalesce(sum(case when account_id='bank' then case when type='INCOME' then amount else -amount end else 0 end+case when type='TRANSFER' and to_account_id='bank' then amount else 0 end),0)::text cash, coalesce(sum(case when account_id='card' and type='EXPENSE' then amount when to_account_id='card' and type='TRANSFER' then -amount else 0 end),0)::text liability,coalesce(sum(case when type='EXPENSE' then amount else 0 end),0)::text spending from transactions")).rows[0]!;
 const before=await totals();assert.equal(await commit('partial-card-repayment',true,false,'bank','TRANSFER','card'),'logged');
 const after=await totals();assert.equal(Number(after.cash)-Number(before.cash),-6400000);assert.equal(Number(after.liability)-Number(before.liability),-6400000);assert.equal(after.spending,before.spending);
 await commit('partial-card-repayment',true,false,'bank','TRANSFER','card');assert.deepEqual(await totals(),after);
});

test('automatic matching stays server-only and cannot restore dismissed or removed financial events',async()=>{
 await message('dismissed-before-match',9934567,'bank');await db.query("update gmail_messages set status='ignored' where message_id='dismissed-before-match'");
 assert.equal((await db.query<{r:string}>("select gmail_match_recorded($1,'dismissed-before-match',true) r",[user])).rows[0]!.r,'ignored');
 await message('removed-match',9934567,'bank');
 await db.query("insert into transaction_sources(user_id,source_kind,source_key,transaction_id,account_id,direction,amount,occurred_on,match_reason) values($1,'gmail','removed-match',null,'bank','debit',9934567,'2026-10-15','removed')",[user]);
 assert.equal((await db.query<{r:string}>("select gmail_match_recorded($1,'removed-match',true) r",[user])).rows[0]!.r,'duplicate');
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{await assert.rejects(db.query("select gmail_match_recorded($1,'removed-match',true)",[user]),/permission denied/);}finally{await db.exec('reset role');}}
});

test('authenticated explicit salary credits increase cash once without using expected salary or expense categories',async()=>{
 await message('automatic-salary',12034567,'bank');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='automatic-salary'",[{direction:'credit',creditKind:'income',incomeKind:'salary',instrument:'bank',merchant:'NEFT Cr-BANK0000104-SAL OCT 26 EXAMPLE EMPLOYER',reference:'821234567890'}]);
 const amount=async()=>Number((await db.query<{n:string}>("select coalesce(sum(amount),0)::text n from transactions where type='INCOME' and account_id='bank' and not is_refund")).rows[0]!.n);
 const before=await amount();
 assert.equal((await db.query<{r:string}>("select gmail_commit_identified_credit($1,'automatic-salary',false) r",[user])).rows[0]!.r,'review');
 assert.equal((await db.query<{r:string}>("select gmail_commit_identified_credit($1,'automatic-salary',true) r",[user])).rows[0]!.r,'logged');
 assert.equal(await amount()-before,12034567);
 await db.query("select gmail_commit_identified_credit($1,'automatic-salary',true)",[user]);assert.equal(await amount()-before,12034567);
 const t=(await db.query<{is_refund:boolean;category_id:string|null}>("select is_refund,category_id from transactions where amount=12034567")).rows[0]!;
 assert.equal(t.is_refund,false);assert.equal(t.category_id,null);
});

test('an already entered salary is not inserted twice and generic incoming credits remain reviewable',async()=>{
 await message('salary-already-entered',12034567,'bank');
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='salary-already-entered'",[{direction:'credit',creditKind:'income',incomeKind:'salary',instrument:'bank',merchant:'NEFT Cr-BANK0000104-SAL OCT 26 EXAMPLE EMPLOYER'}]);
 assert.equal((await db.query<{r:string}>("select gmail_commit_identified_credit($1,'salary-already-entered',true) r",[user])).rows[0]!.r,'review');
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=12034567")).rows[0]!.n,1);
 for(const [id,merchant,kind] of [['ordinary-credit','NEFT Cr-SELF TRANSFER','unknown'],['interest-credit','Int.Pd:30-09-2026','income'],['false-salary','SALARY ACCOUNT TRANSFER','income']] as const){
  await message(id,12004567,'bank');await db.query("update gmail_messages set candidate=candidate||$1 where message_id=$2",[{direction:'credit',creditKind:kind,incomeKind:'salary',instrument:'bank',merchant},id]);
  assert.equal((await db.query<{r:string}>("select gmail_commit_identified_credit($1,$2,true) r",[user,id])).rows[0]!.r,'review');
 }
});

test('initiated refunds do not alter liabilities; posted refunds reduce debt and consumption once, never earned income',async()=>{
 const a={direction:'credit',creditKind:'refund',refundStatus:'initiated',instrument:'credit_card',merchant:'EXAMPLE SHOP',categoryId:'other',reference:'831234567890',classification:{needsReview:true}};
 await message('card-refund',239900,'card');await db.query("update gmail_messages set candidate=candidate||$1 where message_id='card-refund'",[a]);
 assert.equal((await db.query<{r:string}>("select gmail_commit_identified_credit($1,'card-refund',true) r",[user])).rows[0]!.r,'review');
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=239900")).rows[0]!.n,0);
 const totals=async()=>(await db.query<{liability:string;spent:string;earned:string}>("select coalesce(sum(case when account_id='card' and type in ('EXPENSE','INVESTMENT','TRANSFER') then amount when account_id='card' and type='INCOME' then -amount when to_account_id='card' and type='TRANSFER' then -amount else 0 end),0)::text liability,coalesce(sum(case when type='EXPENSE' then amount when type='INCOME' and is_refund then -amount else 0 end),0)::text spent,coalesce(sum(case when type='INCOME' and not is_refund then amount else 0 end),0)::text earned from transactions")).rows[0]!;
 const before=await totals();
 await db.query("update gmail_messages set candidate=candidate||$1 where message_id='card-refund'",[{refundStatus:'posted'}]);
 assert.equal((await db.query<{r:string}>("select gmail_commit_identified_credit($1,'card-refund',true) r",[user])).rows[0]!.r,'logged');
 const t=(await db.query<{type:string;is_refund:boolean;account_id:string}>("select type,is_refund,account_id from transactions where amount=239900")).rows[0]!;
 assert.equal(t.type,'INCOME');assert.equal(t.is_refund,true);assert.equal(t.account_id,'card');
 const after=await totals();assert.equal(Number(after.liability)-Number(before.liability),-239900);assert.equal(Number(after.spent)-Number(before.spent),-239900);assert.equal(after.earned,before.earned);
 assert.equal((await db.query<{category_review:boolean}>("select category_review from gmail_messages where message_id='card-refund'")).rows[0]!.category_review,true);
 await db.query("select gmail_commit_identified_credit($1,'card-refund',true)",[user]);
 assert.deepEqual(await totals(),after);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from transactions where amount=239900")).rows[0]!.n,1);
 await db.exec('set role authenticated');try{await assert.rejects(db.query("select gmail_commit_identified_credit($1,'card-refund',true)",[user]),/permission denied/);}finally{await db.exec('reset role');}
});
