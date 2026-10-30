import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const require=createRequire(import.meta.url);
const hook=registerHooks({resolve(specifier,context,next){return next(specifier==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:specifier,context);}});
const {syncMailbox}=await import('@/lib/gmail/sync');
const {seal}=await import('@/lib/gmail/server');
const {ALERT_PARSER_VERSION}=await import('@/lib/gmail/alerts');
const user='11111111-1111-4111-8111-111111111111';
const originalFetch=globalThis.fetch;
const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GMAIL_TOKEN_KEY','APP_ORIGIN','CRON_SECRET'];
const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
after(()=>{globalThis.fetch=originalFetch;hook.deregister();for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});

test('expired paging cursor replays fixed scan without deleting receipts or advancing on other errors',async()=>{
 for(const name of names)process.env[name]='synthetic';
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.example';process.env.GMAIL_TOKEN_KEY='ab'.repeat(32);
 let upstreamStatus=400;let queries:URLSearchParams[]=[];let updates:any[]=[];
 const connection={refresh_token:seal('refresh',user),start_date:'2026-10-01',aliases:{},page_token:'expired',scan_after:1791000000,scan_started_at:'2026-10-25T05:00:00Z',last_synced_at:'2026-10-20T05:00:00Z'};
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','content-range':'*/0'}});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method??'GET';
  if(url.hostname==='oauth2.googleapis.com')return json({access_token:'synthetic'});
  if(url.hostname==='gmail.googleapis.com'){if(!url.searchParams.get('q')?.includes('noreply@zomato.com'))queries.push(url.searchParams);return url.searchParams.has('pageToken')?json({error:'Synthetic invalid cursor'},upstreamStatus):json({messages:[]});}
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url.pathname.endsWith('/rpc/gmail_acquire_lease'))return json(true);
  if(url.pathname.endsWith('/gmail_connections')){if(method==='GET')return json(connection);updates.push(body);return json(body?.receipt_scan?{user_id:user}:null);}
  assert.equal(method==='GET'||method==='HEAD',true,'Replay may not delete receipts or write financial rows');
  if(url.pathname.endsWith('/profiles'))return json(null);
  if(method==='HEAD')return new Response(null,{headers:{'content-range':'*/0'}});
  return json([]);
 };
 assert.equal((await syncMailbox(user)).more,false);assert.equal(queries.length,2);
 assert.equal(queries[0]!.get('q'),queries[1]!.get('q'));assert.equal(queries[1]!.has('pageToken'),false);
 assert.deepEqual(updates[0],{page_token:null});
 for(const status of [403,429,503]){
  upstreamStatus=status;queries=[];updates=[];await assert.rejects(syncMailbox(user));
  assert.equal(queries.length,1);assert.equal(updates.some(p=>'page_token' in p||'last_synced_at' in p),false);
 }
});

