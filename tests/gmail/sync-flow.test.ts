import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const require=createRequire(import.meta.url);
const hook=registerHooks({resolve(specifier,context,next){return next(specifier==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:specifier,context);}});
const {syncMailbox}=await import('@/lib/gmail/sync');
const {seal}=await import('@/lib/gmail/server');
const user='11111111-1111-4111-8111-111111111111';
const originalFetch=globalThis.fetch;
const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GMAIL_TOKEN_KEY','APP_ORIGIN','CRON_SECRET'];
const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
after(()=>{globalThis.fetch=originalFetch;hook.deregister();for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});

test('real sync retries an interrupted review upgrade and matches a credit before categorization without ledger writes',async()=>{
 for(const name of names)process.env[name]='synthetic';
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.example';process.env.GMAIL_TOKEN_KEY='ab'.repeat(32);
 const connection={refresh_token:seal('synthetic-refresh',user),start_date:'2026-10-01',aliases:{},last_synced_at:null};
 let mail:{status:string;parser_version:number}={status:'review',parser_version:0};
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
   const text='Rs.14235.67 has been successfully credited to your HDFC Bank account ending in 1234. Transaction Details: a. Date: 15-10-26 b. Sender: EXAMPLE PERSON c. UPI Reference No.: 991234567890';
   return json({internalDate:String(Date.parse('2026-10-15T05:00:00Z')),payload:{mimeType:'text/plain',headers:[{name:'From',value:'alerts@hdfcbank.bank.in'},{name:'Subject',value:'View: Account update for your HDFC Bank A/c'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=hdfcbank.bank.in'}],body:{data:Buffer.from(text).toString('base64url')}}});
  }
  assert.equal(url.hostname,'database.example');
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url.pathname.endsWith('/rpc/gmail_acquire_lease'))return json(true);
  if(url.pathname.endsWith('/rpc/gmail_match_recorded')){
   assert.equal(body.p_authenticated,true);assert.equal(body.p_message,'credit');
   if(failMatch){failMatch=false;return json({message:'Synthetic transient failure',code:'500'},500);}
   mail.status='logged';return json('matched');
  }
  if(url.pathname.endsWith('/gmail_connections'))return json(method==='GET'?connection:null);
  if(url.pathname.endsWith('/accounts'))return json([{id:'bank',name:'HDFC',type:'BANK',hint:'1234',is_active:true}]);
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
    assert.match(url.searchParams.get('or')!,/status\.eq\.pending,and\(status\.eq\.review,parser_version\.lt\.1\)/);
    return json(mail.status==='review'&&mail.parser_version<1?[{message_id:'credit'}]:[]);
   }
   return json([]);
  }
  throw Error(`Unexpected synthetic request: ${method} ${url.pathname}`);
 };
 await assert.rejects(syncMailbox(user));
 assert.equal(mail.status,'review');assert.equal(mail.parser_version,0,'Failure must not consume the parser upgrade');
 assert.equal(updates.some(p=>'parser_version' in p),false);
 const result=await syncMailbox(user);
 assert.deepEqual(result,{logged:0,reviewed:0,matched:1,more:false});
 assert.equal(mail.status,'logged');assert.equal(mail.parser_version,1);
 assert.equal(calls.some(c=>c.includes('gmail_commit_classified')),false,'Credit was matched before financial-purpose review');
 assert.equal(calls.filter(c=>c.endsWith('/rpc/gmail_match_recorded')).length,2);
});
