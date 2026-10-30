import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),hook=registerHooks({resolve(s,c,n){return n(s==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:s,c);}});
const {NextRequest}=await import('next/server.js');
const {GET}=await import('@/app/api/gmail/callback/route');
const {seal,unseal}=await import('@/lib/gmail/server');
const original=globalThis.fetch,names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GMAIL_TOKEN_KEY','APP_ORIGIN','CRON_SECRET'];
const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));after(()=>{globalThis.fetch=original;hook.deregister();for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});
const user='11111111-1111-4111-8111-111111111111';
function fixture(mode:'normal'|'busy'|'failed'|'first'|'wrong-mail'|'lease-lost'|'first-race'|'setup'='normal'){
 for(const k of names)process.env[k]='synthetic';process.env.NEXT_PUBLIC_SUPABASE_URL='https://recovery-test.supabase.co';process.env.APP_ORIGIN='https://budget.example';process.env.GMAIL_TOKEN_KEY='ab'.repeat(32);
 let row:any=['first','first-race'].includes(mode)?null:{user_id:user,email:'person@example.com',refresh_token:'OLD PRIVATE',last_error:'Reconnect Gmail',start_date:'2026-09-01',last_synced_at:'2026-10-29T10:00:00Z',page_token:'financial-page',scan_after:123,scan_started_at:'2026-10-30T10:00:00Z',receipt_scan:{before:456,pending:['receipt'],token:'receipt-page'},aliases:{'bank:1234':'account'},lease_id:null,lease_until:null};
 const before=structuredClone(row),writes:any[]=[],calls:string[]=[];let lease='';
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method??'GET';calls.push(url.pathname);
  const body=typeof init?.body==='string'&&init.body.startsWith('{')?JSON.parse(init.body):undefined;
  if(url.pathname==='/auth/v1/user')return json({id:user,email:'person@example.com',role:'authenticated',aud:'authenticated'});
  if(url.hostname==='oauth2.googleapis.com')return mode==='setup'?json({error:'invalid_client'},401):mode==='failed'?json({error:'temporarily_unavailable',error_description:'PRIVATE TOKEN'},503):json({access_token:'synthetic',refresh_token:'NEW PRIVATE',scope:'https://www.googleapis.com/auth/gmail.readonly'});
  if(url.hostname==='gmail.googleapis.com')return json({emailAddress:mode==='wrong-mail'?'other@example.com':'person@example.com'});
  if(url.pathname.endsWith('/rpc/gmail_acquire_lease')){lease=body.p_lease;return json(mode!=='busy');}
  if(url.pathname.endsWith('/gmail_connections')){
   if(method==='GET')return json(row);
   writes.push(body);
   if(method==='PATCH'){
    assert.equal(url.searchParams.get('lease_id'),`eq.${lease}`);
    if(body.refresh_token){assert.deepEqual(Object.keys(body).sort(),['last_error','refresh_token']);assert.ok(url.searchParams.get('lease_until')?.startsWith('gt.'));if(mode==='lease-lost')return json(null);row={...row,...body};return json({user_id:user});}
    row={...row,...body};return json(null);
   }
   assert.equal(method,'POST');assert.ok(!url.searchParams.has('on_conflict'),'New connection must not upsert over a racing connection');if(mode==='first-race'){row={user_id:user,page_token:'racing-scan',refresh_token:'RACING PRIVATE'};return json({message:'Synthetic duplicate',code:'23505'},409);}row=body;return json({user_id:user});
  }
  throw Error(`Unexpected synthetic request ${method} ${url.pathname}`);
 };
 const encoded=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url'),access=`${encoded({alg:'HS256',typ:'JWT'})}.${encoded({sub:user,exp:Math.floor(Date.now()/1000)+3600})}.synthetic`;
 const session=`base64-${encoded({access_token:access,refresh_token:'synthetic-auth-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:user,email:'person@example.com'}})}`;
 const cookie=seal(JSON.stringify({userId:user,state:'state',verifier:'verifier',startDate:'2026-10-01',expires:Date.now()+600000}),'oauth');
 return {before,writes,calls,get row(){return row;},async run(){return GET(new NextRequest('https://budget.example/api/gmail/callback?state=state&code=synthetic-code',{headers:{cookie:`sb-recovery-test-auth-token=${session}; gmail_oauth=${cookie}`}}));}};
}
test('reconnection replaces only encrypted credentials/error under a lease and preserves both cursors and history',async()=>{
 const f=fixture(),response=await f.run();assert.equal(new URL(response.headers.get('location')!).searchParams.get('gmail'),'connected');
 const {refresh_token:_old,last_error:_error,...before}=f.before,{refresh_token:newToken,last_error:newError,...after}=f.row;
 assert.deepEqual(after,before);assert.equal(newError,null);assert.equal(unseal(newToken,user),'NEW PRIVATE');assert.ok(!newToken.includes('PRIVATE'));assert.equal(f.writes.length,2);assert.equal(response.cookies.get('gmail_oauth')?.value,'');
});
test('busy sync and failed OAuth keep the old credential and saved scan',async()=>{
 for(const mode of ['busy','failed','wrong-mail'] as const){const f=fixture(mode),response=await f.run();assert.equal(new URL(response.headers.get('location')!).searchParams.get('gmail'),mode==='busy'?'busy':'failed');assert.deepEqual(f.row,f.before);assert.equal(f.writes.some(w=>w.refresh_token),false);if(mode==='busy')assert.equal(f.calls.includes('/token'),false);}
});
test('a first connection inserts a fresh record without overwriting an existing identity',async()=>{
 const f=fixture('first'),response=await f.run();assert.equal(new URL(response.headers.get('location')!).searchParams.get('gmail'),'connected');assert.equal(f.row.start_date,'2026-10-01');assert.equal(f.calls.includes('/rpc/gmail_acquire_lease'),false);assert.equal(f.writes.length,1);assert.equal(f.row.page_token,undefined);
});
test('a lost lease or racing first connection cannot overwrite newer progress',async()=>{
 const lost=fixture('lease-lost'),response=await lost.run();assert.equal(new URL(response.headers.get('location')!).searchParams.get('gmail'),'busy');assert.deepEqual(lost.row,lost.before);
 const racing=fixture('first-race'),failure=await racing.run();assert.equal(new URL(failure.headers.get('location')!).searchParams.get('gmail'),'failed');assert.equal(racing.row.page_token,'racing-scan');assert.equal(racing.row.refresh_token,'RACING PRIVATE');
});
test('OAuth client configuration failures redirect to setup help without discarding the old connection',async()=>{
 const f=fixture('setup'),response=await f.run();assert.equal(new URL(response.headers.get('location')!).searchParams.get('gmail'),'setup');assert.deepEqual(f.row,f.before);
});