test('real sync retries review upgrades, matches before categorization and dispatches only identified posted credits',async()=>{
 for(const name of names)process.env[name]='synthetic';
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.example';process.env.GMAIL_TOKEN_KEY='ab'.repeat(32);
 const connection={refresh_token:seal('synthetic-refresh',user),start_date:'2026-10-01',aliases:{},last_synced_at:null};
 let mail:{status:string;parser_version:number}={status:'review',parser_version:1};
 let bodyKind:'other-credit'|'salary'|'posted-refund'|'initiated-refund'='other-credit';
 let failMatch=true;
 const updates:Record<string,unknown>[]=[];
 const calls:string[]=[];
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','content-range':'0-0/0'}});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  const method=init?.method??'GET';calls.push(`${method} ${url.pathname}`);
  if(url.hostname==='oauth2.googleapis.com')return json({access_token:'synthetic-access'});
  if(url.hostname==='gmail.googleapis.com'){
   if(url.pathname.endsWith('/messages'))return json({messages:[]});
   const text=bodyKind==='salary'
    ? 'You have received a credit in your HDFC Bank account. Details of the transaction: Amount received: INR 120345.67 Account: XX1234 Date: 15-OCT-2026 Reference Details: NEFT Cr-BANK0000104-SAL OCT 26 EXAMPLE EMPLOYER Available Balance: INR 150000.00'
    : bodyKind==='posted-refund'||bodyKind==='initiated-refund'
      ? `A transaction reversal of Rs. 2399.00 has been ${bodyKind==='posted-refund'?'credited':'initiated'} to your HDFC Bank Credit Card ending 5678 From Merchant: EXAMPLE SHOP Date Time: 15 Oct, 2026 at 17:00:56`
      : 'Rs.14235.67 has been successfully credited to your HDFC Bank account ending in 1234. Transaction Details: a. Date: 15-10-26 b. Sender: EXAMPLE PERSON c. UPI Reference No.: 991234567890';
   return json({internalDate:String(Date.parse('2026-10-15T05:00:00Z')),payload:{mimeType:'text/plain',headers:[{name:'From',value:'alerts@hdfcbank.bank.in'},{name:'Subject',value:'View: Account update for your HDFC Bank A/c'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=hdfcbank.bank.in'}],body:{data:Buffer.from(text).toString('base64url')}}});
  }
  assert.equal(url.hostname,'database.example');
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url.pathname.endsWith('/rpc/gmail_acquire_lease'))return json(true);
  if(url.pathname.endsWith('/rpc/gmail_match_recorded')){
   assert.equal(body.p_authenticated,true);assert.equal(body.p_message,'credit');
   if(bodyKind!=='other-credit')return json('review');
   if(failMatch){failMatch=false;return json({message:'Synthetic transient failure',code:'500'},500);}
   mail.status='logged';return json('matched');
  }
  if(url.pathname.endsWith('/rpc/gmail_commit_identified_credit')){
   assert.equal(body.p_authenticated,true);assert.ok(bodyKind==='salary'||bodyKind==='posted-refund');mail.status='logged';return json('logged');
  }
  if(url.pathname.endsWith('/gmail_connections'))return json(method==='GET'?connection:body?.receipt_scan?{user_id:user}:null);
  if(url.pathname.endsWith('/accounts'))return json([{id:'bank',name:'HDFC',type:'BANK',hint:'1234',is_active:true},{id:'card',name:'HDFC Card',type:'CREDIT_CARD',hint:'5678',is_active:true}]);
  if(url.pathname.endsWith('/categories'))return json([{id:'other'},{id:'dining'}]);
  if(url.pathname.endsWith('/rules')||url.pathname.endsWith('/rule_contexts')||url.pathname.endsWith('/transactions')){
   assert.equal(method,'GET','Sync must not write financial rows while matching');return json([]);
  }
  if(url.pathname.endsWith('/profiles'))return json(null);
  if(url.pathname.endsWith('/gmail_messages')){
   if(method==='PATCH'){
    assert.equal(url.searchParams.get('message_id'),'eq.credit');updates.push(body);mail={...mail,...body};
    return json(url.searchParams.has('select')?{message_id:'credit'}:null);
   }
   if(method==='HEAD')return new Response(null,{status:200,headers:{'content-range':'*/0'}});
   if(url.searchParams.get('select')==='message_id'){
    assert.equal(url.searchParams.get('or'),`(status.eq.pending,and(status.eq.review,parser_version.lt.${ALERT_PARSER_VERSION}))`);
    return json(mail.status==='review'&&mail.parser_version<ALERT_PARSER_VERSION?[{message_id:'credit'}]:[]);
   }
   return json([]);
  }
  throw Error(`Unexpected synthetic request: ${method} ${url.pathname}`);
 };
 await assert.rejects(syncMailbox(user));
 assert.equal(mail.status,'review');assert.equal(mail.parser_version,1,'Failure must not consume the parser upgrade');
 assert.equal(updates.some(p=>'parser_version' in p),false);
 const result=await syncMailbox(user);
 assert.deepEqual(result,{logged:0,reviewed:0,matched:1,more:false,receiptsChecked:0,receiptsLinked:0});
 assert.equal(mail.status,'logged');assert.equal(mail.parser_version,ALERT_PARSER_VERSION);
 assert.equal(calls.some(c=>c.includes('gmail_commit_classified')),false,'Credit was matched before financial-purpose review');
 assert.equal(calls.filter(c=>c.endsWith('/rpc/gmail_match_recorded')).length,2);
 for(const kind of ['salary','posted-refund','initiated-refund'] as const){
  bodyKind=kind;mail={status:'review',parser_version:1};
  const actual=await syncMailbox(user);
  assert.deepEqual(actual,{logged:kind==='initiated-refund'?0:1,reviewed:kind==='initiated-refund'?1:0,matched:0,more:false,receiptsChecked:0,receiptsLinked:0});
  assert.equal(mail.status,kind==='initiated-refund'?'review':'logged');
 }
 assert.equal(calls.filter(c=>c.endsWith('/rpc/gmail_commit_identified_credit')).length,2,'Only salary and posted refunds can auto-credit');
 assert.equal(calls.some(c=>c.includes('gmail_commit_classified')),false);
});
