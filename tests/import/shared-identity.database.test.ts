import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const user = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
const stamp = "2026-10-18T00:00:00Z";
let serial = 0;
const tx = (id: string, amount = 12345, extra: Record<string, unknown> = {}) => ({
  id, type: "EXPENSE", amount, account_id: "bank", description: "Bank narration", category_id: "dining",
  date: "2026-10-12T00:00:00", source: "imported", created_at: stamp, updated_at: stamp, ...extra,
});
function entry(amount = 12345, options: { key?: string; ref?: string; match?: string; separate?: boolean; account?: string; direction?: string; date?: string; transaction?: Record<string, unknown>; contexts?: object[] } = {}) {
  const id = `statement-${++serial}`;
  return { transaction: tx(id, amount, options.transaction), contexts: options.contexts ?? [], observation: {
    kind: "statement", key: options.key ?? id, accountId: options.account ?? "bank", direction: options.direction ?? "debit",
    date: options.date ?? "2026-10-12", reference: options.ref, existingTransactionId: options.match,
    allowSeparate: options.separate, payloadHash: "a".repeat(64),
  } };
}
async function asUser<T>(work: () => Promise<T>, who = user): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
  await db.exec("set role authenticated");
  try { return await work(); } finally { await db.exec("reset role"); }
}
async function importRows(rows: ReturnType<typeof entry>[]) {
  return asUser(async () => (await db.query<{ result: { createdIds: string[]; matched: number; removed: number } }>("select commit_statement_import($1) result", [JSON.stringify(rows)])).rows[0]!.result);
}
async function mail(id: string, amount: number, reference?: string, extra: object = {}) {
  await db.query("insert into gmail_messages(user_id,message_id,status,candidate) values($1,$2,'review',$3)", [user,id,{ accountId:"bank",direction:"debit",date:"2026-10-12",merchant:"Different bank merchant",categoryId:"dining",amount,reference,...extra }]);
}
async function gmail(id: string, account = "bank", kind = "EXPENSE", destination: string | null = null, refund = false) {
  return (await db.query<{ result: string }>("select gmail_commit($1,$2,$3,$4,$5,'dining',$6,true,false) result", [user,id,kind,account,destination,refund])).rows[0]!.result;
}

