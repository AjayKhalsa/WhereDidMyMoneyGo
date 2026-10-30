import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),hook=registerHooks({resolve(s,c,n){return n(s==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:s,c);}});
const {google,GmailError,GoogleRequestError,failure}=await import('@/lib/gmail/server');
const original=globalThis.fetch;after(()=>{globalThis.fetch=original;hook.deregister();});
const token='https://oauth2.googleapis.com/token',mail='https://gmail.googleapis.com/gmail/v1/users/me/messages';
async function errorFor(url:string,status:number,payload:unknown,headers:Record<string,string>={}){
 globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json',...headers}});
 try{await google(url,{});throw Error('Expected failure');}catch(e){return e as InstanceType<typeof GmailError>;}
}
test('only revoked/expired grants and missing Gmail permission ask for reconnection',async()=>{
 const revoked=await errorFor(token,400,{error:'invalid_grant',error_description:'PRIVATE TOKEN'});assert.equal(revoked.code,'gmail_reconnect_required');assert.equal(revoked.status,401);
 const client=await errorFor(token,401,{error:'invalid_client',error_description:'PRIVATE TOKEN'});assert.equal(client.code,'gmail_server_setup');assert.equal(client.status,503);
 const unknown=await errorFor(token,400,{error:'unknown'});assert.ok(unknown instanceof GoogleRequestError);assert.equal(unknown.upstreamStatus,400);assert.notEqual(unknown.code,'gmail_reconnect_required');
 const forbidden=await errorFor(mail,403,{error:{errors:[{reason:'insufficientPermissions',message:'PRIVATE EMAIL'}]}});assert.equal(forbidden.code,'gmail_reconnect_required');
 const cursor=await errorFor(mail,400,{error:{message:'Invalid cursor'}});assert.ok(cursor instanceof GoogleRequestError);assert.equal(cursor.upstreamStatus,400);
 for(const error of [revoked,client,unknown,forbidden,cursor]){const output=await failure(error).text();assert.ok(!output.includes('PRIVATE'));}
});
test('quota, outages, malformed responses and network failures preserve controlled retry metadata',async()=>{
 const quota=await errorFor(mail,403,{error:{errors:[{reason:'userRateLimitExceeded'}]}},{'retry-after':'60'});assert.equal(quota.code,'google_rate_limited');assert.equal(quota.retryAfterSeconds,60);assert.equal(failure(quota).headers.get('retry-after'),'60');
 const throttled=await errorFor(mail,429,{}, {'retry-after':new Date(Date.now()+60000).toUTCString()});assert.ok(throttled.retryAfterSeconds!>30);
 const outage=await errorFor(token,503,{error:'temporarily_unavailable',error_description:'PRIVATE TOKEN'});assert.equal(outage.code,'google_temporary_failure');
 globalThis.fetch=async()=>{throw Error('PRIVATE TOKEN network error');};await assert.rejects(google(mail,{}),(e:unknown)=>e instanceof GoogleRequestError&&e.upstreamStatus===0&&!e.message.includes('PRIVATE'));
 globalThis.fetch=async()=>new Response('PRIVATE INVALID JSON');await assert.rejects(google(mail,{}),GoogleRequestError);
});
