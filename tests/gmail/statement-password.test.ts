import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url), hook = registerHooks({ resolve(s,c,n) { return n(s === 'next/server' ? pathToFileURL(require.resolve('next/server.js')).href : s,c); } });
const { NextRequest } = await import('next/server.js');
const { POST, GET, DELETE } = await import('@/app/api/gmail/statements/route');
const { unseal } = await import('@/lib/gmail/server');
const original = globalThis.fetch, keys = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GMAIL_TOKEN_KEY','APP_ORIGIN','CRON_SECRET'];
const previous = Object.fromEntries(keys.map(k=>[k,process.env[k]]));
after(()=>{ globalThis.fetch=original;hook.deregister();for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];} });
const user='11111111-1111-4111-8111-111111111111';
function fixture(owned=true){
  for(const k of keys)process.env[k]='synthetic';process.env.NEXT_PUBLIC_SUPABASE_URL='https://statement-test.supabase.co';process.env.APP_ORIGIN='https://budget.example';process.env.GMAIL_TOKEN_KEY='ab'.repeat(32);
  const writes:any[]=[];let encrypted:string|undefined;
  const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method??'GET';
    if(url.pathname==='/auth/v1/user')return json({id:user,email:'person@example.com',role:'authenticated',aud:'authenticated'});
    const body=init?.body?JSON.parse(String(init.body)):undefined;
    if(url.pathname.endsWith('/accounts')){assert.equal(url.searchParams.get('user_id'),`eq.${user}`);return json(owned?{id:'card',type:'CREDIT_CARD'}:null);}
    if(url.pathname.endsWith('/rpc/gmail_acquire_lease'))return json(false); // Saving a password remains safe while another sync owns the lease.
    if(url.pathname.endsWith('/statement_credentials')){
      if(method==='POST'){assert.equal(body.user_id,user);encrypted=body.sealed_password;writes.push(body);return json(null);}
      assert.equal(url.searchParams.get('user_id'),`eq.${user}`);assert.equal(url.searchParams.get('account_id'),'eq.card');
      if(method==='DELETE'){encrypted=undefined;return json(null);}
      assert.equal(url.searchParams.get('select'),'account_id','Never return the encrypted password to the browser');return json(encrypted?{account_id:'card'}:null);
    }
    if(url.pathname.endsWith('/financial_mail_evidence')){assert.equal(url.searchParams.get('user_id'),`eq.${user}`);return json(method==='PATCH'?null:[]);}
    throw Error('Unexpected request '+url.pathname);
  };
  const enc=(o:object)=>Buffer.from(JSON.stringify(o)).toString('base64url'),token=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:user,exp:Math.floor(Date.now()/1000)+3600})}.synthetic`;
  const session=`base64-${enc({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:user}})}`;
  const req=(method:string,body?:object,origin='https://budget.example')=>new NextRequest('https://budget.example/api/gmail/statements?accountId=card',{method,headers:{origin,'content-type':'application/json',cookie:`sb-statement-test-auth-token=${session}`},...(body?{body:JSON.stringify(body)}:{})});
  return{writes,req,get encrypted(){return encrypted;}};
}
test('PDF passwords are encrypted with the account scope, never returned, and removable',async()=>{
  const f=fixture(),secret='Synthetic-PDF-password';
  const response=await POST(f.req('POST',{accountId:'card',password:secret}));assert.equal(response.status,200);assert.equal((await response.json()).saved,true);
  assert.ok(f.encrypted&&!f.encrypted.includes(secret));assert.equal(unseal(f.encrypted!,`${user}:statement:card`),secret);
  assert.throws(()=>unseal(f.encrypted!,`${user}:statement:foreign`));
  const status=await(await GET(f.req('GET'))).json();assert.equal(status.configured,true);assert.ok(!JSON.stringify(status).includes(secret));
  assert.equal((await DELETE(f.req('DELETE',{accountId:'card'}))).status,200);assert.equal(f.encrypted,undefined);
});
test('foreign accounts, cross-origin writes and invalid passwords cannot save credentials',async()=>{
  const foreign=fixture(false);assert.equal((await POST(foreign.req('POST',{accountId:'card',password:'secret'}))).status,400);assert.equal(foreign.writes.length,0);
  const f=fixture();assert.equal((await POST(f.req('POST',{accountId:'card',password:'secret'},'https://attacker.example'))).status,403);
  assert.equal((await POST(f.req('POST',{accountId:'card',password:''}))).status,400);assert.equal(f.writes.length,0);
});
