import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
const require=createRequire(import.meta.url);
const hook=registerHooks({resolve(s,c,n){return n(s==='next/server'?pathToFileURL(require.resolve('next/server.js')).href:s,c);}});
const {syncFoodReceipts}=await import('@/lib/gmail/receipt-sync');
const original=globalThis.fetch;after(()=>{globalThis.fetch=original;hook.deregister();});
const user='11111111-1111-4111-8111-111111111111',clock=Date.parse('2026-10-30T11:00:00Z');
const db=createClient('https://database.example','synthetic',{auth:{persistSession:false,autoRefreshToken:false}});
function fixture(){
 let state:any={},failMail='',mailStatus=503,failAck=false,failList=0,leaseLost=false,now=clock,stopAfterLink=false;
 const queries:string[]=[],fetched:string[]=[],linked:string[]=[],acknowledged:string[]=[],rpcs:any[]=[];
 const payments:any[]=[{id:'strong',user_id:user,type:'EXPENSE',amount:50000,date:'2026-10-29',description:'Zomato',account_id:'bank',notes:'Order ID: 1234567890',source:'manual'}];
 const json=(data:unknown,status=200,count?:number)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...(count!==undefined?{'content-range':`0-${Math.max(count-1,0)}/${count}`}:{})}});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=init?.method??'GET';
  if(url.hostname==='gmail.googleapis.com'){
   if(url.pathname.endsWith('/messages')){queries.push(url.search);if(failList)return json({},failList);return json(url.searchParams.has('pageToken')?{messages:[{id:'page2'}]}:{messages:[{id:'strong'},{id:'weak'}],nextPageToken:'next'});}
   const id=url.pathname.split('/').at(-1)!;fetched.push(id);if(id===failMail)return json({},mailStatus);
   const text=`Delivered Example Cafe Shop 1, Mumbai 1 X Tea ORDER ID: ${id==='weak'?'2222222222':'1234567890'} Total paid ₹500`;
   return json({internalDate:String(Date.parse('2026-10-29T15:00:00Z')),payload:{mimeType:'text/plain',headers:[{name:'From',value:'noreply@zomato.com'},{name:'Subject',value:'Your Zomato order from Example Cafe'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=zomato.com'}],body:{data:Buffer.from(text).toString('base64url')}}});
  }
  assert.equal(url.hostname,'database.example');assert.equal(url.searchParams.get('user_id'),method==='POST'?null:`eq.${user}`);
  if(url.pathname.endsWith('/gmail_connections')){
   assert.equal(method,'PATCH');assert.equal(url.searchParams.get('lease_id'),'eq.lease');assert.ok(url.searchParams.get('lease_until')?.startsWith('gt.'));
   if(leaseLost)return json(null);
   const next=JSON.parse(String(init?.body)).receipt_scan;
   if(failAck&&state.pending?.length>next.pending?.length){failAck=false;return json({message:'Synthetic checkpoint error'},503);}
   if(state.pending?.length>next.pending?.length)acknowledged.push(state.pending[0]);state=next;return json({user_id:user});
  }
  if(url.pathname.endsWith('/transactions')){assert.equal(method,'GET');return json(payments,200,payments.length);}
  if(url.pathname.endsWith('/food_receipt_details'))return json(null);
  if(url.pathname.endsWith('/rpc/link_food_receipt')){
   const p=JSON.parse(String(init?.body));rpcs.push(p);assert.equal(p.p_user,user);assert.equal(p.p_confirmed,false);assert.deepEqual(p.p_expected,payments.find(t=>t.id===p.p_transaction));
   if(stopAfterLink)now=clock+40000;
   if(linked.includes(p.p_message))return json('already_linked');linked.push(p.p_message);return json('linked');
  }
  throw Error(`Unexpected request ${method} ${url.pathname}`);
 };
 return {get state(){return state;},set state(s){state=s;},queries,fetched,linked,acknowledged,rpcs,payments,
  fail(id:string,status=503){failMail=id;mailStatus=status;},failList(status:number){failList=status;},failAck(){failAck=true;},loseLease(){leaseLost=true;},stopAfterLink(){stopAfterLink=true;},
  run(){return syncFoodReceipts({db,userId:user,lease:'lease',accessToken:'synthetic',state,startDate:'2026-10-01',deadline:clock+45000,now:()=>now});}};
}
test('scheduled discovery advances beyond newest page, auto-links only exact references and preserves weak matches',async()=>{
 const f=fixture(),financial=structuredClone(f.payments);
 assert.deepEqual(await f.run(),{checked:2,linked:1,more:true});
 assert.deepEqual(f.linked,['strong']);assert.equal(f.state.token,'next');const before=f.state.before;
 assert.deepEqual(await f.run(),{checked:1,linked:1,more:false});assert.deepEqual(f.payments,financial);
 assert.ok(f.state.completedAt);assert.equal(f.state.before,undefined);assert.deepEqual(f.fetched,['strong','weak','page2']);
 assert.equal(new URLSearchParams(f.queries[1]).get('pageToken'),'next');assert.equal(new URLSearchParams(f.queries[1]).get('q')?.includes(`before:${before}`),true);
 assert.equal(f.rpcs.some(p=>p.p_message==='weak'),false,'Equal amount/day without order proof cannot link');
});
test('transient mail failures keep queued IDs and fixed interval for retry',async()=>{
 const f=fixture();f.fail('weak');await assert.rejects(f.run());
 assert.deepEqual(f.state.pending,['weak']);assert.equal(f.state.loaded,true);assert.equal(f.state.token,undefined);const before=f.state.before;
 f.fail('');await f.run();assert.equal(f.queries.length,1,'Resume queued page instead of rediscovering');assert.equal(f.state.before,before);assert.deepEqual(f.linked,['strong']);
});
test('interruption after linking replays idempotently; deadline preserves unprocessed queue',async()=>{
 const f=fixture();f.failAck();await assert.rejects(f.run());assert.deepEqual(f.state.pending,['strong','weak']);
 const result=await f.run();assert.equal(result.linked,0);assert.deepEqual(f.linked,['strong']);assert.equal(f.queries.length,1);
 const bounded=fixture();bounded.stopAfterLink();assert.deepEqual(await bounded.run(),{checked:1,linked:1,more:true});assert.deepEqual(bounded.state.pending,['weak']);
});
test('only an expired 400 cursor resets; authorization/rate-limit/server failures preserve cursor',async()=>{
 for(const status of [403,429,503]){
  const f=fixture();f.state={after:100,before:200,token:'old'};f.failList(status);await assert.rejects(f.run());assert.equal(f.state.token,'old');assert.equal(f.queries.length,1);
 }
 const f=fixture();f.state={after:100,before:200,token:'old'};f.failList(400);await assert.rejects(f.run());assert.equal(f.state.token,undefined);assert.equal(f.state.before,200);assert.equal(f.queries.length,2);
});
test('deleted email is consumed, and a lost lease cannot move discovery',async()=>{
 const f=fixture();f.fail('weak',404);await f.run();assert.deepEqual(f.acknowledged,['strong','weak']);
 const lost=fixture();lost.loseLease();await assert.rejects(lost.run(),/paused safely/);assert.equal(lost.queries.length,0);
});
test('ambiguous exact references never call link; subsequent scans use a seven-day overlap',async()=>{
 const f=fixture();f.payments.push({...f.payments[0],id:'duplicate'});await f.run();assert.equal(f.rpcs.length,0);
 const g=fixture();g.state={completedAt:'2026-10-29T11:00:00Z'};await g.run();
 const q=new URLSearchParams(g.queries[0]).get('q')!;assert.ok(q.includes(`after:${Math.floor((Date.parse('2026-10-29T11:00:00Z')-7*86400000)/1000)}`));
});