before(async () => {
  db = await PGlite.create();
  await db.exec(`set timezone='UTC';create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  for (const file of files.filter(f => f < "0015")) await db.exec(await readFile(new URL(file,dir),"utf8"));
  await db.query("insert into auth.users values($1),($2)", [user,other]);
  await db.query("insert into accounts(id,user_id,name,type,opening_balance) values('bank',$1,'Bank','BANK',100000),('other-bank',$1,'Other bank','BANK',0),('card',$1,'Card','CREDIT_CARD',0),('foreign',$2,'Foreign','BANK',0),('rb',$1,'Reconcile bank','BANK',10000),('rc',$1,'Reconcile card','CREDIT_CARD',0)", [user,other]);
  await db.query("insert into categories(id,user_id,name) values('dining',$1,'Dining'),('gifts',$1,'Gifts'),('foreign-cat',$2,'Private')",[user,other]);
  await db.query("insert into transactions select * from jsonb_populate_record(null::transactions,$1)",[JSON.stringify({...tx("manual-kept",20000,{description:"My dinner",category_id:"gifts",notes:"Keep my note; reference 123456789012"}),user_id:user})]);
  await db.query("insert into transaction_contexts values('manual-kept',$1,'PEOPLE','work')",[user]);
  await db.query("insert into gmail_messages(user_id,message_id,status,candidate,transaction_id) values($1,'orphan','logged',$2,'deleted-ledger-id'),($1,'dismissed','ignored',$3,null)",[user,{accountId:"bank",direction:"debit",date:"2026-10-12",amount:76500,reference:"777777777777"},{accountId:"bank",direction:"debit",date:"2026-10-12",amount:88800,reference:"888888888888"}]);
  const before = (await db.query<{j:unknown}>("select jsonb_agg(jsonb_strip_nulls(to_jsonb(t)) order by id) j from transactions t")).rows[0]!.j;
  for (const file of files.filter(f => f >= "0015")) await db.exec(await readFile(new URL(file,dir),"utf8"));
  assert.deepEqual((await db.query<{j:unknown}>("select jsonb_agg(jsonb_strip_nulls(to_jsonb(t)) order by id) j from transactions t")).rows[0]!.j,before,"migration must not mutate financial rows");
});
after(async () => { await db?.close(); });

test("Gmail and two different statement files share a canonical manually categorized entry", async () => {
  await mail("cross-source",20000,"0000123456789012");
  assert.equal(await gmail("cross-source"),"matched");
  const one=await importRows([entry(20000,{ref:"123456789012"})]);
  const two=await importRows([entry(20000,{ref:"123456789012",transaction:{description:"Another narration",category_id:"dining"}})]);
  assert.deepEqual(one,{createdIds:[],matched:1,removed:0}); assert.equal(two.matched,1);
  const kept=(await db.query<{description:string;category_id:string;notes:string}>("select description,category_id,notes from transactions where id='manual-kept'")).rows[0]!;
  assert.equal(kept.description,"My dinner"); assert.equal(kept.category_id,"gifts"); assert.match(kept.notes,/Keep my note/);
  assert.equal((await db.query<{n:number}>("select count(*) n from transaction_contexts where transaction_id='manual-kept'")).rows[0]!.n,1);
  assert.equal((await db.query<{transaction_id:string}>("select transaction_id from gmail_messages where message_id='cross-source'")).rows[0]!.transaction_id,"manual-kept");
});

test("a repeated file preserves later manual edits and does not add an entry", async () => {
  const e=entry(32100,{ref:"222222222222",contexts:[{type:"PEOPLE",value:"work"}]});
  const first=await importRows([e]);assert.equal(first.createdIds.length,1);
  await db.query("update transactions set description='Edited later',category_id='gifts',notes='Private corrected note' where id=$1",[e.transaction.id]);
  const retry=await importRows([e]);assert.equal(retry.createdIds.length,0);assert.equal(retry.matched,1);
  assert.equal((await db.query<{description:string}>("select description from transactions where id=$1",[e.transaction.id])).rows[0]!.description,"Edited later");
});

test("same-day, equal-amount payments with distinct references both affect the bank", async () => {
  const a=entry(45100,{ref:"333333333331"}),b=entry(45100,{ref:"333333333332"});
  const result=await importRows([a,b]);assert.equal(result.createdIds.length,2);
  assert.equal((await db.query<{n:number}>("select sum(amount)::bigint n from transactions where id in($1,$2)",[a.transaction.id,b.transaction.id])).rows[0]!.n,90200);
});

test("opposite directions and a refund sharing its purchase reference are separate events", async () => {
  const purchase=entry(53200,{ref:"444444444444"});await importRows([purchase]);
  const refund=entry(53200,{ref:"444444444444",direction:"credit",transaction:{type:"INCOME",is_refund:true,reverses_transaction_id:purchase.transaction.id}});
  assert.equal((await importRows([refund])).createdIds.length,1);
  assert.equal((await db.query<{n:number}>("select sum(case when type='INCOME' then amount else -amount end)::bigint n from transactions where id in($1,$2)",[purchase.transaction.id,refund.transaction.id])).rows[0]!.n,0);
});

test("ambiguous amount/date matches roll back every row in a statement batch", async () => {
  const first=entry(61600,{ref:"666666666666"});
  await assert.rejects(importRows([first,entry(20000)]),/Possible existing transaction/);
  assert.equal((await db.query<{n:number}>("select count(*) n from transactions where id=$1",[first.transaction.id])).rows[0]!.n,0);
  assert.equal((await db.query<{n:number}>("select count(*) n from transaction_sources where source_key=$1",[first.observation.key])).rows[0]!.n,0);
  assert.equal((await importRows([entry(20000,{match:"manual-kept"})])).matched,1);
  assert.equal((await importRows([entry(20000,{separate:true})])).createdIds.length,1);
});

test("deleted identities remain tombstones and intentional Gmail dismissals stay untouched", async () => {
  const e=entry(71700,{ref:"717171717171"});await importRows([e]);
  await db.query("delete from transactions where id=$1",[e.transaction.id]);
  assert.equal((await importRows([e])).removed,1);
  await assert.rejects(importRows([entry(76500,{ref:"777777777777"})]),/previously removed/i);
  assert.equal((await db.query<{status:string}>("select status from gmail_messages where message_id='dismissed'")).rows[0]!.status,"ignored");
});

test("cross-account transfer alerts match the credit endpoint without a second bank credit", async () => {
  const e=entry(81200,{ref:"818181818181",transaction:{type:"TRANSFER",to_account_id:"other-bank",category_id:null}});await importRows([e]);
  await mail("transfer-credit",81200,"818181818181",{accountId:"other-bank",direction:"credit"});
  assert.equal(await gmail("transfer-credit","bank","TRANSFER","other-bank"),"matched");
  assert.equal((await db.query<{n:number}>("select count(*) n from transactions where amount=81200")).rows[0]!.n,1);
});

test("source collisions with changed amounts or reused reference dates require review", async () => {
  const e=entry(91900,{ref:"919191919191"});await importRows([e]);
  await assert.rejects(importRows([entry(92000,{key:e.observation.key})]),/Source identity conflicts/);
  await assert.rejects(importRows([entry(91900,{ref:"919191919191",date:"2026-10-18",transaction:{date:"2026-10-18T00:00:00"}})]),/outside the posting-date window/);
});

test("Gmail explicit linking preserves user corrections and validates ownership", async () => {
  const manual=entry(104200,{transaction:{description:"Personal dinner",category_id:"gifts"}});await importRows([manual]);
  await mail("explicit",104200);
  assert.equal(await gmail("explicit"),"review");
  assert.equal((await db.query<{s:string}>("select gmail_match_existing($1,'explicit','bank',$2) s",[user,manual.transaction.id])).rows[0]!.s,"matched");
  assert.equal((await db.query<{category_id:string}>("select category_id from transactions where id=$1",[manual.transaction.id])).rows[0]!.category_id,"gifts");
  await assert.rejects(asUser(()=>db.query("select import_financial_event($1,'gmail','hacked','bank','debit','2026-10-12',null,'{}')",[user])),/permission denied/);
  await assert.rejects(importRows([entry(111200,{transaction:{account_id:"foreign"},account:"foreign"})]),/Account not found/);
  await assert.rejects(importRows([entry(111200,{transaction:{category_id:"foreign-cat"}})]),/Category not found/);
  assert.equal((await asUser(()=>db.query("select * from transaction_sources"),other)).rows.length,0);
  await assert.rejects(asUser(()=>db.query("delete from transaction_sources")),/permission denied/);
});

function reconciliationChanges(rows: Record<string,unknown>[]) {
  return {transactions:rows.map(after=>({before:null,after,afterContexts:[],beforeContexts:[]}))};
}
async function reconcile(changes: unknown,checks: unknown) {
  return asUser(()=>db.query("select commit_reconciliation($1,$2)",[JSON.stringify(changes),JSON.stringify(checks)]));
}
test("reconciliation is atomic, checkpoint guarded and repeatable across purchases, repayment and refunds", async () => {
  const rows=[tx("rp",2000,{account_id:"rc"}),tx("rt",1000,{type:"TRANSFER",account_id:"rb",to_account_id:"rc",category_id:null}),
    tx("rr",400,{type:"INCOME",account_id:"rc",is_refund:true,reverses_transaction_id:"rp"})];
  const changes=reconciliationChanges(rows);const checks=[{accountId:"rb",asOf:"2026-10-18",balance:9000},{accountId:"rc",asOf:"2026-10-18",balance:600}];
  await assert.rejects(reconcile(changes,[...checks.slice(0,1),{...checks[1],balance:601}]),/Closing balance does not tally/);
  assert.equal((await db.query<{n:number}>("select count(*) n from transactions where id in('rp','rt','rr')")).rows[0]!.n,0);
  assert.equal((await db.query<{n:number}>("select count(*) n from transaction_sources where source_kind='reconciliation' and source_key='rp'")).rows[0]!.n,0);
  await reconcile(changes,checks);await reconcile(changes,checks);
  assert.equal((await db.query<{n:number}>("select count(*) n from transactions where id in('rp','rt','rr')")).rows[0]!.n,3);
});

test("stale manual contexts and descriptions abort reconciliation before overwriting them", async () => {
  const before=(await db.query<{row:Record<string,unknown>}>("select to_jsonb(t) row from transactions t where id='rp'")).rows[0]!.row;
  const changes={transactions:[{before,after:{...before,description:"Prepared edit"},beforeContexts:[],afterContexts:[]}]};
  await db.query("insert into transaction_contexts values('rp',$1,'PEOPLE','family')",[user]);
  await assert.rejects(reconcile(changes,[{accountId:"rc",asOf:"2026-10-18",balance:600}]),/changed since/);
  assert.equal((await db.query<{description:string}>("select description from transactions where id='rp'")).rows[0]!.description,"Bank narration");
});

test("historical enrichment is owner scoped, atomic, metadata only and replay safe", async()=>{
  await db.query("insert into categories(id,user_id,name) values('dining.dinner',$1,'Dinner')",[user]);
  const before=tx('enrichment-one'), second=tx('enrichment-two');
  for(const row of [before,second]) await db.query("insert into transactions select * from jsonb_populate_record(null::transactions,$1)",[JSON.stringify({...row,user_id:user})]);
  const change=(row: ReturnType<typeof tx>)=>({before:row,after:{...row,date:'2026-10-12T21:00:00',category_id:'dining.dinner',timing:{source:'bank',precision:'exact',timezone:'Asia/Kolkata'},enrichment:{version:1,ruleIds:['meal-time-v1']}},beforeContexts:[],afterContexts:[{type:'PEOPLE',value:'family'}]});
  const one=change(before),two=change(second);
  const commit=(changes: unknown[],who=user)=>asUser(()=>db.query("select commit_transaction_enrichment($1)",[JSON.stringify(changes)]),who);
  await assert.rejects(commit([one],other),/missing or not owned/);
  await assert.rejects(commit([{...one,after:{...one.after,amount:999}}]),/financial/);
  await assert.rejects(commit([{...one,after:{...one.after,date:'2026-10-13T21:00:00'}}]),/financial/);
  await assert.rejects(commit([one,{...two,before:{...two.before,description:'stale'},after:{...two.after,description:'stale'}}]),/changed since preview/);
  assert.equal((await db.query<{category_id:string}>("select category_id from transactions where id=$1",[before.id])).rows[0]!.category_id,'dining');
  await commit([one,two]);await commit([one,two]);
  const saved=(await db.query<{amount:number;category_id:string;timing:unknown}>("select amount,category_id,timing from transactions where id=$1",[before.id])).rows[0]!;
  assert.equal(saved.amount,before.amount);assert.equal(saved.category_id,'dining.dinner');assert.deepEqual(saved.timing,one.after.timing);
  await db.query("update transaction_contexts set value='friends' where transaction_id=$1",[before.id]);
  await assert.rejects(commit([one]),/changed since preview/);
});
