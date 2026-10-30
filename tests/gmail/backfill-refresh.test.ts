import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const hook=registerHooks({resolve(s,c,next){return next(s==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:s,c);}});
const {scanBackfill}=await import('@/lib/gmail/backfill');
const {seal}=await import('@/lib/gmail/server');
const originalFetch=globalThis.fetch;
const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GMAIL_TOKEN_KEY','APP_ORIGIN','CRON_SECRET'];
const env=Object.fromEntries(names.map(k=>[k,process.env[k]]));
after(()=>{globalThis.fetch=originalFetch;hook.deregister();for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
test('explicit refresh starts one new preview, continuation resumes it, and dismissed mail is never reopened',async()=>{
 for(const name of names)process.env[name]='synthetic';
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.example';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';process.env.GMAIL_TOKEN_KEY='ab'.repeat(32);
 const user='11111111-1111-4111-8111-111111111111';
 let run:any={id:'old',start_date:'2026-07-18',end_date:'2026-10-18',status:'complete',discovery_complete:true};
 let inserts=0,discovery=0,mailFetches=0;const itemUpdates:any[]=[];
 const json=(v:unknown)=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json','content-range':Array.isArray(v)?`0-${Math.max(0,v.length-1)}/${v.length}`:'*/0'}});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method??'GET';
  if(url.hostname==='oauth2.googleapis.com')return json({access_token:'synthetic'});
  if(url.hostname==='gmail.googleapis.com'){
   if(url.pathname.endsWith('/messages')){discovery++;assert.match(url.searchParams.get('q')!,/protect@cred.club/);return json({messages:[{id:'dismissed'}],nextPageToken:'next'});}
   mailFetches++;throw Error('Dismissed email must not be fetched');
  }
  assert.equal(url.hostname,'database.example');
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url.pathname.endsWith('/rpc/gmail_acquire_lease'))return json(true);
  if(url.pathname.endsWith('/gmail_connections'))return json(method==='GET'?{refresh_token:seal('refresh',user),aliases:{}}:null);
  if(url.pathname.endsWith('/gmail_backfill_runs')){
   if(method==='POST'){inserts++;run={...body,status:'scanning',discovery_complete:false};return json(run);}
   if(method==='PATCH'){run={...run,...body};return json(null);}
   return json(url.searchParams.has('status')?(run.status==='complete'?null:run):run);
  }
  if(url.pathname.endsWith('/gmail_backfill_items')){
   if(method==='POST')return json(null);
   if(method==='PATCH'){itemUpdates.push(body);return json(null);}
   return json(run.id==='old'?[]:url.searchParams.has('status')?[{message_id:'dismissed',attempts:0}]:[{message_id:'dismissed',status:itemUpdates.length?'ignored':'pending'}]);
  }
  if(url.pathname.endsWith('/gmail_messages'))return json([{message_id:'dismissed',status:'ignored'}]);
  if(url.pathname.endsWith('/profiles'))return json({name:'Synthetic Owner'});
  assert.equal(method,'GET','Preview must never write ledger, sources, rules or subscriptions');
  return json([]);
 };
 await scanBackfill(user,{start:'2026-07-18',end:'2026-10-18'});assert.equal(inserts,0);assert.equal(discovery,0);
 await scanBackfill(user,{start:'2026-07-18',end:'2026-10-18',refresh:true});assert.equal(inserts,1);assert.equal(discovery,1);assert.equal(itemUpdates[0].status,'ignored');assert.equal(mailFetches,0);
 await scanBackfill(user);assert.equal(inserts,1,'Continuation must not start another preview');assert.equal(discovery,2);assert.equal(mailFetches,0);
});
