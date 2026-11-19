import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
const require = createRequire(import.meta.url), hook=registerHooks({resolve(s,c,n){return n(s==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:s,c);}});
const { processStatementEvidence } = await import('@/lib/gmail/statement-processing');
const { seal } = await import('@/lib/gmail/server');
const original=globalThis.fetch,oldKey=process.env.GMAIL_TOKEN_KEY;after(()=>{globalThis.fetch=original;hook.deregister();if(oldKey===undefined)delete process.env.GMAIL_TOKEN_KEY;else process.env.GMAIL_TOKEN_KEY=oldKey;});
const user='11111111-1111-4111-8111-111111111111',db=createClient('https://database.example','synthetic',{auth:{persistSession:false,autoRefreshToken:false}});
const bytes=await readFile(new URL('../fixtures/synthetic-encrypted-statement.pdf',import.meta.url));
function fixture(){
 process.env.GMAIL_TOKEN_KEY='ab'.repeat(32);let password:string|undefined,race=false,credentialReads=0;
 const rows:any[]=[{message_id:'icici',bank:'ICICI',subject:'ICICI Bank Credit Card Statement for the period October 9 2026 to November 8 2026',body_text:'Credit Card XX1234 Payment due by November 26, 2026 Total Amount Due: ₹36,005.22',received_at:'2026-11-09T01:00:00Z',attachments:[],pdf_status:'pending',parser_version:0},
 {message_id:'hsbc',bank:'HSBC',subject:'Your HSBC Credit Card statement',body_text:'Your monthly statement is attached.',received_at:'2026-10-25T22:00:00Z',attachments:[{name:'20261025.pdf'}],pdf_status:'pending',parser_version:0}];
 const applied:any[]=[],checks:any[]=[];
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method??'GET';
  if(url.hostname==='gmail.googleapis.com')return json(url.pathname.includes('/attachments/')?{data:bytes.toString('base64url')}:{payload:{mimeType:'multipart/mixed',parts:[{filename:'20261025.pdf',mimeType:'application/pdf',body:{attachmentId:'synthetic-attachment',size:bytes.length}}]}});
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url.pathname.endsWith('/rpc/apply_issuer_statement')){assert.equal(body.p_user,user);applied.push(body);return json('applied');}
  assert.equal(url.searchParams.get('user_id'),`eq.${user}`,'Every evidence/credential query must be owner scoped');
  if(url.pathname.endsWith('/accounts')){
    if(method==='PATCH'){assert.ok(Object.keys(body).every(k=>['reconciliation','last_reconciled_at'].includes(k)));checks.push(body.reconciliation);return json(null);}
    return json({id:url.searchParams.get('id')!.slice(3),name:'Card',type:'CREDIT_CARD',opening_balance:0,is_active:true,created_at:'2026-07-01'});
  }
  if(url.pathname.endsWith('/transactions')){assert.equal(method,'GET');return new Response(JSON.stringify([{id:'recorded',type:'EXPENSE',amount:3600522,account_id:'icici-card',date:'2026-11-01T12:00:00'}]),{headers:{'content-type':'application/json','content-range':'0-0/1'}});}
  if(url.pathname.endsWith('/statement_credentials')){assert.equal(url.searchParams.get('account_id'),'eq.hsbc-card');credentialReads++;return json(password?{sealed_password:seal(password,`${user}:statement:hsbc-card`),updated_at:'2026-11-19T00:00:00Z'}:race&&credentialReads>1?{updated_at:'2026-11-19T00:00:00Z'}:null);}
  assert.ok(url.pathname.endsWith('/financial_mail_evidence'),'Statement processing cannot write accounting transactions');
  if(method==='PATCH'){Object.assign(rows.find(r=>r.message_id===url.searchParams.get('message_id')?.slice(3)),body);return json(null);}
  if(method==='HEAD')return new Response(null,{headers:{'content-range':`*/${rows.filter(r=>r.parser_version<1).length}`}});
  return json(rows.filter(r=>r.parser_version<1));
 };
 const accounts=[{id:'icici-card',name:'ICICI Coral',type:'CREDIT_CARD' as const,hint:'1234',isActive:true},{id:'hsbc-card',name:'HSBC Travel One',type:'CREDIT_CARD' as const,hint:'5678',isActive:true}];
 return{rows,applied,checks,setPassword(value:string){password=value;rows[1].parser_version=0;},race(){race=true;},run(){return processStatementEvidence({db,userId:user,accessToken:'synthetic',deadline:Date.now()+60000,accounts,aliases:{}});}};
}
test('bank body updates the actual bill while encrypted PDFs wait for a password',async()=>{
 const f=fixture();assert.deepEqual(await f.run(),{processed:2,more:false});assert.equal(f.applied.length,1);assert.equal(f.applied[0].p_statement.amount,3600522);assert.equal(f.applied[0].p_statement_day,9);
 assert.equal(f.rows[1].pdf_status,'locked');assert.match(f.rows[1].processing_note,/password/);
 assert.equal(f.checks[0].status,'verified');assert.equal(f.checks[0].balance,3600522);
 f.setPassword('synthetic-pdf-password');await f.run();assert.equal(f.rows[1].pdf_status,'read');assert.equal(f.applied[1].p_statement.amount,12345);assert.equal(f.applied[1].p_statement.dueOn,'2026-11-09');
 assert.equal(f.checks[1].status,'stale','A source mismatch must be flagged without inventing a balancing entry');
 assert.ok(!JSON.stringify(f.rows).includes('synthetic-pdf-password'));
});
test('saving a new password during a locked read retains the retry',async()=>{
 const f=fixture();f.race();assert.equal((await f.run()).more,true);assert.equal(f.rows[1].parser_version,0);
});
